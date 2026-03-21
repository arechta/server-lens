# data-schema — Output Contract & Storage Schema

> Sub-document of `server-lens`. Referenced from `@AGENTS.md`.
> Covers: VersionEntry JSON schema, SQLite table definitions, event payload shapes,
> and the public data contract between `server-lens` and all downstream consumers.

---

## The Public Contract

The JSON output of `server-lens --json` is a **public contract**.
Downstream pipeline tools (Stage 2, 3, 4+), n8n workflows, future REST API consumers,
and webhook receivers all depend on these field names and types.

**Rules:**
- Never rename or remove a field from `VersionEntry` or `EventPayload` without a migration plan
- Additive changes (new optional fields) are non-breaking and allowed
- All breaking changes must bump the `schema_version` field in snapshot output

---

## Category Enum

Every `VersionEntry` belongs to exactly one category.

| Value | Covers |
|---|---|
| `os` | Distro, kernel, architecture |
| `apt` | dpkg/apt-installed packages |
| `snap` | Snap-installed packages |
| `runtime` | Node, Bun, nvm, npm, pnpm, and the pm2 package itself as a runtime tool |
| `tools` | CLI utilities — nginx, gh, certbot, docker engine binary, etc. |
| `container` | Docker Compose / container apps — n8n, Outline, Mailu, OnlyOffice, etc. |
| `systemd` | systemd-managed units tracked for service state and version |
| `pm2` | PM2-managed application processes |

Categories map directly to pipeline stage consumers:

```
category == "os"        → Stage 3: OS updater
category == "apt"       → Stage 3: OS updater (apt upgrade)
category == "runtime"   → Stage 4: runtime updater
category == "systemd"   → Stage 2: service stopper (systemctl stop)
category == "pm2"       → Stage 2: service stopper (pm2 stop)
category == "container" → Stage N: container updater (docker compose pull)
```

---

## UpdateType Enum

Replaces the old `is_major_update: boolean`. Describes the *nature* of the available
update, enabling fine-grained routing in downstream tools and n8n workflows.

| Value | Meaning | `is_outdated` |
|---|---|---|
| `major` | semver X bump — e.g. `1.4.2` → `2.0.0`. Likely breaking. Requires human review before updating. | `true` |
| `minor` | semver Y bump — e.g. `1.2.3` → `1.3.0`. New features, generally safe. | `true` |
| `patch` | semver Z bump — e.g. `1.2.3` → `1.2.4`. Bugfix or security fix. Safe for auto-update. | `true` |
| `unknown` | Version strings present but not parseable as semver (date-based, custom, build hashes). Cannot classify. | `true` |
| `none` | `current_version == latest_version`. Tool is up to date. | `false` |
| `null` | `latest_version` is null — untracked or probe failed. Cannot determine. | `false` |

`is_outdated` remains as a fast boolean filter. `update_type` gives the detail.

Typical downstream routing:
```bash
# Safe to auto-update (Stage 3/4)
jq '.tools[] | select(.update_type == "patch")'

# Queue for human review before updating
jq '.tools[] | select(.update_type == "major")'

# Needs investigation — version scheme not understood
jq '.tools[] | select(.update_type == "unknown")'

# Everything that needs attention
jq '.tools[] | select(.is_outdated == true)'
```

---

## ReleaseNotesSource Enum

Release notes are **opt-in** — only populated when `--with-notes` flag is passed.
In default mode and all pipeline JSON output, `release_notes` and `release_notes_source`
are always `null`. This keeps default scans fast and JSON output lean.

| Value | Source | Quality |
|---|---|---|
| `github-release` | GitHub Releases API `body` field — full markdown as authored | Excellent |
| `apt-changelog` | `apt-get changelog <package>` — latest entry only, Debian format parsed to text | Good, inconsistent across packages |
| `npm-readme` | npm registry `readme` or `description` field — not a true changelog | Low, fallback only |
| `none` | Source is known but returned no notes content | N/A |

