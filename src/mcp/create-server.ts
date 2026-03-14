/**
 * MCP server factory — creates configured McpServer for stdio or HTTP/SSE
 * @see docs/mcp.md
 */

import type { Database } from "bun:sqlite";
import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  getToolsWithFilters,
  getToolByName,
  getOutdatedTools,
  type ToolsFilter,
} from "../db/tools-repo";
import { getEvents } from "../db/events-repo";
import { getSnapshotList, getSnapshotById, getLatestSnapshot } from "../db/snapshots-repo";
import {
  getAllSchedules,
  createSchedule,
  updateSchedule,
} from "../db/schedules-repo";
import {
  createScanJob,
  getScanJobByJobId,
  getRunningScanJob,
  markScanJobRunning,
  markScanJobCompleted,
  markScanJobFailed,
} from "../db/scan-jobs-repo";
import { runScan } from "../scanner/run-scan";
import { parseExpression } from "cron-parser";

const PKG = await Bun.file(new URL("../../package.json", import.meta.url)).json().catch(() => ({}));
const VERSION = (PKG as { version?: string }).version ?? "0.1.0";

let scanInProgress = false;

async function runScanAsync(db: Database, jobId: string): Promise<void> {
  if (scanInProgress) return;
  scanInProgress = true;
  markScanJobRunning(db, jobId);
  try {
    const { snapshotId } = await runScan();
    markScanJobCompleted(db, jobId, snapshotId);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    markScanJobFailed(db, jobId, message);
  } finally {
    scanInProgress = false;
  }
}

