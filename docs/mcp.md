# mcp — Model Context Protocol Server

> Sub-document of `server-lens`. Referenced from `@AGENTS.md`.
> Covers: MCP server architecture, transport modes, full tool/resource/prompt specs,
> Claude Code integration config, and auth behaviour for remote MCP connections.

---

## What This Enables

When `server-lens` runs its MCP server, any MCP-compatible AI agent (Claude Code,
Cursor, custom agents via Anthropic SDK) gains direct, structured access to your
server's state — without SSH, without manual `jq` queries, without reading raw JSON.

An agent connected to `server-lens` MCP can:
- Ask "what's outdated on the server?" and get structured data back
- Trigger a fresh scan and wait for results before making recommendations
- Read recent events to understand what changed since the last scan
- Create or manage scan schedules through natural language
- Use pre-built prompts for common DevOps workflows

---

## Architecture

MCP is **not a separate process**. It shares the same binary, same SQLite database,
same probe engine, and same API port as `server-lens serve`.

Two transport modes, one server:

```
server-lens serve
       │
       ├── REST API    →  http://host:port/api/*        (existing)
       ├── MCP/SSE     →  http://host:port/mcp          (new endpoint, same port)
       └── MCP/stdio   →  server-lens mcp subcommand    (spawned by agent locally)
```

`server-lens mcp` (stdio) is a thin wrapper — it starts the same MCP handler but
communicates via stdin/stdout instead of HTTP. It does NOT start the REST API server.
It requires `server-lens.db` to exist (i.e. at least one scan has run).

---

## Transport Modes

### stdio — Local use with Claude Code

Claude Code spawns the `server-lens mcp` process directly and communicates via stdin/stdout.
No network required. Auth is not applicable — process-level trust.

Best for: local development machine, or SSH tunnel to remote server before running.

### HTTP/SSE — Remote use over network

MCP client connects to `http://host:port/mcp` using Server-Sent Events.
Auth follows the same rule as the REST API — required if `[api].host != "127.0.0.1"`.
The `/mcp` endpoint uses the same Bearer token from `[api].token`.

Best for: remote EC2/VM servers, n8n AI agent nodes, persistent team connections.

---

## TOML `[mcp]` Config Block

```toml
[mcp]
enabled = true     # Enable MCP server when running server-lens serve
                   # server-lens mcp (stdio) always works regardless of this flag
```

MCP has no separate port or auth config — it inherits `[api].host`, `[api].port`,
and `[api].token` entirely. One config block, one port, one token.

---

## Claude Code Integration

### stdio mode (recommended for local/SSH use)

Add to your project's `.claude/mcp.json` or Claude Code global MCP config:

```json
{
  "mcpServers": {
    "server-lens": {
      "command": "server-lens",
      "args": ["mcp"],
      "env": {}
    }
  }
}
```

If `server-lens` is on a remote server, use SSH stdio forwarding:

```json
{
  "mcpServers": {
    "server-lens": {
      "command": "ssh",
      "args": [
        "ubuntu@your-ec2-ip",
        "/usr/local/bin/server-lens mcp"
      ]
    }
  }
}
```

### HTTP/SSE mode (for persistent remote connection)

```json
{
  "mcpServers": {
    "server-lens": {
      "type": "sse",
      "url": "http://your-ec2-ip:7845/mcp",
      "headers": {
        "Authorization": "Bearer your-token"
      }
    }
  }
}
```

---

## MCP Tools (Read + Write)

All tools return structured JSON. Descriptions are agent-facing — they appear in the
agent's tool list and guide when/how to call each tool.

---

### `scan_now`
**Description:** Trigger an immediate server scan. Returns a job_id to track progress.
Only one scan can run at a time — call `get_scan_status` to poll for completion.

Input:
```typescript
{}  // No parameters required
```

Output (success):
```json
{
  "job_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "status": "queued",
  "message": "Scan queued. Poll get_scan_status with this job_id."
}
```

Output (scan already running):
```json
{
  "error": "scan_already_running",
  "job_id": "existing-job-id",
  "started_at": "2025-03-14T09:59:50.000Z"
}
```

---

### `get_scan_status`
**Description:** Check the status of a running or recently completed scan job.

Input:
```typescript
{
  job_id?: string   // Optional — omit to get status of most recent job
}
```

Output:
```json
{
  "job_id": "a1b2c3d4-...",
  "status": "completed",
  "triggered_by": "mcp",
  "started_at": "2025-03-14T10:00:01.000Z",
  "completed_at": "2025-03-14T10:00:14.000Z",
  "duration_ms": 13210,
  "snapshot_id": 42
}
```

---

### `get_tools`
**Description:** Query all tools discovered on the server. Supports filtering.
Use this to answer questions like "what's outdated?", "what runtimes are installed?",
"are there any major version updates available?".

