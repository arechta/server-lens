# remaining-tasks — Backlog & Implementation Status

> Sub-document of `server-lens`. Referenced from `@AGENTS.md`.
> Tracks deferred features and future work items.

---

## Completed (Archive)

All original design doc tasks have been implemented as of 2026-03-21:

- **Pipeline:** `server-lens install`, `--quiet`, `--dry-run` flags
- **Data:** `--with-notes` flag, `release_notes`/`release_notes_source` fields, `server-lens notes <tool>` subcommand
- **MCP:** All 12 tools, 10 resources, 4 prompts registered
- **UI:** All 5 screens (Dashboard, Scan, Status, Events, Notes), all components, APT collapse, custom theme support
- **Build:** Batch apt probes, compiled binary via `bun build --compile` with yoga.wasm ASM.js patch

---

## Current Backlog

| Task | Priority | Description |
|------|----------|-------------|
| MCP resource refresh after scan | Low | Push updated data to subscribed MCP clients after scan completes (deferred — no agent has requested this yet) |
| Automated tests | Medium | No test files exist — unit tests for probes, scanners, and version-utils would improve reliability |
| CI/CD pipeline | Low | No GitHub Actions configured — build, lint, and test automation |

---

## How to Add Items

When a new feature is designed but not yet implemented, add it here with priority and description.
When a task is completed, move it to the "Completed" archive section with the completion date.