export function createMcpServer(db: Database): McpServer {
  const server = new McpServer(
    { name: "server-lens", version: VERSION },
    { capabilities: { logging: {} } }
  );

  server.registerTool("scan_now", { description: "Trigger an immediate server scan. Returns a job_id to track progress. Only one scan can run at a time — call get_scan_status to poll for completion.", inputSchema: {} }, async () => {
    const running = getRunningScanJob(db);
    if (running) {
      return { content: [{ type: "text" as const, text: JSON.stringify({ error: "scan_already_running", job_id: running.job_id, started_at: running.started_at }) }] };
    }
    const job = createScanJob(db, "mcp");
    runScanAsync(db, job.job_id);
    return { content: [{ type: "text" as const, text: JSON.stringify({ job_id: job.job_id, status: "queued", message: "Scan queued. Poll get_scan_status with this job_id." }) }] };
  });

  server.registerTool("get_scan_status", { description: "Check the status of a running or recently completed scan job.", inputSchema: { job_id: z.string().optional().describe("Optional — omit to get status of most recent job") } }, async ({ job_id }) => {
    if (job_id) {
      const job = getScanJobByJobId(db, job_id);
      if (!job) return { content: [{ type: "text" as const, text: JSON.stringify({ error: "not_found", message: `Job ${job_id} not found` }) }] };
      return { content: [{ type: "text" as const, text: JSON.stringify({ job_id: job.job_id, status: job.status, triggered_by: job.triggered_by, started_at: job.started_at, completed_at: job.completed_at, duration_ms: job.duration_ms, snapshot_id: job.snapshot_id }) }] };
    }
    const running = getRunningScanJob(db);
    if (running) return { content: [{ type: "text" as const, text: JSON.stringify({ job_id: running.job_id, status: running.status, triggered_by: running.triggered_by, started_at: running.started_at, completed_at: running.completed_at, duration_ms: running.duration_ms, snapshot_id: running.snapshot_id }) }] };
    const last = db.query("SELECT * FROM scan_jobs ORDER BY id DESC LIMIT 1").get() as { job_id: string; status: string; triggered_by: string; started_at: string | null; completed_at: string | null; duration_ms: number | null; snapshot_id: number | null } | undefined;
    if (last) return { content: [{ type: "text" as const, text: JSON.stringify({ job_id: last.job_id, status: last.status, triggered_by: last.triggered_by, started_at: last.started_at, completed_at: last.completed_at, duration_ms: last.duration_ms, snapshot_id: last.snapshot_id }) }] };
    return { content: [{ type: "text" as const, text: JSON.stringify({ job_id: null, status: "idle", message: "No scan has been run yet" }) }] };
  });

  server.registerTool("get_tools", { description: "Query all tools discovered on the server. Supports filtering by category, outdated, update_type, probe_status, tool_status.", inputSchema: { category: z.string().optional(), outdated: z.boolean().optional(), update_type: z.string().optional(), probe_status: z.string().optional(), tool_status: z.string().optional(), limit: z.number().optional() } }, async (args) => {
    const filter: ToolsFilter = {};
    if (args.category) filter.category = args.category;
    if (args.outdated === true) filter.outdated = true;
    if (args.update_type) filter.update_type = args.update_type;
    if (args.probe_status) filter.probe_status = args.probe_status;
    if (args.tool_status) filter.status = args.tool_status;
    let tools = getToolsWithFilters(db, filter);
    if (tools.length > (args.limit ?? 100)) tools = tools.slice(0, args.limit ?? 100);
    return { content: [{ type: "text" as const, text: JSON.stringify(tools) }] };
  });

  server.registerTool("get_tool", { description: "Get full detail on a single tool by name.", inputSchema: { name: z.string().describe("Tool name e.g. bun, nginx, n8n") } }, async ({ name }) => {
    const tool = getToolByName(db, name);
    if (!tool) return { content: [{ type: "text" as const, text: JSON.stringify({ error: "not_found" }) }] };
    return { content: [{ type: "text" as const, text: JSON.stringify(tool) }] };
  });

  server.registerTool("get_outdated", { description: "Shortcut for common agent workflow — returns all outdated tools grouped by update_type.", inputSchema: { category: z.string().optional() } }, async ({ category }) => {
    let tools = getOutdatedTools(db);
    if (category) tools = tools.filter((t) => t.category === category);
    const byUpdateType: Record<string, typeof tools> = { major: [], minor: [], patch: [], unknown: [] };
    for (const t of tools) {
      if (["major", "minor", "patch", "unknown"].includes(t.update_type)) byUpdateType[t.update_type].push(t);
    }
    return { content: [{ type: "text" as const, text: JSON.stringify({ summary: { total_outdated: tools.length, by_update_type: { major: byUpdateType.major.length, minor: byUpdateType.minor.length, patch: byUpdateType.patch.length } }, tools: byUpdateType }) }] };
  });

  server.registerTool("get_probe_failures", { description: "Returns all tools where the last probe attempt failed, timed out, or was rate limited.", inputSchema: {} }, async () => {
    const all = [...getToolsWithFilters(db, { probe_status: "failed" }), ...getToolsWithFilters(db, { probe_status: "timeout" }), ...getToolsWithFilters(db, { probe_status: "rate_limited" })];
    return { content: [{ type: "text" as const, text: JSON.stringify(all) }] };
  });

  server.registerTool("get_events", { description: "Query the event log. Filter by event, tool_name, since.", inputSchema: { event: z.string().optional(), tool_name: z.string().optional(), since: z.string().optional(), limit: z.number().optional() } }, async (args) => {
    const rows = getEvents(db, { event: args.event, toolName: args.tool_name, since: args.since, limit: args.limit ?? 50 });
    return { content: [{ type: "text" as const, text: JSON.stringify(rows) }] };
  });

  server.registerTool("get_snapshots", { description: "List scan history — timestamps, durations, summary counts.", inputSchema: { limit: z.number().optional() } }, async (args) => {
    const rows = getSnapshotList(db, Math.min(args.limit ?? 10, 50));
    return { content: [{ type: "text" as const, text: JSON.stringify(rows.map((r) => ({ id: r.id, scanned_at: r.scanned_at, hostname: r.hostname, total_tools: r.total_tools, outdated: r.outdated, probe_failed: r.probe_failed, scan_status: r.scan_status }))) }] };
  });

  server.registerTool("get_snapshot", { description: "Get the full payload of a specific snapshot by id.", inputSchema: { id: z.number().describe("Snapshot id from get_snapshots") } }, async ({ id }) => {
    const snapshot = getSnapshotById(db, id);
    if (!snapshot) return { content: [{ type: "text" as const, text: JSON.stringify({ error: "not_found" }) }] };
    return { content: [{ type: "text" as const, text: JSON.stringify(snapshot) }] };
  });

  server.registerTool("get_schedules", { description: "List all configured scan schedules.", inputSchema: {} }, async () => {
    const rows = getAllSchedules(db);
    return { content: [{ type: "text" as const, text: JSON.stringify(rows.map((r) => ({ id: r.id, name: r.name, type: r.type, value: r.value, enabled: r.enabled === 1, last_run_at: r.last_run_at, next_run_at: r.next_run_at }))) }] };
  });

  server.registerTool("create_schedule", { description: "Create a new scan schedule. Use type cron for recurring or one-time for single future scan.", inputSchema: { name: z.string(), type: z.enum(["cron", "one-time"]), value: z.string(), enabled: z.boolean().optional() } }, async (args) => {
    try {
      const row = await createSchedule(db, { name: args.name, type: args.type, value: args.value, enabled: args.enabled });
      return { content: [{ type: "text" as const, text: JSON.stringify({ id: row.id, name: row.name, type: row.type, value: row.value, enabled: row.enabled === 1, next_run_at: row.next_run_at }) }] };
    } catch (err: unknown) {
      return { content: [{ type: "text" as const, text: JSON.stringify({ error: "invalid_request", message: err instanceof Error ? err.message : String(err) }) }] };
    }
  });

  server.registerTool("toggle_schedule", { description: "Enable or disable a scan schedule by id.", inputSchema: { id: z.number(), enabled: z.boolean() } }, async ({ id, enabled }) => {
    const updated = await updateSchedule(db, id, { enabled });
    if (!updated) return { content: [{ type: "text" as const, text: JSON.stringify({ error: "not_found" }) }] };
    return { content: [{ type: "text" as const, text: JSON.stringify({ id: updated.id, name: updated.name, enabled: updated.enabled === 1 }) }] };
  });

  server.registerTool("get_system_health", { description: "Get overall server health snapshot — last scan summary, scheduler state, probe failure count, and any active system alerts (reboot required, disk warning, degraded services).", inputSchema: {} }, async () => {
    const snapshots = getSnapshotList(db, 1);
    const lastSnap = snapshots[0];
    const schedules = getAllSchedules(db);
    const cronSchedule = schedules.find((s) => s.type === "cron" && s.enabled === 1);
    let nextRunAt: string | null = cronSchedule?.next_run_at ?? null;
    if (!nextRunAt && cronSchedule) {
      try {
        nextRunAt = parseExpression(cronSchedule.value, { currentDate: new Date() }).next().toISOString();
      } catch {
        /* ignore */
      }
    }
    const systemEvents = getEvents(db, { eventPrefix: "system.", limit: 20 });
    const alerts = systemEvents.map((e) => ({ event: e.event, timestamp: e.timestamp, ...JSON.parse(e.data_json || "{}") }));
    const body = { last_scan: lastSnap ? { scanned_at: lastSnap.scanned_at, status: lastSnap.scan_status, total_tools: lastSnap.total_tools, outdated: lastSnap.outdated, probe_failed: lastSnap.probe_failed } : null, scheduler: { running: true, next_run_at: nextRunAt }, alerts };
    return { content: [{ type: "text" as const, text: JSON.stringify(body) }] };
  });

  server.registerResource("tools-all", "tools://all", { title: "All tools", mimeType: "application/json" }, async () => ({ contents: [{ uri: "tools://all", mimeType: "application/json", text: JSON.stringify(getLatestSnapshot(db)?.tools ?? []) }] }));
  server.registerResource("tools-outdated", "tools://outdated", { title: "Outdated tools", mimeType: "application/json" }, async () => ({ contents: [{ uri: "tools://outdated", mimeType: "application/json", text: JSON.stringify(getOutdatedTools(db)) }] }));
  server.registerResource("tools-category", new ResourceTemplate("tools://category/{name}", { list: async () => ({ resources: [] }) }), { title: "Tools by category", mimeType: "application/json" }, async (uri, { name }) => ({ contents: [{ uri: uri.href, mimeType: "application/json", text: JSON.stringify(getToolsWithFilters(db, { category: name })) }] }));
  server.registerResource("snapshots-latest", "snapshots://latest", { title: "Latest snapshot", mimeType: "application/json" }, async () => ({ contents: [{ uri: "snapshots://latest", mimeType: "application/json", text: JSON.stringify(getLatestSnapshot(db) ?? {}) }] }));
  server.registerResource("events-recent", "events://recent", { title: "Recent events", mimeType: "application/json" }, async () => ({ contents: [{ uri: "events://recent", mimeType: "application/json", text: JSON.stringify(getEvents(db, { limit: 50 })) }] }));
  server.registerResource("health-status", "health://status", { title: "System health", mimeType: "application/json" }, async () => {
    const snapshots = getSnapshotList(db, 1);
    const lastSnap = snapshots[0];
    const schedules = getAllSchedules(db);
    const cronSchedule = schedules.find((s) => s.type === "cron" && s.enabled === 1);
    const body = { last_scan: lastSnap ? { scanned_at: lastSnap.scanned_at, status: lastSnap.scan_status, outdated: lastSnap.outdated } : null, scheduler: { running: true, next_run_at: cronSchedule?.next_run_at ?? null }, alerts: [] };
    return { contents: [{ uri: "health://status", mimeType: "application/json", text: JSON.stringify(body) }] };
  });
  server.registerResource("schedules-all", "schedules://all", { title: "All schedules", mimeType: "application/json" }, async () => ({ contents: [{ uri: "schedules://all", mimeType: "application/json", text: JSON.stringify(getAllSchedules(db)) }] }));

  server.registerPrompt("update-summary", { title: "Update Summary", description: "Summarise everything that needs updating on the server, grouped by priority." }, async () => ({
    messages: [{ role: "user" as const, content: { type: "text" as const, text: "Use get_outdated, get_probe_failures, and get_events (recent) to produce a structured markdown summary with sections for: major (review required), minor/patch (safe to update), probe failures, and any system alerts." } }],
  }));
  server.registerPrompt("pre-update-check", { title: "Pre-Update Check", description: "Run a fresh scan and return a full pre-update report." }, async () => ({
    messages: [{ role: "user" as const, content: { type: "text" as const, text: "Use scan_now, poll get_scan_status until completed, then get_outdated and get_tools (filter systemd + pm2). Produce an ordered checklist: services to stop, updates to apply by stage, items to skip (major updates), estimated downtime." } }],
  }));

  return server;
}
