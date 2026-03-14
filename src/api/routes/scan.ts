/**
 * POST /api/scan, GET /api/scan/status
 */

import type { Database } from "bun:sqlite";
import {
  createScanJob,
  getScanJobByJobId,
  getRunningScanJob,
  markScanJobRunning,
  markScanJobCompleted,
  markScanJobFailed,
} from "../../db/scan-jobs-repo";
import { runScan } from "../../scanner/run-scan";

let scanInProgress = false;

export async function handleScanPost(db: Database): Promise<Response> {
  const running = getRunningScanJob(db);
  if (running) {
    return Response.json(
      {
        error: "scan_already_running",
        message: "A scan is currently in progress",
        job_id: running.job_id,
        started_at: running.started_at,
      },
      { status: 409 }
    );
  }

  const job = createScanJob(db, "api");
  // Run scan async — don't await
  runScanAsync(db, job.job_id);

  return Response.json(
    {
      job_id: job.job_id,
      status: "queued",
      triggered_by: "api",
      created_at: job.created_at,
    },
    { status: 202 }
  );
}

async function runScanAsync(db: Database, jobId: string): Promise<void> {
  if (scanInProgress) return;
  scanInProgress = true;
  markScanJobRunning(db, jobId);

  try {
    const { snapshotId } = await runScan();
    markScanJobCompleted(db, jobId, snapshotId);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    markScanJobFailed(db, jobId, message);
  } finally {
    scanInProgress = false;
  }
}

export function handleScanStatus(db: Database, url: URL): Response {
  const jobId = url.searchParams.get("job_id");
  if (jobId) {
    const job = getScanJobByJobId(db, jobId);
    if (!job) {
      return Response.json(
        { error: "not_found", message: `Job ${jobId} not found`, status: 404 },
        { status: 404 }
      );
    }
    return Response.json({
      job_id: job.job_id,
      status: job.status,
      triggered_by: job.triggered_by,
      started_at: job.started_at,
      completed_at: job.completed_at,
      duration_ms: job.duration_ms,
      snapshot_id: job.snapshot_id,
    });
  }

  // No job_id — return current running/queued job if any
  const running = getRunningScanJob(db);
  if (running) {
    return Response.json({
      job_id: running.job_id,
      status: running.status,
      triggered_by: running.triggered_by,
      started_at: running.started_at,
      completed_at: running.completed_at,
      duration_ms: running.duration_ms,
      snapshot_id: running.snapshot_id,
    });
  }

  // No active job — return last completed
  const last = db
    .query("SELECT * FROM scan_jobs ORDER BY id DESC LIMIT 1")
    .get() as { job_id: string; status: string; triggered_by: string; started_at: string | null; completed_at: string | null; duration_ms: number | null; snapshot_id: number | null } | undefined;
  if (last) {
    return Response.json({
      job_id: last.job_id,
      status: last.status,
      triggered_by: last.triggered_by,
      started_at: last.started_at,
      completed_at: last.completed_at,
      duration_ms: last.duration_ms,
      snapshot_id: last.snapshot_id,
    });
  }

  return Response.json({
    job_id: null,
    status: "idle",
    message: "No scan has been run yet",
  });
}
