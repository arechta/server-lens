#!/usr/bin/env bun
/**
 * server-lens — CLI entry point
 * Snapshot server state. Stage 1 of DevOps pipeline.
 * @see AGENTS.md
 */

import React from "react";
import { render } from "ink";
import { App } from "./ui/app";
import { loadConfig } from "./config/config-loader";
import { getDatabase } from "./db/database";
import { getLatestSnapshot, getSnapshotList } from "./db/snapshots-repo";
import { getEvents } from "./db/events-repo";
import { getToolByName } from "./db/tools-repo";
import { getTheme } from "./ui/theme";
import type { SnapshotSummary, VersionEntry } from "./schema/types";
import type { AlertItem } from "./ui/components/alert-bar";
import type { ScanLogEntry } from "./ui/pages/scan";
import { existsSync } from "fs";
import { parseExpression } from "cron-parser";

const args = process.argv.slice(2);
const subcommand = args[0];
const hasJson      = args.includes("--json");
const hasOutdated  = args.includes("--outdated");
const hasQuiet     = args.includes("--quiet");
const hasDryRun    = args.includes("--dry-run");
const hasWithNotes = args.includes("--with-notes");
const hasNow       = args.includes("--now");
const hasDebug     = args.includes("--debug");

const categoryIdx  = args.indexOf("--category");
const categoryName = categoryIdx >= 0 ? args[categoryIdx + 1] : null;
const outputIdx    = args.indexOf("--output");
const outputFile   = outputIdx >= 0 && args[outputIdx + 1] ? args[outputIdx + 1] : null;

// ─── server-lens scan ────────────────────────────────────────────────────────
if (subcommand === "scan") {
  const { runScan } = await import("./scanner/run-scan");
  const { setDebugEnabled, debugLog } = await import("./utils/debug-log");

  if (hasDebug) {
    setDebugEnabled(true);
    const cfg = loadConfig();
    const token = cfg.auth?.github_token;
    debugLog(`config path: ${cfg.configPath}`);
    debugLog(`db path: ${cfg.dbPath}`);
    debugLog(`auth.github_token: ${token ? `present (${token.slice(0, 8)}…${token.slice(-4)}, len=${token.length})` : "NOT SET — add github_token under [auth] in server-lens.toml"}`);
    debugLog(`probes in config: ${(cfg.probes ?? []).map((p) => p.name).join(", ") || "(none)"}`);
  }

  if (hasQuiet) {
    // Silent mode for cron — no terminal output at all
    await runScan({ quiet: true, dryRun: hasDryRun, withNotes: hasWithNotes });
    process.exit(0);
  }

  // Interactive: render Ink ScanScreen with live probe log
  const config = loadConfig();
  let currentProbe = "";
  let probedCount = 0;
  let scanPhase: "scanning" | "done" | "error" = "scanning";
  let scanErr = "";
  const scanLog: ScanLogEntry[] = [];

  const makeEl = () =>
    React.createElement(App, {
      screen: "scan" as const,
      scanPhase,
      scanCurrentTool: currentProbe,
      scanTotalProbed: probedCount,
      scanDryRun: hasDryRun,
      scanErrorMsg: scanErr,
      scanLog: [...scanLog],
      themeName: config.theme?.name ?? "claude",
      themeTokens: config.theme as Record<string, string | undefined> | undefined,
    });

  const instance = render(makeEl());

  // Throttle rerenders to at most once per 80ms so fast-completing probes (e.g. apt
  // batch Map lookups that all resolve in the same tick) are visible as a live
  // incrementing counter rather than jumping straight to the final number.
  // The natural-height ScanScreen grows one line per entry.
  const THROTTLE_MS = 80;
  let _lastRender = 0;
  let _pending: ReturnType<typeof setTimeout> | null = null;
  function scheduleRerender() {
    if (_pending) return; // already scheduled for next window
    const now = Date.now();
    const wait = THROTTLE_MS - (now - _lastRender);
    if (wait <= 0) {
      _lastRender = now;
      instance.rerender(makeEl());
    } else {
      _pending = setTimeout(() => {
        _pending = null;
        _lastRender = Date.now();
        instance.rerender(makeEl());
      }, wait);
    }
  }

  try {
    await runScan({
      dryRun: hasDryRun,
      withNotes: hasWithNotes,
      onProgress: (name: string) => {
        currentProbe = name;
        // Phase messages (discovery/apt) carry their own "(N done)" count — don't double-count
        if (!name.includes(" found)") && !name.includes(" done)") && !name.endsWith("…")) probedCount++;
        scheduleRerender();
      },
      onProbeComplete: (entry, durationMs) => {
        scanLog.push({
          name: entry.display_name ?? entry.name,
          probeType: entry.probe_type,
          currentVersion: entry.current_version,
          latestVersion: entry.latest_version,
          isOutdated: entry.is_outdated,
          probeFailed: entry.probe_status === "failed",
          updateType: entry.update_type,
          durationMs,
        });
        scheduleRerender();
      },
    });
    scanPhase = "done";
    instance.rerender(makeEl());
    await new Promise((r) => setTimeout(r, 600));
  } catch (err) {
    scanPhase = "error";
    scanErr = err instanceof Error ? err.message : String(err);
    instance.rerender(makeEl());
    await new Promise((r) => setTimeout(r, 1200));
    instance.unmount();
    process.exit(1);
  }

  instance.unmount();

  if (!hasNow) {
    if (!hasDryRun) console.log("Scan complete. Run 'server-lens' to view results.");
    process.exit(0);
  }
  // --now: fall through to display mode below
}