### How release notes are fetched per probe type

| Probe type | Notes source | Extra API call needed? |
|---|---|---|
| `github` | `github-release` — `body` field in releases/latest response | ❌ No — free |
| `ghcr` | `github-release` — GHCR images trace back to GitHub repo releases | ❌ No — free |
| `apt` | `apt-changelog` — runs `apt-get changelog <package>`, parses top entry | ✅ Yes — local subprocess |
| `npm` | `npm-readme` — from registry response, low quality | ❌ No — already in response |
| `dockerhub` | `none` — Docker Hub has no structured changelog | N/A |
| `binary` / `script` | `none` — no upstream source known | N/A |

### `--with-notes` flag behaviour

- Active only when explicitly passed — never runs during default display mode or cron scans
- Notes fetched in the same probe pass — no second scan needed
- `apt-changelog` subprocess only runs when `--with-notes` is active
- Notes are stored in the snapshot `payload_json` in SQLite when `--with-notes` is used
- `server-lens notes <tool>` subcommand fetches and renders notes for one tool on demand
  without running a full scan — useful for quick pre-update review in the TUI

---

## JSON Output Structure

`server-lens --json` outputs a top-level object:

```json
{
  "schema_version": "1",
  "scanned_at": "2025-03-14T08:00:00.000Z",
  "hostname": "prod-backend-01",
  "summary": {
    "total": 42,
    "outdated": 7,
    "untracked": 5,
    "probe_failed": 2,
    "by_update_type": {
      "major": 1,
      "minor": 3,
      "patch": 3,
      "unknown": 0,
      "none": 35,
      "null": 5
    },
    "by_category": {
      "os": 1,
      "apt": 18,
      "snap": 1,
      "runtime": 8,
      "tools": 6,
      "container": 5,
      "systemd": 2,
      "pm2": 1
    }
  },
  "tools": [ ...VersionEntry[] ]
}
```

---

## VersionEntry — Core Data Unit

One `VersionEntry` per tool. Atomic unit consumed by all downstream tools.

```typescript
interface VersionEntry {
  // ── Identity ──────────────────────────────────────────────────────────────
  name:                 string           // e.g. "nginx", "bun", "n8n"
  display_name:         string           // Human-friendly e.g. "NGINX", "Bun Runtime"
  category:             ToolCategory     // See Category Enum above
  tool_status:          ToolStatus       // "registered" | "auto" | "untracked"

  // ── Version ───────────────────────────────────────────────────────────────
  current_version:      string | null    // What is installed right now
  latest_version:       string | null    // Latest available upstream (null if untracked/failed)
  is_outdated:          boolean          // true when current_version < latest_version
  update_type:          UpdateType       // See UpdateType Enum above
  latest_release_date:  string | null    // ISO 8601 date of latest upstream release

  // ── Probe Metadata ────────────────────────────────────────────────────────
  probe_type:           ProbeType | null // "apt"|"github"|"npm"|"node"|"dockerhub"|"ghcr"|"snap"|"binary"|"script"|null
  probe_status:         ProbeStatus      // "success"|"failed"|"timeout"|"rate_limited"|"skipped"
  probe_source:         string | null    // Upstream URL or command queried
  probe_error:          string | null    // Error message if probe_status !== "success"

  // ── Links ─────────────────────────────────────────────────────────────────
  repo_url:             string | null    // Repository or release page URL

  // ── Release Notes (opt-in — null unless --with-notes flag is passed) ────────
  release_notes:        string | null    // Markdown string — null in default/pipeline mode
  release_notes_source: ReleaseNotesSource | null  // See ReleaseNotesSource enum

  // ── Timestamps ────────────────────────────────────────────────────────────
  last_checked_at:      string           // ISO 8601 — when this probe last ran
  first_seen_at:        string           // ISO 8601 — when tool was first discovered
}
```

### ToolStatus Values

