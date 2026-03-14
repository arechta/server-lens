/**
 * Snapshots repository — read latest snapshot
 */

import type { Database } from "bun:sqlite";
import type { SnapshotSummary, VersionEntry } from "../schema/types";

export interface SnapshotRow {
  id: number;
  scanned_at: string;
  hostname: string;
  total_tools: number;
  outdated: number;
  probe_failed: number;
  untracked: number;
  scan_status: string;
}

export function getSnapshotList(db: Database, limit = 50): SnapshotRow[] {
  const rows = db
    .query(
      `SELECT id, scanned_at, hostname, total_tools, outdated, probe_failed, untracked, scan_status
       FROM snapshots ORDER BY id DESC LIMIT ?`
    )
    .all(limit);
  return rows as SnapshotRow[];
}

export function getSnapshotById(db: Database, id: number): SnapshotSummary | null {
  const row = db
    .query("SELECT payload_json FROM snapshots WHERE id = ?")
    .get(id) as { payload_json: string } | undefined;
  if (!row) return null;
  return JSON.parse(row.payload_json) as SnapshotSummary;
}

export function getLatestSnapshot(db: Database): SnapshotSummary | null {
  const row = db
    .query(
      `SELECT payload_json FROM snapshots
       ORDER BY scanned_at DESC LIMIT 1`
    )
    .get();

  if (!row || typeof row !== "object" || !("payload_json" in row)) {
    return null;
  }

  const payload = (row as { payload_json: string }).payload_json;
  return JSON.parse(payload) as SnapshotSummary;
}
