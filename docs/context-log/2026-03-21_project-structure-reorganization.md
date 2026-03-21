# Project Structure Reorganization & File Naming Convention

- **Date:** 2026-03-21
- **Author:** Asphira Andreas <arechta.dev@gmail.com>
- **Scope:** refactor

## What changed

Reorganized the project structure to separate probe implementations from engine core files and adopted consistent file naming conventions across the codebase:

- **Probes extracted:** 9 probe files moved from `src/engine/` into a new `src/probes/` directory with dot-separated lowercase naming (`AptProbe.ts` → `apt.probe.ts`).
- **Scanners renamed:** 11 scanner files in `src/scanner/` renamed from PascalCase to dot-separated lowercase (`AptScanner.ts` → `apt.scanner.ts`).
- **UI restructured:** Components renamed to kebab-case (`CategoryGroup.tsx` → `category-group.tsx`), screens directory renamed to pages (`screens/` → `pages/`), page files simplified (`DashboardScreen.tsx` → `dashboard.tsx`), `App.tsx` → `app.tsx`.
- **Hooks unchanged:** Hook files remain camelCase with `use` prefix (`useKeyInput.ts`) per project convention.
- **Class names unchanged:** Internal class names (e.g., `AptProbe`, `BunScanner`, `DashboardScreen`) remain PascalCase — only file names changed.

## Why

The original structure mixed 9 probe implementations with 5 core engine files in `src/engine/` (14 files total), making it hard to distinguish orchestration logic from individual probe implementations. File naming was inconsistent — PascalCase filenames matching class names is a common convention but doesn't clearly communicate file purpose at a glance.

The new naming conventions:
- `*.probe.ts` / `*.scanner.ts` — immediately identifies the file's role
- kebab-case for UI components — aligns with shadcn/ui conventions, widely adopted in the React ecosystem
- Simple page names without suffixes — pages are navigation targets, not classes

## Files affected

- `src/probes/` — 9 new files (moved from `src/engine/`)
- `src/engine/` — 9 probe files removed, 5 core files remain (imports updated)
- `src/scanner/` — 11 files renamed (imports updated in `index.ts`)
- `src/ui/app.tsx` — renamed from `App.tsx`, imports updated
- `src/ui/pages/` — 5 files moved from `screens/`, renamed
- `src/ui/components/` — 8 files renamed to kebab-case
- `src/index.tsx` — import paths updated
- `AGENTS.md` — repository structure tree rewritten
- `docs/ui-design.md` — component file map updated

## Impact

- **Pipeline/API:** None — no runtime behavior changes
- **Schema:** None — no type changes
- **Config:** None — no TOML changes
- **Breaking:** No — all changes are internal file organization only