| Value | Meaning |
|---|---|
| `registered` | Explicitly defined in `[[probes]]` in TOML — has full probe definition |
| `auto` | Not in TOML but probed automatically via apt fallback |
| `untracked` | Found on system but no probe available — `latest_version` is always `null` |

### ProbeStatus Values

| Value | Meaning |
|---|---|
| `success` | Probe ran and returned a valid latest version |
| `failed` | Probe ran but upstream returned an error or unparseable response |
| `timeout` | Probe exceeded `scan_timeout_seconds` from TOML `[settings]` |
| `rate_limited` | GitHub API rate limit hit — probe skipped after first 429 response |
| `skipped` | Probe not run — display mode, or scan aborted early |

---

## VersionEntry — Concrete Examples

### Outdated apt tool (patch update)
```json
{
  "name": "nginx",
  "display_name": "NGINX",
  "category": "apt",
  "tool_status": "registered",
  "current_version": "1.24.0",
  "latest_version": "1.24.1",
  "is_outdated": true,
  "update_type": "patch",
  "latest_release_date": "2024-08-14T00:00:00.000Z",
  "probe_type": "apt",
  "probe_status": "success",
  "probe_source": "apt-cache policy nginx",
  "probe_error": null,
  "repo_url": null,
  "last_checked_at": "2025-03-14T08:00:00.000Z",
  "first_seen_at": "2025-01-01T00:00:00.000Z"
}
```

### GitHub runtime with major update available
```json
{
  "name": "bun",
  "display_name": "Bun",
  "category": "runtime",
  "tool_status": "registered",
  "current_version": "1.1.29",
  "latest_version": "2.0.0",
  "is_outdated": true,
  "update_type": "major",
  "latest_release_date": "2025-03-10T00:00:00.000Z",
  "probe_type": "github",
  "probe_status": "success",
  "probe_source": "https://api.github.com/repos/oven-sh/bun/releases/latest",
  "probe_error": null,
  "repo_url": "https://github.com/oven-sh/bun",
  "last_checked_at": "2025-03-14T08:00:00.000Z",
  "first_seen_at": "2025-01-15T00:00:00.000Z"
}
```

### Container app (up to date)
```json
{
  "name": "n8n",
  "display_name": "n8n",
  "category": "container",
  "tool_status": "registered",
  "current_version": "1.85.0",
  "latest_version": "1.85.0",
  "is_outdated": false,
  "update_type": "none",
  "latest_release_date": "2025-03-01T00:00:00.000Z",
  "probe_type": "dockerhub",
  "probe_status": "success",
  "probe_source": "https://hub.docker.com/v2/repositories/n8nio/n8n/tags",
  "probe_error": null,
  "repo_url": "https://hub.docker.com/r/n8nio/n8n",
  "last_checked_at": "2025-03-14T08:00:00.000Z",
  "first_seen_at": "2025-01-01T00:00:00.000Z"
}
```

### PM2 process
```json
{
  "name": "api-gateway",
  "display_name": "api-gateway",
  "category": "pm2",
  "tool_status": "untracked",
  "current_version": null,
  "latest_version": null,
  "is_outdated": false,
  "update_type": "null",
  "latest_release_date": null,
  "probe_type": null,
  "probe_status": "skipped",
  "probe_source": null,
  "probe_error": null,
  "repo_url": null,
  "last_checked_at": "2025-03-14T08:00:00.000Z",
  "first_seen_at": "2025-01-01T00:00:00.000Z"
}
```

### Untracked binary (unknown version scheme)
```json
{
  "name": "some-internal-tool",
  "display_name": "some-internal-tool",
  "category": "tools",
  "tool_status": "untracked",
  "current_version": "20240301-build42",
  "latest_version": null,
  "is_outdated": false,
  "update_type": "null",
  "latest_release_date": null,
  "probe_type": "binary",
  "probe_status": "success",
  "probe_source": "some-internal-tool --version",
  "probe_error": null,
  "repo_url": null,
  "last_checked_at": "2025-03-14T08:00:00.000Z",
  "first_seen_at": "2025-03-14T08:00:00.000Z"
}
```

