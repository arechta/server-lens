/**
 * GET /api/webhooks/log
 */

import type { Database } from "bun:sqlite";

export function handleWebhooksLog(db: Database, url: URL): Response {
  const event = url.searchParams.get("event");
  const success = url.searchParams.get("success");
  const limitParam = url.searchParams.get("limit");
  const limit = limitParam ? Math.min(parseInt(limitParam, 10) || 50, 200) : 50;

  const conditions: string[] = [];
  const params: (string | number)[] = [];

  if (event) {
    conditions.push("event = ?");
    params.push(event);
  }
  if (success === "true") {
    conditions.push("success = 1");
  } else if (success === "false") {
    conditions.push("success = 0");
  }

  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const rows = db
    .query(
      `SELECT id, event_id, event, endpoint_url, attempted_at, http_status, success, error_message
       FROM webhooks_log ${where} ORDER BY id DESC LIMIT ?`
    )
    .all(...params, limit);

  return Response.json({ log: rows });
}
