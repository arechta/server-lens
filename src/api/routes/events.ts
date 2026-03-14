/**
 * GET /api/events
 */

import type { Database } from "bun:sqlite";
import { getEvents } from "../../db/events-repo";

export function handleEvents(db: Database, url: URL): Response {
  const event = url.searchParams.get("event");
  const toolName = url.searchParams.get("tool_name");
  const since = url.searchParams.get("since");
  const limitParam = url.searchParams.get("limit");
  const limit = limitParam ? Math.min(parseInt(limitParam, 10) || 50, 200) : 50;

  const rows = getEvents(db, {
    event: event ?? undefined,
    toolName: toolName ?? undefined,
    since: since ?? undefined,
    limit,
  });

  return Response.json({ events: rows });
}