---

## SQLite Table Schemas

### `tools` table
Current known state of every tool. One row per tool — upserted on each scan.

```sql
CREATE TABLE tools (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  name                TEXT NOT NULL UNIQUE,
  display_name        TEXT NOT NULL,
  category            TEXT NOT NULL,       -- ToolCategory enum value
  tool_status         TEXT NOT NULL,       -- registered | auto | untracked
  current_version     TEXT,
  latest_version      TEXT,
  is_outdated         INTEGER NOT NULL DEFAULT 0,  -- 0 | 1
  update_type         TEXT NOT NULL DEFAULT 'null', -- UpdateType enum value
  latest_release_date TEXT,                -- ISO 8601
  probe_type          TEXT,
  probe_status        TEXT NOT NULL,
  probe_source        TEXT,
  probe_error         TEXT,
  repo_url            TEXT,
  release_notes        TEXT,                -- Markdown — only populated with --with-notes
  release_notes_source TEXT,               -- ReleaseNotesSource enum value or null
  last_checked_at      TEXT NOT NULL,      -- ISO 8601
  first_seen_at        TEXT NOT NULL       -- ISO 8601
);
```

### `snapshots` table
One row per completed scan. Full JSON payload stored for historical diffing.

```sql
CREATE TABLE snapshots (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  scanned_at    TEXT NOT NULL,      -- ISO 8601
  hostname      TEXT NOT NULL,
  total_tools   INTEGER NOT NULL,
  outdated      INTEGER NOT NULL,
  probe_failed  INTEGER NOT NULL,
  untracked     INTEGER NOT NULL,
  scan_status   TEXT NOT NULL,      -- completed | partial | failed
  payload_json  TEXT NOT NULL       -- Full JSON snapshot (the --json output)
);
```

### `events` table
One row per event. Append-only — never updated, never deleted by the tool.

```sql
CREATE TABLE events (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  event        TEXT NOT NULL,       -- e.g. "tool.discovered", "version.outdated"
  severity     TEXT NOT NULL,       -- info | warning | error
  timestamp    TEXT NOT NULL,       -- ISO 8601
  tool_name    TEXT,                -- Related tool name if applicable
  scan_id      INTEGER,             -- FK → snapshots.id
  data_json    TEXT NOT NULL        -- Event-specific payload as JSON string
);
```

### `webhooks_log` table
Delivery log. One row per delivery attempt.

```sql
CREATE TABLE webhooks_log (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id        INTEGER NOT NULL,  -- FK → events.id
  event           TEXT NOT NULL,
  endpoint_url    TEXT NOT NULL,
  attempted_at    TEXT NOT NULL,     -- ISO 8601
  http_status     INTEGER,           -- null if request failed before receiving response
  success         INTEGER NOT NULL,  -- 0 | 1
  error_message   TEXT               -- null on success
);
```

### `schedules` table
Scan schedule entries. Both one-time and recurring. API-managed.
Seeded from `[settings].scan_schedule` in TOML on first run if table is empty.

```sql
CREATE TABLE schedules (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  name         TEXT NOT NULL,           -- Human label e.g. "nightly deep scan"
  type         TEXT NOT NULL,           -- "one-time" | "cron"
  value        TEXT NOT NULL,           -- ISO 8601 datetime (one-time) OR cron expression (cron)
  enabled      INTEGER NOT NULL DEFAULT 1,  -- 0 | 1
  last_run_at  TEXT,                    -- ISO 8601 or null
  next_run_at  TEXT,                    -- ISO 8601, computed after each run
  created_at   TEXT NOT NULL,           -- ISO 8601
  created_by   TEXT NOT NULL DEFAULT 'system'  -- "system" (TOML seed) | "api"
);
```

