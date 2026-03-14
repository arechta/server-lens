# remaining-tasks — Implementation Status

> Sub-document of `server-lens`. Referenced from `@AGENTS.md`.
> Lists features described in other docs that are not yet implemented.
> Update this file as tasks are completed.

---

## pipeline.md

| Task | Description |
|------|--------------|
| `server-lens install` | Generate cron/systemd files from `[settings].scan_schedule` in TOML |
| `--quiet` flag (scan) | Suppress scan output when run from cron |
| `--dry-run` flag (scan) | Run discovery and probes; no DB writes, events, or webhooks |

---

## data-schema.md

| Task | Description |
|------|--------------|
| `--with-notes` flag | Opt-in release notes during scan; probes fetch changelogs |
| `release_notes` / `release_notes_source` in VersionEntry | Populate when `--with-notes` is used |
| `server-lens notes <tool>` | Subcommand to show release notes for one tool (no full scan) |
| Notes sources per probe | github-release, apt-changelog, npm-readme as described in docs |

---

## mcp.md

| Task | Description |
|------|--------------|
| Resource `tools://update-type/{type}` | Filter tools by update_type (e.g. major, minor, patch) |
| Resource `snapshots://list` | Snapshot history metadata (no payload) |
| Resource `events://type/{event}` | Events filtered by event name |
| Resource refresh after scan | Push updated data to subscribed MCP clients |
| Prompt `diagnose-probes` | Investigate probe failures; compose get_probe_failures, get_events, get_system_health |
| Prompt `what-changed` | Summarise changes since a given time; compose get_events, get_snapshots, diff |

---

## ui-design.md

### Screens

| Task | Description |
|------|--------------|
| StatusScreen | TUI for `server-lens status` (last scan, next scheduled, health) |
| EventsScreen | TUI for `server-lens events` (event log, filterable) |
| NotesScreen | TUI for `server-lens notes <tool>` (markdown release notes) |
| ScanScreen | Live progress during `server-lens scan` |

### Components

| Task | Description |
|------|--------------|
| CategoryGroup | Collapsible category section with tool rows |
| ToolRow | Single tool row (name, versions, update_type, probe info) |
| StatusBadge | Colored symbol + label for update_type / probe_status |
| SummaryBar | Outdated counts by update_type in header |
| AlertBar | system.* event alerts below main table |
| ScanProgress | Live probe progress (spinner + current tool name) |

### Behaviour

| Task | Description |
|------|--------------|
| APT collapsed by default | Show count + outdated in header; Enter/Space to expand |
| Custom theme | `[theme].name = "custom"` with TOML token overrides |
| Responsive layout | Compact mode when `process.stdout.columns` < 80 |

### Other

| Task | Description |
|------|--------------|
| App routing | Route subcommands to correct screen (Status, Events, Notes, Scan) |
| useKeyInput hook | Arrow keys, expand/collapse, quit |

---

## Summary by Priority

1. **Pipeline** — `install`, `--quiet`, `--dry-run`
2. **Data** — `--with-notes`, `notes` subcommand
3. **MCP** — Missing resources and prompts, resource refresh
4. **UI** — Screens, components, APT collapse, custom theme
