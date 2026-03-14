/**
 * GET /api/tools, GET /api/tools/:name
 */

import type { Database } from "bun:sqlite";
import {
  getAllTools,
  getToolByName,
  getToolsWithFilters,
  type ToolsFilter,
} from "../../db/tools-repo";

export function handleToolsList(
  db: Database,
  url: URL
): Response {
  const category = url.searchParams.get("category");
  const outdated = url.searchParams.get("outdated");
  const updateType = url.searchParams.get("update_type");
  const probeStatus = url.searchParams.get("probe_status");
  const status = url.searchParams.get("status");

  const filter: ToolsFilter = {};
  if (category) filter.category = category;
  if (outdated === "true") filter.outdated = true;
  if (updateType) filter.update_type = updateType;
  if (probeStatus) filter.probe_status = probeStatus;
  if (status) filter.status = status;

  const tools =
    Object.keys(filter).length > 0 ? getToolsWithFilters(db, filter) : getAllTools(db);
  return Response.json({ tools });
}

export function handleToolByName(db: Database, name: string): Response {
  const tool = getToolByName(db, name);
  if (!tool) {
    return Response.json(
      { error: "not_found", message: `Tool '${name}' not found`, status: 404 },
      { status: 404 }
    );
  }
  return Response.json(tool);
}
