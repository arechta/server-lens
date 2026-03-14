/**
 * Schedules repository — CRUD for scan schedules
 */

import type { Database } from "bun:sqlite";

export interface ScheduleRow {
  id: number;
  name: string;
  type: "one-time" | "cron";
  value: string;
  enabled: number;
  last_run_at: string | null;
  next_run_at: string | null;
  created_at: string;
  created_by: string;
}

export function getAllSchedules(db: Database): ScheduleRow[] {
  const rows = db.query("SELECT * FROM schedules ORDER BY id").all();
  return rows as ScheduleRow[];
}

export function getScheduleById(db: Database, id: number): ScheduleRow | null {
  const row = db.query("SELECT * FROM schedules WHERE id = ?").get(id) as ScheduleRow | undefined;
  return row ?? null;
}

export async function createSchedule(
  db: Database,
  data: { name: string; type: "one-time" | "cron"; value: string; enabled?: boolean; created_by?: string }
): Promise<ScheduleRow> {
  const enabled = data.enabled !== false ? 1 : 0;
  const createdBy = data.created_by ?? "api";
  const createdAt = new Date().toISOString();
  let nextRunAt: string | null = null;
  if (data.type === "cron") {
    try {
      const { parseExpression } = await import("cron-parser");
      const cron = parseExpression(data.value, { currentDate: new Date() });
      nextRunAt = cron.next().toISOString();
    } catch {
      // invalid cron — leave null
    }
  } else if (data.type === "one-time") {
    const d = new Date(data.value);
    if (!isNaN(d.getTime()) && d > new Date()) {
      nextRunAt = d.toISOString();
    }
  }
  const result = db.run(
    `INSERT INTO schedules (name, type, value, enabled, next_run_at, created_at, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [data.name, data.type, data.value, enabled, nextRunAt, createdAt, createdBy]
  );
  const id = result.lastInsertRowid as number;
  const row = db.query("SELECT * FROM schedules WHERE id = ?").get(id) as ScheduleRow;
  return row;
}

export async function updateSchedule(
  db: Database,
  id: number,
  data: Partial<{ name: string; type: "one-time" | "cron"; value: string; enabled: boolean }>
): Promise<ScheduleRow | null> {
  const existing = getScheduleById(db, id);
  if (!existing) return null;

  const updates: string[] = [];
  const params: (string | number)[] = [];

  if (data.name !== undefined) {
    updates.push("name = ?");
    params.push(data.name);
  }
  if (data.type !== undefined) {
    updates.push("type = ?");
    params.push(data.type);
  }
  if (data.value !== undefined) {
    updates.push("value = ?");
    params.push(data.value);
  }
  if (data.enabled !== undefined) {
    updates.push("enabled = ?");
    params.push(data.enabled ? 1 : 0);
  }

  if (updates.length === 0) return existing;

  params.push(id);
  db.run(`UPDATE schedules SET ${updates.join(", ")} WHERE id = ?`, params);

  // Recompute next_run_at if value changed
  if (data.value !== undefined || data.type !== undefined) {
    const row = getScheduleById(db, id)!;
    if (row.type === "cron") {
      try {
        const { parseExpression } = await import("cron-parser");
        const cron = parseExpression(row.value, { currentDate: new Date() });
        db.run("UPDATE schedules SET next_run_at = ? WHERE id = ?", [cron.next().toISOString(), id]);
      } catch {
        // ignore
      }
    }
  }

  return getScheduleById(db, id);
}

export function deleteSchedule(db: Database, id: number): boolean {
  const result = db.run("DELETE FROM schedules WHERE id = ?", [id]);
  return result.changes > 0;
}

export async function seedScheduleFromToml(db: Database, cronExpression: string): Promise<void> {
  const count = db.query("SELECT COUNT(*) as c FROM schedules").get() as { c: number };
  if (count.c > 0) return;

  let nextRunAt: string | null = null;
  try {
    const { parseExpression } = await import("cron-parser");
    const cron = parseExpression(cronExpression, { currentDate: new Date() });
    nextRunAt = cron.next().toISOString();
  } catch {
    nextRunAt = null;
  }

  db.run(
    `INSERT INTO schedules (name, type, value, enabled, next_run_at, created_at, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ["default (from TOML)", "cron", cronExpression, 1, nextRunAt, new Date().toISOString(), "system"]
  );
}
