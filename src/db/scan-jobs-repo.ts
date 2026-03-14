/**
 * Scan jobs repository — track async scan jobs
 */

import type { Database } from "bun:sqlite";

export interface ScanJobRow {
  id: number;
  job_id: string;
  triggered_by: string;
  status: "queued" | "running" | "completed" | "failed";
  started_at: string | null;
  completed_at: string | null;
  duration_ms: number | null;
  snapshot_id: number | null;
  error: string | null;
  created_at: string;
}

export function createScanJob(db: Database, triggeredBy: string): ScanJobRow {
  const jobId = crypto.randomUUID();
  const createdAt = new Date().toISOString();
  db.run(
    `INSERT INTO scan_jobs (job_id, triggered_by, status, created_at)
     VALUES (?, ?, 'queued', ?)`,
    jobId,
    triggeredBy,
    createdAt
  );
  const row = db.query("SELECT * FROM scan_jobs WHERE job_id = ?").get(jobId) as ScanJobRow;
  return row;
}

export function getScanJobByJobId(db: Database, jobId: string): ScanJobRow | null {
  const row = db.query("SELECT * FROM scan_jobs WHERE job_id = ?").get(jobId) as ScanJobRow | undefined;
  return row ?? null;
}

export function getRunningScanJob(db: Database): ScanJobRow | null {
  const row = db
    .query("SELECT * FROM scan_jobs WHERE status IN ('queued', 'running') ORDER BY id DESC LIMIT 1")
    .get() as ScanJobRow | undefined;
  return row ?? null;
}

export function markScanJobRunning(db: Database, jobId: string): void {
  const startedAt = new Date().toISOString();
  db.run(
    "UPDATE scan_jobs SET status = 'running', started_at = ? WHERE job_id = ?",
    startedAt,
    jobId
  );
}

export function markScanJobCompleted(db: Database, jobId: string, snapshotId: number): void {
  const job = getScanJobByJobId(db, jobId);
  if (!job) return;
  const completedAt = new Date().toISOString();
  const startedAt = job.started_at ? new Date(job.started_at).getTime() : Date.now();
  const durationMs = Math.round(Date.now() - startedAt);
  db.run(
    `UPDATE scan_jobs SET status = 'completed', completed_at = ?, duration_ms = ?, snapshot_id = ?
     WHERE job_id = ?`,
    completedAt,
    durationMs,
    snapshotId,
    jobId
  );
}

export function markScanJobFailed(db: Database, jobId: string, error: string): void {
  const job = getScanJobByJobId(db, jobId);
  if (!job) return;
  const completedAt = new Date().toISOString();
  const startedAt = job.started_at ? new Date(job.started_at).getTime() : Date.now();
  const durationMs = Math.round(Date.now() - startedAt);
  db.run(
    `UPDATE scan_jobs SET status = 'failed', completed_at = ?, duration_ms = ?, error = ?
     WHERE job_id = ?`,
    completedAt,
    durationMs,
    error,
    jobId
  );
}