// ─── server-lens install ─────────────────────────────────────────────────────
if (subcommand === "install") {
  const { runInstall } = await import("./cli/install");
  await runInstall(args.slice(1));
  process.exit(0);
}

// ─── server-lens notes <tool> ────────────────────────────────────────────────
if (subcommand === "notes") {
  const toolNameArg = args[1];
  if (!toolNameArg) {
    console.error("Usage: server-lens notes <tool-name>");
    process.exit(1);
  }
  const config = loadConfig();
  let tool: VersionEntry | null = null;
  if (existsSync(config.dbPath)) {
    const db = getDatabase(config.dbPath);
    tool = getToolByName(db, toolNameArg);
  }
  const { waitUntilExit } = render(
    React.createElement(App, {
      screen: "notes" as const,
      toolName: toolNameArg,
      notesTool: tool,
      themeName: config.theme?.name ?? "claude",
      themeTokens: config.theme as Record<string, string | undefined> | undefined,
    })
  );
  await waitUntilExit();
  process.exit(0);
}

// ─── server-lens status ──────────────────────────────────────────────────────
if (subcommand === "status") {
  const config = loadConfig();
  let statusData = null;

  if (existsSync(config.dbPath)) {
    const db = getDatabase(config.dbPath);
    const lastSnap = db.query(
      "SELECT * FROM snapshots ORDER BY id DESC LIMIT 1"
    ).get() as {
      scanned_at: string;
      total_tools: number;
      outdated: number;
      probe_failed: number;
      untracked: number;
      scan_status: string;
    } | undefined;

    if (lastSnap) {
      let nextScan = "—";
      try {
        nextScan = parseExpression(config.settings.scan_schedule, {
          currentDate: new Date(),
        }).next().toISOString();
      } catch {
        nextScan = config.settings.scan_schedule;
      }

      const webhooks = db.query(
        "SELECT success, COUNT(*) as c FROM webhooks_log GROUP BY success"
      ).all() as { success: number; c: number }[];
      const webhooksTotal = webhooks.reduce((s, r) => s + r.c, 0);
      const webhooksOk = webhooks.find((r) => r.success === 1)?.c ?? 0;

      const systemAlerts = getEvents(db, { eventPrefix: "system.", limit: 5 });
      const recentEvents = getEvents(db, { limit: 5 });

      statusData = {
        lastScan: lastSnap,
        nextScan,
        webhooksOk,
        webhooksTotal,
        systemAlerts: systemAlerts.map((e) => ({ id: e.id, event: e.event, timestamp: e.timestamp })),
        recentEvents: recentEvents.map((e) => ({
          id: e.id, event: e.event, timestamp: e.timestamp,
          tool_name: e.tool_name, severity: e.severity,
        })),
      };
    }
  }

  const { waitUntilExit } = render(
    React.createElement(App, {
      screen: "status" as const,
      statusData,
      themeName: config.theme?.name ?? "claude",
      themeTokens: config.theme as Record<string, string | undefined> | undefined,
    })
  );
  await waitUntilExit();
  process.exit(0);
}

