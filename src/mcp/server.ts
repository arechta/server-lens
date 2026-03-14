/**
 * MCP server — stdio transport for server-lens
 * @see docs/mcp.md
 */

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { loadConfig } from "../config/config-loader";
import { getDatabase } from "../db/database";
import { existsSync } from "fs";
import { createMcpServer } from "./create-server";

export async function startMcpServer(): Promise<void> {
  const config = loadConfig();
  const dbPath = config.dbPath;

  if (!existsSync(dbPath)) {
    console.error("server-lens mcp: No scan data yet. Run: server-lens scan --now");
    process.exit(1);
  }

  const db = getDatabase(dbPath);
  const server = createMcpServer(db);
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("server-lens MCP running on stdio");
}
