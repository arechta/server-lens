/**
 * Events repository — read/write event log
 */

import type { Database } from "bun:sqlite";

export interface EventRow {
  id: number;
  event: string;
  severity: string;
  timestamp: string;
  tool_name: string | null;
  scan_id: number | null;
  data_json: string;
}

export function insertEvent(
  db: Database,
  event: string,
  severity: string,
  data: unknown,
  toolName?: string | null,
  scanId?: number | null
): number {
  const result = db.run(
    `INSERT INTO events (event, severity, timestamp, tool_name, scan_id, data_json)
     VALUES (?, ?, ?, ?, ?, ?)`,
    event,
    severity,
    new Date().toISOString(),
    toolName ?? null,
    scanId ?? null,
    JSON.stringify(data ?? {})
  );
  return result.lastInsertRowId as number;
}

export function getEvents(
  db: Database,
  opts?: { event?: string; eventPrefix?: string; toolName?: string; since?: string; limit?: number }
): EventRow[] {
  const limit = opts?.limit ?? 50;
  const conditions: string[] = [];
  const params: (string | number)[] = [];

  if (opts?.event) {
    conditions.push("event = ?");
    params.push(opts.event);
  }
  if (opts?.eventPrefix) {
    conditions.push("event LIKE ?");
    params.push(opts.eventPrefix + "%");
  }
  if (opts?.toolName) {
    conditions.push("tool_name = ?");
    params.push(opts.toolName);
  }
  if (opts?.since) {
    conditions.push("timestamp >= ?");
    params.push(opts.since);
  }

  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const rows = db
    .query(
      `SELECT * FROM events ${where} ORDER BY id DESC LIMIT ?`
    )
    .all(...params, limit) as EventRow[];

  return rows;
}
