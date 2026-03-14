/**
 * GET/POST/PATCH/DELETE /api/schedules
 */

import type { Database } from "bun:sqlite";
import {
  getAllSchedules,
  getScheduleById,
  createSchedule,
  updateSchedule,
  deleteSchedule,
} from "../../db/schedules-repo";

export function handleSchedulesList(db: Database): Response {
  const rows = getAllSchedules(db);
  const list = rows.map((r) => ({
    id: r.id,
    name: r.name,
    type: r.type,
    value: r.value,
    enabled: r.enabled === 1,
    last_run_at: r.last_run_at,
    next_run_at: r.next_run_at,
    created_at: r.created_at,
    created_by: r.created_by,
  }));
  return Response.json({ schedules: list });
}

export async function handleSchedulesPost(db: Database, body: unknown): Promise<Response> {
  const data = body as Record<string, unknown>;
  const name = data?.name as string | undefined;
  const type = data?.type as "one-time" | "cron" | undefined;
  const value = data?.value as string | undefined;
  const enabled = data?.enabled as boolean | undefined;

  if (!name || !type || !value) {
    return Response.json(
      {
        error: "invalid_request",
        message: "name, type, and value are required",
        status: 422,
      },
      { status: 422 }
    );
  }

  if (type !== "one-time" && type !== "cron") {
    return Response.json(
      {
        error: "invalid_request",
        message: "type must be 'one-time' or 'cron'",
        status: 422,
      },
      { status: 422 }
    );
  }

  if (type === "cron") {
    try {
      const { parseExpression } = await import("cron-parser");
      parseExpression(value);
    } catch {
      return Response.json(
        { error: "invalid_cron", message: "Invalid cron expression", status: 422 },
        { status: 422 }
      );
    }
  } else {
    const d = new Date(value);
    if (isNaN(d.getTime())) {
      return Response.json(
        { error: "invalid_datetime", message: "Invalid ISO 8601 datetime", status: 422 },
        { status: 422 }
      );
    }
    if (d <= new Date()) {
      return Response.json(
        { error: "invalid_datetime", message: "One-time datetime must be in the future", status: 422 },
        { status: 422 }
      );
    }
  }

  const row = await createSchedule(db, { name, type, value, enabled });
  return Response.json(
    {
      id: row.id,
      name: row.name,
      type: row.type,
      value: row.value,
      enabled: row.enabled === 1,
      next_run_at: row.next_run_at,
      last_run_at: row.last_run_at,
      created_at: row.created_at,
      created_by: row.created_by,
    },
    { status: 201 }
  );
}

export async function handleSchedulesPatch(
  db: Database,
  idStr: string,
  body: unknown
): Promise<Response> {
  const id = parseInt(idStr, 10);
  if (isNaN(id)) {
    return Response.json(
      { error: "not_found", message: "Invalid schedule id", status: 404 },
      { status: 404 }
    );
  }

  const data = body as Record<string, unknown>;
  const name = data?.name as string | undefined;
  const type = data?.type as "one-time" | "cron" | undefined;
  const value = data?.value as string | undefined;
  const enabled = data?.enabled as boolean | undefined;

  const updated = await updateSchedule(db, id, { name, type, value, enabled });
  if (!updated) {
    return Response.json(
      { error: "schedule_not_found", message: `Schedule ${id} not found`, status: 404 },
      { status: 404 }
    );
  }

  return Response.json({
    id: updated.id,
    name: updated.name,
    type: updated.type,
    value: updated.value,
    enabled: updated.enabled === 1,
    next_run_at: updated.next_run_at,
    last_run_at: updated.last_run_at,
    created_at: updated.created_at,
    created_by: updated.created_by,
  });
}

export function handleSchedulesDelete(db: Database, idStr: string): Response {
  const id = parseInt(idStr, 10);
  if (isNaN(id)) {
    return Response.json(
      { error: "not_found", message: "Invalid schedule id", status: 404 },
      { status: 404 }
    );
  }

  const deleted = deleteSchedule(db, id);
  if (!deleted) {
    return Response.json(
      { error: "schedule_not_found", message: `Schedule ${id} not found`, status: 404 },
      { status: 404 }
    );
  }

  return new Response(null, { status: 204 });
}
