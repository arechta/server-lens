/**
 * GET /api/health — liveness check
 */

import type { Database } from "bun:sqlite";
import { getSnapshotList } from "../../db/snapshots-repo";
import { getAllSchedules } from "../../db/schedules-repo";
import { getEvents } from "../../db/events-repo";
import { parseExpression } from "cron-parser";

export function handleHealth(
  db: Database,
  apiConfig: { host: string; port: number; token?: string },
  version: string
): Response {
  const snapshots = getSnapshotList(db, 1);
  const lastSnap = snapshots[0];
  const schedules = getAllSchedules(db);
  const cronSchedule = schedules.find((s) => s.type === "cron" && s.enabled === 1);
  let nextRunAt: string | null = null;
  let scheduleName = "none";
  if (cronSchedule) {
    scheduleName = cronSchedule.name;
    if (cronSchedule.next_run_at) {
      nextRunAt = cronSchedule.next_run_at;
    } else {
      try {
        const cron = parseExpression(cronSchedule.value, { currentDate: new Date() });
        nextRunAt = cron.next().toISOString();
      } catch {
        // ignore
      }
    }
  }

  const hostname = process.env.HOSTNAME ?? "localhost";
  const systemAlerts = getEvents(db, { eventPrefix: "system.", limit: 10 });
  const alerts = systemAlerts.map((e) => ({ event: e.event, timestamp: e.timestamp }));

  const body = {
    status: "ok",
    version,
    hostname,
    last_scan: lastSnap
      ? {
          scanned_at: lastSnap.scanned_at,
          status: lastSnap.scan_status,
          total_tools: lastSnap.total_tools,
          outdated: lastSnap.outdated,
        }
      : null,
    scheduler: {
      running: true,
      next_run_at: nextRunAt,
      schedule_name: scheduleName,
    },
    api: {
      host: apiConfig.host,
      port: apiConfig.port,
      auth_required: !!apiConfig.token,
    },
    alerts: alerts.length > 0 ? alerts : undefined,
  };

  return Response.json(body);
}
