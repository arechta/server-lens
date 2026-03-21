# Documentation Refresh + Context-Log System

- **Date:** 2026-03-21
- **Author:** Asphira Andreas <arechta.dev@gmail.com>
- **Scope:** docs

## What changed

Full audit of all documentation files against the actual codebase. Fixed every discrepancy
found between docs and implementation. Created the context-log system for tracking future
changes with author attribution and timestamps.

Key fixes:
- **AGENTS.md:** Rewrote repository structure tree (removed fictional `src/probes/` directory,
  fictional MCP subdirectories), added missing subcommands (`mcp`, `install`, `notes`),
  marked `serve` as implemented (was "(Future)"), added `scan_jobs` table, fixed MCP SDK
  package name, added missing TOML config sections (`[auth]`, `[container_base_images]`,
  `[container_version_commands]`, `[container_groups]`), added documentation maintenance rules.
- **probe-engine.md:** Added NodeProbe and SnapProbe documentation, added FnmScanner and
  NodeScanner to scanner table, updated ProbeFactory registry with "node" and "snap" entries.
- **data-schema.md:** Added "node" and "snap" to ProbeType union.
- **mcp.md:** Replaced fictional directory tree with actual flat structure (server.ts + create-server.ts).
- **ui-design.md:** Removed non-existent Table.tsx and useTheme.ts, added theme-context.tsx.
- **remaining-tasks.md:** Archived all completed tasks, evolved into living backlog document.

## Why

Documentation was written during the initial design phase and had drifted significantly
from the implementation. New probes (NodeProbe, SnapProbe), scanners (FnmScanner,
NodeScanner), subcommands, and database tables were added without updating docs. The
`src/probes/` directory documented in AGENTS.md never existed — all probes live in
`src/engine/`. The MCP subdirectory structure was aspirational but implementation
consolidated everything into `create-server.ts`.

The context-log system was created to prevent this drift from happening again and to
support team handover/delegation scenarios.

## Files affected

- `AGENTS.md` — Major update: structure tree, subcommands, DB tables, config sections, tech stack, agent rules
- `docs/probe-engine.md` — Added 2 probe types, 2 scanners, 2 factory entries
- `docs/data-schema.md` — Added "node", "snap" to ProbeType
- `docs/mcp.md` — Replaced fictional directory tree
- `docs/ui-design.md` — Fixed component file map
- `docs/remaining-tasks.md` — Archived completed work, added backlog format
- `docs/context-log/_index.md` — Created context-log system index
- `docs/context-log/2026-03-21_docs-refresh-context-tracking.md` — This entry

## Impact

- **Pipeline/API:** None — documentation-only changes
- **Schema:** None
- **Config:** None
- **Breaking:** No