// ─── server-lens events ──────────────────────────────────────────────────────
if (subcommand === "events") {
  const config = loadConfig();
  const eventIdx  = args.indexOf("--event");
  const eventFilter = eventIdx >= 0 ? args[eventIdx + 1] : undefined;
  const toolIdx   = args.indexOf("--tool");
  const toolFilter  = toolIdx >= 0 ? args[toolIdx + 1] : undefined;
  const sinceIdx  = args.indexOf("--since");
  const sinceFilter = sinceIdx >= 0 ? args[sinceIdx + 1] : undefined;
  const limitIdx  = args.indexOf("--limit");
  const limit     = limitIdx >= 0 ? parseInt(args[limitIdx + 1] ?? "50", 10) : 50;

  let eventsData: import("./ui/pages/events").EventItem[] = [];
  if (existsSync(config.dbPath)) {
    const db = getDatabase(config.dbPath);
    const rows = getEvents(db, { event: eventFilter, toolName: toolFilter, since: sinceFilter, limit });
    eventsData = rows.map((r) => ({
      id: r.id, event: r.event, severity: r.severity,
      timestamp: r.timestamp, tool_name: r.tool_name, data_json: r.data_json,
    }));
  }

  const { waitUntilExit } = render(
    React.createElement(App, {
      screen: "events" as const,
      eventsData,
      eventsFilter: { event: eventFilter, toolName: toolFilter, since: sinceFilter },
      themeName: config.theme?.name ?? "claude",
      themeTokens: config.theme as Record<string, string | undefined> | undefined,
    })
  );
  await waitUntilExit();
  process.exit(0);
}

// ─── server-lens mcp ─────────────────────────────────────────────────────────
if (subcommand === "mcp") {
  const { startMcpServer } = await import("./mcp/server");
  await startMcpServer();
  // Server keeps process alive
}

