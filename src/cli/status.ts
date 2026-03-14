/**
 * server-lens status — last scan, next scheduled, probe summary
 */

import { loadConfig } from "../config/config-loader";
import { getDatabase } from "../db/database";
import { getEvents } from "../db/events-repo";
import { existsSync } from "fs";
import { parseExpression } from "cron-parser";

export function runStatus(): void {
  const config = loadConfig();
  const hasDb = existsSync(config.dbPath);

  if (!hasDb) {
    console.log("No scan data yet. Run: server-lens scan --now");
    return;
  }

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

  if (!lastSnap) {
    console.log("No scan data yet. Run: server-lens scan --now");
    return;
  }

  let nextScan = "—";
  try {
    const cron = parseExpression(config.settings.scan_schedule, {
      currentDate: new Date(),
    });
    nextScan = cron.next().toISOString();
  } catch {
    nextScan = config.settings.scan_schedule;
  }

  const webhooks = db.query(
    "SELECT success, COUNT(*) as c FROM webhooks_log GROUP BY success"
  ).all() as { success: number; c: number }[];
  const total = webhooks.reduce((s, r) => s + r.c, 0);
  const ok = webhooks.find((r) => r.success === 1)?.c ?? 0;

  console.log("");
  console.log("  Last scan:   ", new Date(lastSnap.scanned_at).toLocaleString(), `(${lastSnap.scan_status}, ${lastSnap.total_tools} tools)`);
  console.log("  Next scan:   ", nextScan);
  console.log("  Outdated:    ", lastSnap.outdated, "tools");
  console.log("  Probe issues:", lastSnap.probe_failed, "failed");
  if (total > 0) {
    console.log("  Webhooks:    ", `${ok}/${total} delivered`);
  }

  const systemAlerts = getEvents(db, { eventPrefix: "system.", limit: 5 });
  if (systemAlerts.length > 0) {
    console.log("  Alerts:      ", systemAlerts.map((e) => e.event).join(", "));
  }

  const recent = getEvents(db, { limit: 5 });
  if (recent.length > 0) {
    console.log("");
    console.log("  Recent events:");
    for (const e of recent) {
      console.log("   ", e.timestamp.slice(0, 19), e.event, e.tool_name ?? "");
    }
  }
  console.log("");
}
