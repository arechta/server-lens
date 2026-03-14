/**
 * GET /api/snapshots, GET /api/snapshots/:id
 */

import type { Database } from "bun:sqlite";
import { getSnapshotList, getSnapshotById } from "../../db/snapshots-repo";

export function handleSnapshotsList(db: Database, url: URL): Response {
  const limitParam = url.searchParams.get("limit");
  const limit = limitParam ? Math.min(parseInt(limitParam, 10) || 50, 100) : 50;
  const rows = getSnapshotList(db, limit);
  const list = rows.map((r) => ({
    id: r.id,
    scanned_at: r.scanned_at,
    hostname: r.hostname,
    total_tools: r.total_tools,
    outdated: r.outdated,
    probe_failed: r.probe_failed,
    untracked: r.untracked,
    scan_status: r.scan_status,
  }));
  return Response.json({ snapshots: list });
}

export function handleSnapshotById(db: Database, idStr: string): Response {
  const id = parseInt(idStr, 10);
  if (isNaN(id)) {
    return Response.json(
      { error: "not_found", message: "Invalid snapshot id", status: 404 },
      { status: 404 }
    );
  }
  const snapshot = getSnapshotById(db, id);
  if (!snapshot) {
    return Response.json(
      { error: "not_found", message: `Snapshot ${id} not found`, status: 404 },
      { status: 404 }
    );
  }
  return Response.json(snapshot);
}