Input:
```typescript
{
  category?:     string    // Filter by category: os|apt|snap|runtime|tools|container|systemd|pm2
  outdated?:     boolean   // true = only outdated tools
  update_type?:  string    // major|minor|patch|unknown|none|null
  probe_status?: string    // success|failed|timeout|rate_limited|skipped
  tool_status?:  string    // registered|auto|untracked
  limit?:        number    // Max results — default 100
}
```

Output: array of `VersionEntry` objects matching filters.

---

### `get_tool`
**Description:** Get full detail on a single tool by name, including probe metadata,
version history context, and release notes if available.

Input:
```typescript
{
  name: string    // Tool name e.g. "bun", "nginx", "n8n"
}
```

Output: single `VersionEntry` object, or `{ error: "not_found" }`.

---

### `get_outdated`
**Description:** Shortcut for common agent workflow — returns all outdated tools
grouped by update_type. Use this before making update recommendations.

Input:
```typescript
{
  category?: string    // Optional — scope to one category
}
```

Output:
```json
{
  "summary": {
    "total_outdated": 7,
    "by_update_type": { "major": 1, "minor": 3, "patch": 3 }
  },
  "tools": {
    "major": [ ...VersionEntry[] ],
    "minor": [ ...VersionEntry[] ],
    "patch": [ ...VersionEntry[] ]
  }
}
```

---

### `get_probe_failures`
**Description:** Returns all tools where the last probe attempt failed, timed out,
or was rate limited. Use this to diagnose scan health issues.

Input: `{}` (no parameters)

Output: array of `VersionEntry` where `probe_status !== "success"`, with `probe_error` populated.

---

### `get_events`
**Description:** Query the event log. Use this to understand what changed since
the last scan — new tools discovered, external updates detected, probe failures, etc.

Input:
```typescript
{
  event?:     string    // Filter by event name e.g. "tool.discovered", "version.outdated"
  tool_name?: string    // Filter by related tool name
  since?:     string    // ISO 8601 datetime — events after this time only
  limit?:     number    // Default 50, max 200
}
```

Output: array of `EventPayload` objects.

---

### `get_snapshots`
**Description:** List scan history — timestamps, durations, and summary counts.
Use to understand scan frequency and historical trends.

Input:
```typescript
{
  limit?: number    // Default 10, max 50
}
```

Output: array of snapshot metadata (no full payload — use `get_snapshot` for that).

---

### `get_snapshot`
**Description:** Get the full payload of a specific snapshot by id.
Returns the complete `VersionEntry` array from that point in time.

Input:
```typescript
{
  id: number    // Snapshot id from get_snapshots
}
```

Output: full snapshot object including `tools` array.

---

### `get_schedules`
**Description:** List all configured scan schedules — both TOML-seeded and API/MCP-created.

Input: `{}` (no parameters)

Output: array of schedule objects including `next_run_at` and `last_run_at`.

---

### `create_schedule`
**Description:** Create a new scan schedule. Use `type: "cron"` for recurring schedules
or `type: "one-time"` for a single future scan.

Input:
```typescript
{
  name:    string    // Human label e.g. "pre-deploy check"
  type:    "cron" | "one-time"
  value:   string    // Cron expression OR ISO 8601 datetime
  enabled: boolean   // Default true
}
```

Output: created schedule object with computed `next_run_at`.

Common errors: `invalid_cron`, `invalid_datetime`, `datetime_in_past`.

---

### `toggle_schedule`
**Description:** Enable or disable a scan schedule by id. Use to pause a recurring
schedule without deleting it.

Input:
```typescript
{
  id:      number
  enabled: boolean
}
```

Output: updated schedule object.

---

### `get_system_health`
**Description:** Get overall server health snapshot — last scan summary, scheduler
state, probe failure count, and any active system alerts (reboot required, disk warning,
degraded services).

Input: `{}` (no parameters)

Output:
```json
{
  "last_scan": {
    "scanned_at": "2025-03-14T06:00:14.000Z",
    "status": "completed",
    "duration_ms": 11200,
    "total_tools": 42,
    "outdated": 7,
    "probe_failed": 2
  },
  "scheduler": {
    "running": true,
    "next_run_at": "2025-03-14T12:00:00.000Z"
  },
  "alerts": [
    { "event": "system.reboot_required", "timestamp": "2025-03-14T06:00:14.000Z" }
  ]
}
```

---

## MCP Resources

Resources are read-only data URIs the agent can subscribe to or read on demand.

