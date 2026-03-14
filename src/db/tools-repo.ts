/**
 * Tools repository — read tools from latest state
 */

import type { Database } from "bun:sqlite";
import type { VersionEntry } from "../schema/types";

export function getAllTools(db: Database): VersionEntry[] {
  const rows = db.query("SELECT * FROM tools ORDER BY category, name").all();

  return rows.map((row) => rowToVersionEntry(row as Record<string, unknown>));
}

export function getToolsByCategory(
  db: Database,
  category: string
): VersionEntry[] {
  const rows = db
    .query("SELECT * FROM tools WHERE category = ? ORDER BY name")
    .all(category);

  return rows.map((row) => rowToVersionEntry(row as Record<string, unknown>));
}

export function getOutdatedTools(db: Database): VersionEntry[] {
  const rows = db
    .query("SELECT * FROM tools WHERE is_outdated = 1 ORDER BY category, name")
    .all();

  return rows.map((row) => rowToVersionEntry(row as Record<string, unknown>));
}

export function getToolByName(db: Database, name: string): VersionEntry | null {
  const row = db.query("SELECT * FROM tools WHERE name = ?").get(name) as Record<string, unknown> | undefined;
  return row ? rowToVersionEntry(row) : null;
}

export interface ToolsFilter {
  category?: string;
  outdated?: boolean;
  update_type?: string;
  probe_status?: string;
  status?: string; // tool_status
}

export function getToolsWithFilters(db: Database, filter: ToolsFilter): VersionEntry[] {
  const conditions: string[] = [];
  const params: (string | number)[] = [];

  if (filter.category) {
    conditions.push("category = ?");
    params.push(filter.category);
  }
  if (filter.outdated === true) {
    conditions.push("is_outdated = 1");
  }
  if (filter.update_type) {
    conditions.push("update_type = ?");
    params.push(filter.update_type);
  }
  if (filter.probe_status) {
    conditions.push("probe_status = ?");
    params.push(filter.probe_status);
  }
  if (filter.status) {
    conditions.push("tool_status = ?");
    params.push(filter.status);
  }

  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const rows = db
    .query(`SELECT * FROM tools ${where} ORDER BY category, name`)
    .all(...params);

  return rows.map((row) => rowToVersionEntry(row as Record<string, unknown>));
}

function rowToVersionEntry(row: Record<string, unknown>): VersionEntry {
  return {
    name: row.name as string,
    display_name: row.display_name as string,
    category: row.category as VersionEntry["category"],
    tool_status: row.tool_status as VersionEntry["tool_status"],
    current_version: (row.current_version as string) ?? null,
    latest_version: (row.latest_version as string) ?? null,
    is_outdated: (row.is_outdated as number) === 1,
    update_type: (row.update_type as VersionEntry["update_type"]) ?? "null",
    latest_release_date: (row.latest_release_date as string) ?? null,
    probe_type: (row.probe_type as VersionEntry["probe_type"]) ?? null,
    probe_status: row.probe_status as VersionEntry["probe_status"],
    probe_source: (row.probe_source as string) ?? null,
    probe_error: (row.probe_error as string) ?? null,
    repo_url: (row.repo_url as string) ?? null,
    release_notes: (row.release_notes as string) ?? null,
    release_notes_source: (row.release_notes_source as string) ?? null,
    last_checked_at: row.last_checked_at as string,
    first_seen_at: row.first_seen_at as string,
  };
}