### `scan_jobs` table
Tracks async scan jobs triggered via `POST /api/scan`.
One row per API-triggered scan. Cron/scheduled scans are also recorded here.

```sql
CREATE TABLE scan_jobs (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  job_id       TEXT NOT NULL UNIQUE,    -- UUID v4 — returned to API caller immediately
  triggered_by TEXT NOT NULL,           -- "api" | "cron" | "schedule" | "cli"
  status       TEXT NOT NULL,           -- "queued" | "running" | "completed" | "failed"
  started_at   TEXT,                    -- ISO 8601 or null if still queued
  completed_at TEXT,                    -- ISO 8601 or null if not done
  duration_ms  INTEGER,                 -- null until completed
  snapshot_id  INTEGER,                 -- FK → snapshots.id, null until completed
  error        TEXT,                    -- null on success
  created_at   TEXT NOT NULL            -- ISO 8601
);
```

---

## API Request & Response Shapes

### `POST /api/scan` — Trigger scan now

Request: no body required.

Response `202 Accepted`:
```json
{
  "job_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "status": "queued",
  "triggered_by": "api",
  "created_at": "2025-03-14T10:00:00.000Z"
}
```

Response `409 Conflict` (scan already running):
```json
{
  "error": "scan_already_running",
  "message": "A scan is currently in progress",
  "job_id": "existing-job-id",
  "started_at": "2025-03-14T09:59:50.000Z"
}
```

---

### `GET /api/scan/status` — Poll scan state

Response when running:
```json
{
  "job_id": "a1b2c3d4-...",
  "status": "running",
  "triggered_by": "api",
  "started_at": "2025-03-14T10:00:01.000Z",
  "duration_ms": 4200,
  "completed_at": null,
  "snapshot_id": null
}
```

Response when completed:
```json
{
  "job_id": "a1b2c3d4-...",
  "status": "completed",
  "triggered_by": "api",
  "started_at": "2025-03-14T10:00:01.000Z",
  "completed_at": "2025-03-14T10:00:14.000Z",
  "duration_ms": 13210,
  "snapshot_id": 42
}
```

---

### `POST /api/schedules` — Create schedule entry

Request body:
```json
{
  "name": "nightly deep scan",
  "type": "cron",
  "value": "0 2 * * *",
  "enabled": true
}
```

One-time example:
```json
{
  "name": "pre-deploy check",
  "type": "one-time",
  "value": "2025-03-20T02:00:00.000Z",
  "enabled": true
}
```

Response `201 Created`:
```json
{
  "id": 3,
  "name": "nightly deep scan",
  "type": "cron",
  "value": "0 2 * * *",
  "enabled": true,
  "next_run_at": "2025-03-15T02:00:00.000Z",
  "last_run_at": null,
  "created_at": "2025-03-14T10:05:00.000Z",
  "created_by": "api"
}
```

---

### `PATCH /api/schedules/:id` — Update schedule

Request body (all fields optional — partial update):
```json
{
  "enabled": false
}
```

```json
{
  "value": "0 4 * * *",
  "name": "nightly deep scan (rescheduled)"
}
```

Response `200 OK`: updated schedule object (same shape as POST response).

---

### `GET /api/tools` — Query params

| Param | Type | Description |
|---|---|---|
| `category` | string | Filter by category enum value e.g. `?category=runtime` |
| `outdated` | boolean | `?outdated=true` — only outdated tools |
| `update_type` | string | `?update_type=major` — filter by update severity |
| `probe_status` | string | `?probe_status=failed` — filter by probe result |
| `status` | string | `?status=untracked` — filter by tool_status |

---

## API Error Response Shape

All API errors use a consistent envelope:

```typescript
interface ApiError {
  error:   string    // Machine-readable error code e.g. "scan_already_running"
  message: string    // Human-readable description
  status:  number    // HTTP status code mirrored in body for convenience
}
```

Common error codes:

