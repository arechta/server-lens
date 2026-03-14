/**
 * Webhook dispatcher — fire-and-forget POST to configured endpoints
 * Never blocks scan. Logs to webhooks_log.
 */

import type { Database } from "bun:sqlite";
import { insertEvent } from "../db/events-repo";

export interface WebhookPayload {
  event: string;
  timestamp: string;
  severity: string;
  hostname: string;
  data: unknown;
}

export function dispatchWebhooks(
  db: Database,
  eventId: number,
  event: string,
  payload: WebhookPayload,
  endpoints: string[]
): void {
  for (const url of endpoints) {
    dispatchOne(db, eventId, event, payload, url);
  }
}

async function dispatchOne(
  db: Database,
  eventId: number,
  event: string,
  payload: WebhookPayload,
  url: string
): Promise<void> {
  const attemptedAt = new Date().toISOString();
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    db.run(
      `INSERT INTO webhooks_log (event_id, event, endpoint_url, attempted_at, http_status, success, error_message)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      eventId,
      event,
      url,
      attemptedAt,
      res.status,
      res.ok ? 1 : 0,
      res.ok ? null : `HTTP ${res.status}`
    );
  } catch (e) {
    db.run(
      `INSERT INTO webhooks_log (event_id, event, endpoint_url, attempted_at, http_status, success, error_message)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      eventId,
      event,
      url,
      attemptedAt,
      null,
      0,
      String(e)
    );
  }
}
