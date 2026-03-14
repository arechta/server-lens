/**
 * server-lens events — event log from SQLite
 */

import { loadConfig } from "../config/config-loader";
import { getDatabase } from "../db/database";
import { getEvents } from "../db/events-repo";
import { existsSync } from "fs";

export function runEvents(args: string[]): void {
  const config = loadConfig();
  if (!existsSync(config.dbPath)) {
    console.log("No scan data yet. Run: server-lens scan --now");
    return;
  }

  const db = getDatabase(config.dbPath);
  const eventIdx = args.indexOf("--event");
  const eventFilter = eventIdx >= 0 ? args[eventIdx + 1] : undefined;
  const toolIdx = args.indexOf("--tool");
  const toolFilter = toolIdx >= 0 ? args[toolIdx + 1] : undefined;
  const sinceIdx = args.indexOf("--since");
  const sinceFilter = sinceIdx >= 0 ? args[sinceIdx + 1] : undefined;
  const limitIdx = args.indexOf("--limit");
  const limit = limitIdx >= 0 ? parseInt(args[limitIdx + 1] ?? "50", 10) : 50;

  const events = getEvents(db, {
    event: eventFilter,
    toolName: toolFilter,
    since: sinceFilter,
    limit,
  });

  if (events.length === 0) {
    console.log("No events found.");
    return;
  }

  console.log("");
  for (const e of events) {
    const data = JSON.parse(e.data_json) as Record<string, unknown>;
    const extra = Object.entries(data)
      .filter(([k]) => !["name", "category"].includes(k))
      .map(([k, v]) => `${k}=${v}`)
      .join(", ");
    console.log(`  ${e.timestamp}  [${e.severity}]  ${e.event}  ${e.tool_name ?? ""}  ${extra}`);
  }
  console.log("");
}