// ─── server-lens serve ───────────────────────────────────────────────────────
if (subcommand === "serve") {
  const portIdx = args.indexOf("--port");
  const hostIdx = args.indexOf("--host");
  const port = portIdx >= 0 ? parseInt(args[portIdx + 1], 10) : undefined;
  const host = hostIdx >= 0 ? args[hostIdx + 1] : undefined;
  const { startServe } = await import("./api/server");
  await startServe({ port, host });
  // Server keeps process alive; no display mode
} else if (subcommand !== "mcp") {

// ─── Display mode (default + scan --now) ─────────────────────────────────────

function loadSnapshotData(): {
  snapshot: SnapshotSummary | null;
  config: ReturnType<typeof loadConfig>;
} {
  const config = loadConfig();
  if (!existsSync(config.dbPath)) {
    return { snapshot: null, config };
  }
  const db = getDatabase(config.dbPath);
  return { snapshot: getLatestSnapshot(db), config };
}

function getToolsForDisplay(
  snapshot: SnapshotSummary | null,
  hiddenCategories: string[] = []
): VersionEntry[] {
  if (!snapshot) return [];
  let tools = snapshot.tools;
  if (hiddenCategories.length > 0) {
    const hidden = new Set(hiddenCategories.map((c) => c.toLowerCase()));
    tools = tools.filter((t) => !hidden.has(t.category.toLowerCase()));
  }
  if (hasOutdated) tools = tools.filter((t) => t.is_outdated);
  if (categoryName) tools = tools.filter((t) => t.category === categoryName);
  return tools;
}

// --json: output JSON from DB (--output file avoids pipe truncation on large payloads)
if (hasJson) {
  const { writeFileSync } = await import("fs");
  const { snapshot } = loadSnapshotData();
  let output: SnapshotSummary = snapshot ?? {
    schema_version: "1",
    scanned_at: new Date().toISOString(),
    hostname: "localhost",
    summary: {
      total: 0,
      outdated: 0,
      untracked: 0,
      probe_failed: 0,
      by_update_type: { major: 0, minor: 0, patch: 0, unknown: 0, none: 0, null: 0 },
      by_category: {} as Record<string, number>,
    },
    tools: [],
  };
  if (output.tools.length > 0) {
    let tools = output.tools;
    if (hasOutdated) tools = tools.filter((t) => t.is_outdated);
    if (categoryName) tools = tools.filter((t) => t.category === categoryName);
    output = { ...output, tools };
  }
  const json = JSON.stringify(output, null, 2);
  if (outputFile) {
    writeFileSync(outputFile, json, "utf-8");
  } else {
    console.log(json);
  }
  process.exit(0);
}

// Display mode — read snapshot, render TUI
const { snapshot, config } = loadSnapshotData();
const tools = getToolsForDisplay(
  snapshot,
  config.settings.hidden_categories ?? []
);

/** Build human-readable reason/details from system event payload (data_json). */
function systemEventMessage(event: string, dataJson: string): string | undefined {
  try {
    const d = JSON.parse(dataJson || "{}") as Record<string, unknown>;
    if (event === "system.reboot_required") {
      const reason = d.reason as string | undefined;
      const label = reason === "kernel_update" ? "kernel update pending"
        : reason === "package_update" ? "package update pending" : "pending";
      return `reboot required — ${label}`;
    }
    if (event === "system.service_degraded") {
      const name = (d.name as string) ?? "unknown";
      const category = (d.category as string) ?? "";
      const state = (d.state as string) ?? "";
      return `${category}: ${name} (${state})`;
    }
    if (event === "system.disk_warning") {
      const mount = (d.mount_point as string) ?? "?";
      const pct = (d.used_pct as number) ?? 0;
      return `${mount} — ${pct}% used`;
    }
  } catch { /* ignore */ }
  return undefined;
}

// Load system alerts and recent scans for dashboard
let systemAlerts: AlertItem[] = [];
let recentScans: Array<{ id: number; scanned_at: string; hostname: string; total_tools: number }> = [];
if (existsSync(config.dbPath)) {
  try {
    const db = getDatabase(config.dbPath);
    const alertRows = getEvents(db, { eventPrefix: "system.", limit: 10 });
    systemAlerts = alertRows.map((e) => ({
      id: e.id,
      event: e.event,
      timestamp: e.timestamp,
      message: systemEventMessage(e.event, e.data_json),
    }));
    const list = getSnapshotList(db, 5);
    recentScans = list.map((s) => ({
      id: s.id,
      scanned_at: s.scanned_at,
      hostname: s.hostname,
      total_tools: s.total_tools,
    }));
  } catch {/* ignore */}
}

render(
  React.createElement(App, {
    screen: "dashboard" as const,
    snapshot,
    tools,
    filterOutdated: hasOutdated,
    filterCategory: categoryName,
    systemAlerts,
    recentScans,
    themeName: config.theme?.name ?? "claude",
    themeTokens: config.theme as Record<string, string | undefined> | undefined,
  })
);
}
