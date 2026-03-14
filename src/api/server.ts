/**
 * REST API server — Bun.serve
 * @see docs/pipeline.md, AGENTS.md
 */

import { loadConfig } from "../config/config-loader";
import { getDatabase } from "../db/database";
import { seedScheduleFromToml } from "../db/schedules-repo";
import { requireAuth, mustRefuseStart } from "./middleware/auth";
import { handleHealth } from "./routes/health";
import { handleToolsList, handleToolByName } from "./routes/tools";
import { handleSnapshotsList, handleSnapshotById } from "./routes/snapshots";
import { handleEvents } from "./routes/events";
import {
  handleScanPost,
  handleScanStatus,
} from "./routes/scan";
import {
  handleSchedulesList,
  handleSchedulesPost,
  handleSchedulesPatch,
  handleSchedulesDelete,
} from "./routes/schedules";
import { handleWebhooksLog } from "./routes/webhooks";
import { createMcpServer } from "../mcp/create-server";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { existsSync } from "fs";
import { getRunningScanJob } from "../db/scan-jobs-repo";
import { runScan } from "../scanner/run-scan";
import { parseExpression } from "cron-parser";

const PKG = await Bun.file(new URL("../../package.json", import.meta.url)).json().catch(() => ({}));
const VERSION = (PKG as { version?: string }).version ?? "0.1.0";

export interface ServeOptions {
  host?: string;
  port?: number;
}

export async function startServe(options: ServeOptions = {}): Promise<void> {
  const config = loadConfig();
  const api = config.api ?? { host: "127.0.0.1", port: 7845 };
  const host = options.host ?? api.host;
  const port = options.port ?? api.port;
  const token = api.token;

  // Auth guard: non-localhost requires token
  if (mustRefuseStart(host, token)) {
    console.error(
      "Error: [api].host is not 127.0.0.1 but [api].token is not set. " +
        "Set token in server-lens.toml to expose the API on the network."
    );
    process.exit(1);
  }

  const dbPath = config.dbPath;
  if (!existsSync(dbPath)) {
    // Ensure DB exists
    getDatabase(dbPath);
  }
  const db = getDatabase(dbPath);

  // Bootstrap schedules from TOML if empty
  await seedScheduleFromToml(db, config.settings.scan_schedule);

  // Scheduler: tick every minute, run due scans
  const runScheduler = async () => {
    const now = new Date();
    const rows = db.query("SELECT * FROM schedules WHERE enabled = 1").all() as {
      id: number;
      name: string;
      type: string;
      value: string;
      next_run_at: string | null;
    }[];
    for (const row of rows) {
      if (!row.next_run_at) continue;
      const due = new Date(row.next_run_at);
      if (due > now) continue;
      if (getRunningScanJob(db)) continue; // Skip if scan already running
      try {
        const { snapshotId } = await runScan();
        const nextRun =
          row.type === "cron"
            ? parseExpression(row.value, { currentDate: now }).next().toISOString()
            : null;
        db.run(
          "UPDATE schedules SET last_run_at = ?, next_run_at = ?, enabled = ? WHERE id = ?",
          [now.toISOString(), nextRun, row.type === "one-time" ? 0 : 1, row.id]
        );
      } catch (err) {
        console.error(`[scheduler] Scan failed for schedule ${row.name}:`, err);
      }
    }
  };
  setInterval(runScheduler, 60_000);
  runScheduler(); // Run once on startup to catch up

  const authResult = (req: Request) => requireAuth(req, token);

  const server = Bun.serve({
    hostname: host,
    port,
    async fetch(req) {
      const url = new URL(req.url);
      const path = url.pathname;

      // Auth check for /api/* (skip for health if desired — we auth all)
      const auth = authResult(req);
      if (!auth.ok) {
        return Response.json(auth.body, { status: auth.status });
      }

      // Route: /api/health
      if (path === "/api/health" && req.method === "GET") {
        return handleHealth(db, { host, port, token }, VERSION);
      }

      // Route: /api/tools
      if (path === "/api/tools" && req.method === "GET") {
        return handleToolsList(db, url);
      }
      const toolsMatch = path.match(/^\/api\/tools\/([^/]+)$/);
      if (toolsMatch && req.method === "GET") {
        return handleToolByName(db, decodeURIComponent(toolsMatch[1]));
      }

      // Route: /api/snapshots
      if (path === "/api/snapshots" && req.method === "GET") {
        return handleSnapshotsList(db, url);
      }
      const snapMatch = path.match(/^\/api\/snapshots\/(\d+)$/);
      if (snapMatch && req.method === "GET") {
        return handleSnapshotById(db, snapMatch[1]);
      }

      // Route: /api/events
      if (path === "/api/events" && req.method === "GET") {
        return handleEvents(db, url);
      }

      // Route: /api/scan
      if (path === "/api/scan" && req.method === "POST") {
        return handleScanPost(db);
      }
      if (path === "/api/scan/status" && req.method === "GET") {
        return handleScanStatus(db, url);
      }

      // Route: /api/schedules
      if (path === "/api/schedules" && req.method === "GET") {
        return handleSchedulesList(db);
      }
      if (path === "/api/schedules" && req.method === "POST") {
        const body = await req.json().catch(() => ({}));
        return handleSchedulesPost(db, body);
      }
      const schedPatchMatch = path.match(/^\/api\/schedules\/(\d+)$/);
      if (schedPatchMatch && req.method === "PATCH") {
        const body = await req.json().catch(() => ({}));
        return handleSchedulesPatch(db, schedPatchMatch[1], body);
      }
      if (schedPatchMatch && req.method === "DELETE") {
        return handleSchedulesDelete(db, schedPatchMatch[1]);
      }

      // Route: /api/webhooks/log
      if (path === "/api/webhooks/log" && req.method === "GET") {
        return handleWebhooksLog(db, url);
      }

      // Route: /mcp — MCP SSE endpoint (when [mcp].enabled)
      if (path === "/mcp" && config.mcp?.enabled !== false) {
        const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined });
        const mcpServer = createMcpServer(db);
        await mcpServer.connect(transport);
        return transport.handleRequest(req);
      }

      // 404
      return Response.json(
        { error: "not_found", message: `Not found: ${path}`, status: 404 },
        { status: 404 }
      );
    },
  });

  console.log(`server-lens API listening on http://${host}:${port}`);
  console.log(`  Health: http://${host}:${port}/api/health`);
  if (config.mcp?.enabled !== false) {
    console.log(`  MCP:    http://${host}:${port}/mcp`);
  }
}