| URI | Description |
|---|---|
| `tools://all` | Full `VersionEntry` array from latest snapshot |
| `tools://outdated` | Filtered to `is_outdated = true` |
| `tools://category/{name}` | Filtered by category e.g. `tools://category/runtime` |
| `tools://update-type/{type}` | Filtered by update_type e.g. `tools://update-type/major` |
| `snapshots://latest` | Most recent full snapshot including payload |
| `snapshots://list` | Snapshot history metadata (no payload) |
| `events://recent` | Last 50 events across all types |
| `events://type/{event}` | Events filtered by name e.g. `events://type/tool.discovered` |
| `health://status` | Current health — same as `get_system_health` tool output |
| `schedules://all` | All schedule entries |

Resources are automatically refreshed after each completed scan — agents subscribed
to a resource receive updated data without polling.

---

## MCP Prompts

Pre-built prompt templates for common DevOps workflows.
Agents can invoke these directly; they compose multiple tool calls internally.

---

### `update-summary`
**Description:** Summarise everything that needs updating on the server, grouped by
priority. Includes safe-to-auto-update items and items requiring human review.

Composes: `get_outdated` → `get_probe_failures` → `get_events` (recent)

Agent output format: structured markdown with sections for major (review required),
minor/patch (safe to update), probe failures, and any system alerts.

---

### `pre-update-check`
**Description:** Run a fresh scan and return a full pre-update report — what will
be affected, what services need stopping, what requires manual review. Use this
before starting a maintenance window.

Composes: `scan_now` → poll `get_scan_status` → `get_outdated` → `get_tools` (systemd + pm2)

Agent output format: ordered checklist — services to stop, updates to apply by stage,
items to skip (major updates), estimated downtime.

---

### `diagnose-probes`
**Description:** Investigate why some tools couldn't be checked for latest versions.
Identifies rate limiting, network failures, and misconfigured probe definitions.

Composes: `get_probe_failures` → `get_events` (probe.* events) → `get_system_health`

Agent output format: grouped by failure type with suggested fixes
(e.g. "Add github_token to server-lens.toml to avoid rate limiting").

---

### `what-changed`
**Description:** Summarise what changed on the server since a given time or since
the previous scan. Covers new tools discovered, external updates applied by others,
and version regressions.

Input: `since` (optional ISO 8601 — defaults to previous scan timestamp)

Composes: `get_events` (since) → `get_snapshots` (last 2) → diff tool arrays

Agent output format: chronological change log — new installs, removals, version changes,
who/what triggered them (api/cron/cli/mcp).

---

## Repository Structure — MCP Files

```
src/
├── mcp/
│   ├── server.ts           ← MCP server init — registers tools, resources, prompts
│   ├── transport/
│   │   ├── stdio.ts        ← stdio transport handler (server-lens mcp subcommand)
│   │   └── sse.ts          ← SSE transport handler (/mcp HTTP endpoint in serve)
│   ├── tools/
│   │   ├── scan.ts         ← scan_now, get_scan_status
│   │   ├── tools.ts        ← get_tools, get_tool, get_outdated, get_probe_failures
│   │   ├── events.ts       ← get_events
│   │   ├── snapshots.ts    ← get_snapshots, get_snapshot
│   │   ├── schedules.ts    ← get_schedules, create_schedule, toggle_schedule
│   │   └── health.ts       ← get_system_health
│   ├── resources/
│   │   └── registry.ts     ← Registers all resource URIs + refresh handlers
│   └── prompts/
│       ├── update-summary.ts
│       ├── pre-update-check.ts
│       ├── diagnose-probes.ts
│       └── what-changed.ts
```

---

## Agent Rules (MCP-specific)

- **MCP tools share the same DB repos as the REST API.** Never duplicate DB query logic —
  import from `src/db/*-repo.ts` in both `src/api/routes/` and `src/mcp/tools/`.
- **stdio transport must be silent on stdout except for MCP protocol messages.**
  All logging in stdio mode goes to stderr. Any stray stdout breaks the MCP protocol.
- **MCP tool descriptions are agent-facing documentation.** Write them as clear, specific
  instructions to the AI — not as terse technical labels. The agent reads these to decide
  when and how to call the tool.
- **Resources refresh after every completed scan.** The resource registry subscribes to
  the scan completion event and pushes updated data to connected clients.
- **Prompts orchestrate tools — they do not bypass them.** Prompt implementations call
  the same tool handler functions as direct tool calls. No separate DB queries in prompt files.
- **Auth for SSE transport mirrors REST API.** The `/mcp` SSE endpoint uses the same
  Bearer token middleware from `src/api/middleware/auth.ts`. No separate MCP auth config.
- **One scan at a time — MCP and REST share the same scan lock.** If a scan is triggered
  via `POST /api/scan` (REST) and then `scan_now` (MCP) is called, the MCP tool returns
  the existing job_id with status `scan_already_running`. The lock is process-wide.
