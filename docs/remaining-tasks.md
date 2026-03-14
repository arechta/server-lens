# remaining-tasks — Implementation Status

> Sub-document of `server-lens`. Referenced from `@AGENTS.md`.
> Lists features described in other docs that are not yet implemented.
> Update this file as tasks are completed.

---

## pipeline.md

| Task | Status | Description |
|------|--------|--------------|
| `server-lens install` | ✅ Done | Generate cron/systemd files from `[settings].scan_schedule` in TOML |
| `--quiet` flag (scan) | ✅ Done | Suppress scan output when run from cron |
| `--dry-run` flag (scan) | ✅ Done | Run discovery and probes; no DB writes, events, or webhooks |

---

## data-schema.md

| Task | Status | Description |
|------|--------|--------------|
| `--with-notes` flag | ✅ Done | Opt-in release notes during scan; probes fetch changelogs |
| `release_notes` / `release_notes_source` in VersionEntry | ✅ Done | Populate when `--with-notes` is used |
| `server-lens notes <tool>` | ✅ Done | Subcommand to show release notes for one tool (no full scan) |
| Notes sources per probe | ✅ Done | github-release (GitHub API body), npm-readme — as described in docs |

---

## mcp.md

| Task | Status | Description |
|------|--------|--------------|
| Resource `tools://update-type/{type}` | ✅ Done | Filter tools by update_type (e.g. major, minor, patch) |
| Resource `snapshots://list` | ✅ Done | Snapshot history metadata (no payload) |
| Resource `events://type/{event}` | ✅ Done | Events filtered by event name |
| Resource refresh after scan | ⏭ Deferred | Push updated data to subscribed MCP clients |
| Prompt `diagnose-probes` | ✅ Done | Investigate probe failures; compose get_probe_failures, get_events, get_system_health |
| Prompt `what-changed` | ✅ Done | Summarise changes since a given time; compose get_events, get_snapshots, diff |

---

## ui-design.md

### Screens

| Task | Status | Description |
|------|--------|--------------|
| StatusScreen | ✅ Done | TUI for `server-lens status` (last scan, next scheduled, health) |
| EventsScreen | ✅ Done | TUI for `server-lens events` (event log, filterable) |
| NotesScreen | ✅ Done | TUI for `server-lens notes <tool>` (markdown release notes) |
| ScanScreen | ✅ Done | Live progress during `server-lens scan` |

### Components

| Task | Status | Description |
|------|--------|--------------|
| CategoryGroup | ✅ Done | Collapsible category section with tool rows |
| ToolRow | ✅ Done | Single tool row (name, versions, update_type, probe info) |
| StatusBadge | ✅ Done | Colored symbol + label for update_type / probe_status |
| SummaryBar | ✅ Done | Outdated counts by update_type in header |
| AlertBar | ✅ Done | system.* event alerts below main table |
| ScanProgress | ✅ Done | Live probe progress (spinner + current tool name) |

### Behaviour

| Task | Status | Description |
|------|--------|--------------|
| APT collapsed by default | ✅ Done | Show count + outdated in header; `a` key to toggle |
| Custom theme | ✅ Done | `[theme].name = "custom"` with TOML token overrides |
| Responsive layout | ✅ Done | Compact mode when `process.stdout.columns` < 80 |

### Other

| Task | Status | Description |
|------|--------|--------------|
| App routing | ✅ Done | Route subcommands to correct screen (Status, Events, Notes, Scan) |
| useKeyInput hook | ✅ Done | Arrow keys, expand/collapse, quit |

---

## Build & Performance

| Task | Status | Description |
|------|--------|--------------|
| Batch apt probes | ✅ Done | Single `apt-cache policy pkg1 pkg2 ...` call instead of N individual calls |
| Compiled binary (`build:linux`) | ✅ Done | `bun build --compile` — yoga.wasm patched to use ASM.js (see `scripts/patch-yoga.js`) |

---

## Summary by Priority

1. **Pipeline** — `install`, `--quiet`, `--dry-run` — ✅ All done
2. **Data** — `--with-notes`, `notes` subcommand — ✅ All done
3. **MCP** — Missing resources and prompts — ✅ All done (resource refresh deferred)
4. **UI** — Screens, components, APT collapse, custom theme — ✅ All done
