/**
 * SQLite database — migrations, connection
 * @see docs/data-schema.md
 */

import { Database } from "bun:sqlite";
import { mkdirSync, existsSync } from "fs";
import { dirname } from "path";

let db: Database | null = null;

const MIGRATIONS = [
  `CREATE TABLE IF NOT EXISTS tools (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    name                TEXT NOT NULL UNIQUE,
    display_name        TEXT NOT NULL,
    category            TEXT NOT NULL,
    tool_status         TEXT NOT NULL,
    current_version     TEXT,
    latest_version      TEXT,
    is_outdated         INTEGER NOT NULL DEFAULT 0,
    update_type         TEXT NOT NULL DEFAULT 'null',
    latest_release_date TEXT,
    probe_type          TEXT,
    probe_status        TEXT NOT NULL,
    probe_source        TEXT,
    probe_error         TEXT,
    repo_url            TEXT,
    release_notes       TEXT,
    release_notes_source TEXT,
    last_checked_at     TEXT NOT NULL,
    first_seen_at       TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS snapshots (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    scanned_at    TEXT NOT NULL,
    hostname      TEXT NOT NULL,
    total_tools   INTEGER NOT NULL,
    outdated      INTEGER NOT NULL,
    probe_failed  INTEGER NOT NULL,
    untracked     INTEGER NOT NULL,
    scan_status   TEXT NOT NULL,
    payload_json  TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS events (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    event        TEXT NOT NULL,
    severity     TEXT NOT NULL,
    timestamp    TEXT NOT NULL,
    tool_name    TEXT,
    scan_id      INTEGER,
    data_json    TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS webhooks_log (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    event_id        INTEGER NOT NULL,
    event           TEXT NOT NULL,
    endpoint_url    TEXT NOT NULL,
    attempted_at    TEXT NOT NULL,
    http_status     INTEGER,
    success         INTEGER NOT NULL,
    error_message   TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS schedules (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    name         TEXT NOT NULL,
    type         TEXT NOT NULL,
    value        TEXT NOT NULL,
    enabled      INTEGER NOT NULL DEFAULT 1,
    last_run_at  TEXT,
    next_run_at   TEXT,
    created_at   TEXT NOT NULL,
    created_by   TEXT NOT NULL DEFAULT 'system'
  )`,
  `CREATE TABLE IF NOT EXISTS scan_jobs (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    job_id       TEXT NOT NULL UNIQUE,
    triggered_by TEXT NOT NULL,
    status       TEXT NOT NULL,
    started_at   TEXT,
    completed_at  TEXT,
    duration_ms   INTEGER,
    snapshot_id   INTEGER,
    error        TEXT,
    created_at   TEXT NOT NULL
  )`,
];

export function getDatabase(dbPath: string): Database {
  if (db) return db;

  const dir = dirname(dbPath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  db = new Database(dbPath, { create: true });
  db.run("PRAGMA journal_mode = WAL");

  for (const sql of MIGRATIONS) {
    db.run(sql);
  }

  return db;
}

export function closeDatabase(): void {
  if (db) {
    db.close();
    db = null;
  }
}
