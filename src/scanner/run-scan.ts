/**
 * Real scan — scanners + probes, writes to DB
 */

import { loadConfig } from "../config/config-loader";
import { getDatabase } from "../db/database";
import { runAllScanners } from "./index";
import { enrichWithProbes } from "../engine/probe-engine";
import { emitScanEvents } from "../events/event-emitter";
import type { SnapshotSummary, VersionEntry, ToolCategory, UpdateType } from "../schema/types";

function buildSummary(tools: VersionEntry[]): SnapshotSummary["summary"] {
  const byUpdateType: Record<UpdateType, number> = {
    major: 0,
    minor: 0,
    patch: 0,
    unknown: 0,
    none: 0,
    null: 0,
  };
  const byCategory: Record<ToolCategory, number> = {
    os: 0,
    apt: 0,
    snap: 0,
    runtime: 0,
    tools: 0,
    container: 0,
    systemd: 0,
    pm2: 0,
  };

  for (const t of tools) {
    byUpdateType[t.update_type]++;
    byCategory[t.category]++;
  }

  return {
    total: tools.length,
    outdated: tools.filter((t) => t.is_outdated).length,
    untracked: tools.filter((t) => t.tool_status === "untracked").length,
    probe_failed: tools.filter((t) => t.probe_status === "failed").length,
    by_update_type: byUpdateType,
    by_category: byCategory,
  };
}

export async function runScan(): Promise<{ snapshot: SnapshotSummary; snapshotId: number }> {
  const config = loadConfig();
  const db = getDatabase(config.dbPath);

  const discovered = await runAllScanners();
  const valid = discovered.filter((d) => d?.name);
  const ignored = new Set((config.settings.ignored_tools ?? []).map((s) => s.toLowerCase()));
  const filtered = valid.filter((d) => !ignored.has(d.name.toLowerCase()));
  const tools = await enrichWithProbes(filtered, config);

  const hostname = await getHostname();
  const scannedAt = new Date().toISOString();
  const summary = buildSummary(tools);

  const snapshot: SnapshotSummary = {
    schema_version: "1",
    scanned_at: scannedAt,
    hostname,
    summary,
    tools,
  };

  const snapResult = db.run(
    `INSERT INTO snapshots (scanned_at, hostname, total_tools, outdated, probe_failed, untracked, scan_status, payload_json)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    scannedAt,
    hostname,
    summary.total,
    summary.outdated,
    summary.probe_failed,
    summary.untracked,
    "completed",
    JSON.stringify(snapshot)
  );
  const scanId = snapResult.lastInsertRowId as number;

  const prevSnapshot = db.query("SELECT payload_json FROM snapshots WHERE id < ? ORDER BY id DESC LIMIT 1").get(scanId) as
    | { payload_json: string }
    | undefined;
  const previousTools = prevSnapshot ? (JSON.parse(prevSnapshot.payload_json) as SnapshotSummary).tools : [];
  await emitScanEvents(db, config, tools, previousTools, scanId, hostname);

  for (const t of tools) {
    const existing = db.query("SELECT first_seen_at FROM tools WHERE name = ?").get(t.name) as
      | { first_seen_at: string }
      | undefined;
    const firstSeen = existing?.first_seen_at ?? t.first_seen_at;

    db.run(
      `INSERT INTO tools (name, display_name, category, tool_status, current_version, latest_version, is_outdated, update_type, latest_release_date, probe_type, probe_status, probe_source, probe_error, repo_url, release_notes, release_notes_source, last_checked_at, first_seen_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(name) DO UPDATE SET
         display_name=excluded.display_name, category=excluded.category, tool_status=excluded.tool_status,
         current_version=excluded.current_version, latest_version=excluded.latest_version,
         is_outdated=excluded.is_outdated, update_type=excluded.update_type,
         latest_release_date=excluded.latest_release_date, probe_type=excluded.probe_type,
         probe_status=excluded.probe_status, probe_source=excluded.probe_source,
         probe_error=excluded.probe_error, repo_url=excluded.repo_url,
         last_checked_at=excluded.last_checked_at`,
      t.name,
      t.display_name,
      t.category,
      t.tool_status,
      t.current_version,
      t.latest_version,
      t.is_outdated ? 1 : 0,
      t.update_type,
      t.latest_release_date,
      t.probe_type,
      t.probe_status,
      t.probe_source,
      t.probe_error,
      t.repo_url,
      t.release_notes,
      t.release_notes_source,
      t.last_checked_at,
      firstSeen
    );
  }

  return { snapshot, snapshotId };
}

async function getHostname(): Promise<string> {
  try {
    const proc = Bun.spawn(["hostname"], { stdout: "pipe", stderr: "pipe" });
    const out = await new Response(proc.stdout).text();
    await proc.exited;
    return out.trim() || "localhost";
  } catch {
    return "localhost";
  }
}
