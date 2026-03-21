# Context Log — server-lens

> Chronological record of significant changes to the server-lens project.
> Each entry captures what changed, why, who did it, and what it affects.
>
> **Read `AGENTS.md` for the current state. Read this log for the history.**

---

## How to Add an Entry

1. Create a new file: `docs/context-log/YYYY-MM-DD_short-slug.md`
2. Use the template below
3. If multiple changes on the same day, append a sequence: `YYYY-MM-DD_slug-2.md`
4. Author is from `git config user.name` + `git config user.email`
5. Update the entry table below

### Entry Template

```markdown
# [Short title of the change]

- **Date:** YYYY-MM-DD
- **Author:** Name <email>
- **Scope:** docs | feature | refactor | bugfix | schema | config | infra

## What changed

[1-3 paragraphs describing the change]

## Why

[Motivation, context, problem being solved]

## Files affected

- `path/to/file` — [what changed in it]

## Impact

- **Pipeline/API:** [any impact on downstream consumers]
- **Schema:** [any VersionEntry/EventPayload changes]
- **Config:** [any TOML changes]
- **Breaking:** yes/no
```

---

## Entry Log

| Date | Slug | Scope | Author | Summary |
|------|------|-------|--------|---------|
| 2026-03-21 | docs-refresh-context-tracking | docs | Asphira Andreas | Fixed all documentation discrepancies vs codebase, created context-log system |
| 2026-03-21 | project-structure-reorganization | refactor | Asphira Andreas | Extracted probes to src/probes/, renamed scanners/UI to dot-separated/kebab-case |