| Code | HTTP Status | Meaning |
|---|---|---|
| `unauthorized` | 401 | Missing or invalid Bearer token |
| `not_found` | 404 | Resource not found |
| `scan_already_running` | 409 | POST /api/scan when scan in progress |
| `invalid_cron` | 422 | Cron expression failed validation |
| `invalid_datetime` | 422 | One-time datetime is in the past or malformed |
| `schedule_not_found` | 404 | PATCH/DELETE on unknown schedule id |
| `internal_error` | 500 | Unexpected server error |

---

## Event Payload Shapes

Every event stored in `events.data_json` and POSTed to webhooks uses this envelope:

```typescript
interface EventPayload {
  event:      string                        // e.g. "tool.discovered"
  timestamp:  string                        // ISO 8601
  severity:   "info" | "warning" | "error"
  hostname:   string
  data:       EventData                     // Shape varies by event — see below
}
```

### Per-event `data` shapes

**`tool.discovered`**
```typescript
{ name: string, category: string, current_version: string | null, tool_status: string }
```

**`tool.removed`**
```typescript
{ name: string, category: string, last_known_version: string | null }
```

**`tool.untracked`**
```typescript
{ name: string, category: string, current_version: string | null }
```

**`tool.version_changed`** — installed version changed externally between scans
```typescript
{ name: string, category: string, previous_version: string, current_version: string }
```

**`version.outdated`**
```typescript
{ name: string, category: string, current_version: string, latest_version: string, update_type: UpdateType, repo_url: string | null }
```

**`version.major_available`**
```typescript
{ name: string, category: string, current_version: string, latest_version: string, repo_url: string | null }
```

**`probe.failed`**
```typescript
{ name: string, probe_type: string, error_message: string, probe_source: string | null }
```

**`probe.rate_limited`**
```typescript
{ probe_type: "github" | "ghcr", tools_skipped: string[], resume_at_estimate: string | null }
```

**`probe.timeout`**
```typescript
{ name: string, probe_type: string, timeout_seconds: number }
```

**`system.reboot_required`**
```typescript
{ reason: "kernel_update" | "package_update" | "unknown", detected_at: string }
```

**`system.disk_warning`**
```typescript
{ mount_point: string, used_pct: number, available_gb: number, threshold_pct: number }
```

**`system.service_degraded`**
```typescript
{ name: string, category: "systemd" | "pm2", state: string, since: string | null }
```

**`scan.completed`**
```typescript
{ total: number, outdated: number, probe_failed: number, duration_ms: number, by_update_type: Record<UpdateType, number> }
```

**`scan.partial`**
```typescript
{ total: number, probes_skipped: number, reason: string, duration_ms: number }
```

---

## Downstream Consumption Patterns

Standard `jq` filters for pipeline stage consumers:

```bash
# Stage 2: all services to stop before updating
jq '.tools[] | select(.category == "systemd" or .category == "pm2")'

# Stage 2: systemd services only
jq '.tools[] | select(.category == "systemd")'

# Stage 2: PM2 processes only
jq '.tools[] | select(.category == "pm2")'

# Stage 3: apt packages with available updates
jq '.tools[] | select(.category == "apt" and .is_outdated == true)'

# Stage 4: runtime tools needing update
jq '.tools[] | select(.category == "runtime" and .is_outdated == true)'

# Stage N: container apps needing update
jq '.tools[] | select(.category == "container" and .is_outdated == true)'

# Safe to auto-update (patch only)
jq '.tools[] | select(.update_type == "patch")'

# Needs human review before updating
jq '.tools[] | select(.update_type == "major")'

# Requires investigation — version scheme not understood
jq '.tools[] | select(.update_type == "unknown")'

# Probe failures — check what couldn't be reached
jq '.tools[] | select(.probe_status == "failed")'

# Summary: all outdated with update classification
jq '.tools[] | select(.is_outdated == true) | {name, category, current_version, latest_version, update_type}'
```
