#!/usr/bin/env bun
/**
 * server-lens — CLI entry point
 * Snapshot server state. Stage 1 of DevOps pipeline.
 * @see AGENTS.md
 */

import React from "react";
import { render } from "ink";
import { App } from "./ui/App";
import { loadConfig } from "./config/config-loader";
import { getDatabase } from "./db/database";
import { getLatestSnapshot } from "./db/snapshots-repo";
import type { SnapshotSummary, VersionEntry } from "./schema/types";
import { existsSync } from "fs";

const args = process.argv.slice(2);
const subcommand = args[0];
const hasJson = args.includes("--json");
const hasOutdated = args.includes("--outdated");
const categoryIdx = args.indexOf("--category");
const categoryName = categoryIdx >= 0 ? args[categoryIdx + 1] : null;

// server-lens scan — run real scanners + probes
if (subcommand === "scan") {
  const { runScan } = await import("./scanner/run-scan");
  await runScan();
  if (args.includes("--now")) {
    // Fall through to display mode
  } else {
    console.log("Scan complete. Run 'server-lens' to view results.");
    process.exit(0);
  }
}

// server-lens status — last scan, next scheduled, health
if (subcommand === "status") {
  const { runStatus } = await import("./cli/status");
  runStatus();
  process.exit(0);
}

// server-lens events — event log
if (subcommand === "events") {
  const { runEvents } = await import("./cli/events");
  runEvents(args);
  process.exit(0);
}

// server-lens mcp — MCP stdio server (for Claude Code, Cursor, etc.)
if (subcommand === "mcp") {
  const { startMcpServer } = await import("./mcp/server");
  await startMcpServer();
  // Server keeps process alive
}

// server-lens serve — REST API server
if (subcommand === "serve") {
  const portIdx = args.indexOf("--port");
  const hostIdx = args.indexOf("--host");
  const port = portIdx >= 0 ? parseInt(args[portIdx + 1], 10) : undefined;
  const host = hostIdx >= 0 ? args[hostIdx + 1] : undefined;
  const { startServe } = await import("./api/server");
  await startServe({ port, host });
  // Server keeps process alive; no display mode
} else if (subcommand !== "mcp") {

function loadSnapshotData(): {
  snapshot: SnapshotSummary | null;
  config: ReturnType<typeof loadConfig>;
} {
  const config = loadConfig();
  if (!existsSync(config.dbPath)) {
    return { snapshot: null, config };
  }
  const db = getDatabase(config.dbPath);
  return { snapshot: getLatestSnapshot(db), config };
}

function getToolsForDisplay(snapshot: SnapshotSummary | null): VersionEntry[] {
  if (!snapshot) return [];

  let tools = snapshot.tools;
  if (hasOutdated) {
    tools = tools.filter((t) => t.is_outdated);
  }
  if (categoryName) {
    tools = tools.filter((t) => t.category === categoryName);
  }
  return tools;
}

// --json: output JSON from DB (or empty if no scan yet)
if (hasJson) {
  const { snapshot } = loadSnapshotData();
  let output: SnapshotSummary = snapshot ?? {
    schema_version: "1",
    scanned_at: new Date().toISOString(),
    hostname: "localhost",
    summary: {
      total: 0,
      outdated: 0,
      untracked: 0,
      probe_failed: 0,
      by_update_type: {
        major: 0,
        minor: 0,
        patch: 0,
        unknown: 0,
        none: 0,
        null: 0,
      },
      by_category: {} as Record<string, number>,
    },
    tools: [],
  };
  if (output.tools.length > 0) {
    let tools = output.tools;
    if (hasOutdated) tools = tools.filter((t) => t.is_outdated);
    if (categoryName) tools = tools.filter((t) => t.category === categoryName);
    output = { ...output, tools };
  }
  console.log(JSON.stringify(output, null, 2));
  process.exit(0);
}

// Display mode — read snapshot, render TUI (or after scan --now)
const { snapshot, config } = loadSnapshotData();
const tools = getToolsForDisplay(snapshot);

render(
  <App
    snapshot={snapshot}
    tools={tools}
    themeName={(config.theme?.name as "claude" | "claude-blue") ?? "claude"}
    filterOutdated={hasOutdated}
    filterCategory={categoryName}
  />
);
}
