# ui-design — Terminal UI Design System

> Sub-document of `server-lens`. Referenced from `@AGENTS.md`.
> Covers: Ink/React component architecture, color token system, built-in themes,
> custom theme config, visual design language, and Claude Code inspiration notes.

---

## Design Inspiration

The visual language of `server-lens` is directly inspired by **Claude Code** — Anthropic's
terminal UI. Key characteristics to replicate:

- Clean, high-contrast output on dark terminals
- Warm accent color (orange) as the primary identity color
- Structured sections with subtle borders — not heavy boxes
- Generous use of muted/dim text for metadata, letting key info breathe
- Status communicated through color + symbol together (never color alone)
- Minimal decoration — no ASCII art, no excessive padding
- Content-first layout — the data is the UI

Claude Code uses a warm terracotta orange (`#DA7756`) as its signature accent.
`server-lens` adopts this as its default theme (`claude`) and offers a blue variant
(`claude-blue`) for teams that prefer a cooler palette.

---

## Tech Stack — UI Layer

| Layer | Choice | Notes |
|---|---|---|
| UI framework | **Ink v4** (React for terminals) | JSX components, hooks, re-renders on state change |
| Language | **TypeScript** with `.tsx` extensions | All UI files are `.tsx` |
| Styling | Ink's `color`, `bold`, `dim`, `backgroundColor` props + `chalk` for inline strings | No CSS — terminal color only |
| Layout | Ink `<Box>` with `flexDirection`, `gap`, `padding`, `width` | Flexbox-like layout |
| Tables | Custom `<Table>` component built on Ink `<Box>` rows | No external table lib |
| Spinners | `ink-spinner` | For scan progress indication |
| Markdown render | `ink-markdown` or custom renderer | For `server-lens notes <tool>` release notes display |

---

## Color Token System

Tokens are defined per theme and loaded from `src/ui/themes/`. All Ink components
consume tokens — never hardcoded hex values in component files.

### Token Reference

| Token | Semantic role | When to use |
|---|---|---|
| `accent` | Primary identity color — the tool's "brand" in terminal | Tool name in header, category badge borders, selected rows, active indicators |
| `accent-dim` | Dimmed accent — secondary accent elements | Sub-headers under accent sections, less prominent borders |
| `success` | Positive / healthy state | Up to date (`update_type: none`), probe success, service running |
| `warning` | Attention needed but not critical | `update_type: minor`, `update_type: patch`, rate limited probe |
| `error` | Critical / action required | `update_type: major`, probe failed, scan failed, service degraded |
| `info` | Neutral informational | `tool_status: untracked`, `probe_status: skipped`, timestamps, counts |
| `heading` | Section and category titles | Category group headers, tool name in detail view |
| `muted` | De-emphasized metadata | Timestamps, version dates, probe source URLs, secondary labels |
| `border` | Structural lines and dividers | Table borders, section separators, box outlines |
| `bg-highlight` | Row or item background on focus/hover | Selected item in interactive list, hovered row |

### Built-in Themes

#### `claude` — Default (orange, warm)
Inspired directly by Claude Code's color identity.

| Token | Hex | Ink color name or hex |
|---|---|---|
| `accent` | `#DA7756` | `#DA7756` |
| `accent-dim` | `#A85A3E` | `#A85A3E` |
| `success` | `#4CAF7D` | `#4CAF7D` |
| `warning` | `#E8C84A` | `#E8C84A` |
| `error` | `#E05C5C` | `#E05C5C` |
| `info` | `#8B9BB4` | `#8B9BB4` |
| `heading` | `#FFFFFF` | `white` |
| `muted` | `#5A6478` | `#5A6478` |
| `border` | `#2A3142` | `#2A3142` |
| `bg-highlight` | `#1E2433` | `#1E2433` |

#### `claude-blue` — Blue variant (cool)
Same semantic intent, cooler palette. Accent and bg-highlight differ; all other tokens identical.

| Token | Hex | Differs from `claude`? |
|---|---|---|
| `accent` | `#4A9EDB` | ✅ |
| `accent-dim` | `#2E6FA3` | ✅ |
| `success` | `#4CAF7D` | — |
| `warning` | `#E8C84A` | — |
| `error` | `#E05C5C` | — |
| `info` | `#8B9BB4` | — |
| `heading` | `#FFFFFF` | — |
| `muted` | `#5A6478` | — |
| `border` | `#2A3142` | — |
| `bg-highlight` | `#1A2535` | ✅ |

#### `custom` — User-defined via TOML
When `[theme].name = "custom"`, all tokens are read from `[theme]` TOML fields.
Any token not specified in TOML falls back to the `claude` theme value.
See TOML config section below.

---

## TOML `[theme]` Config Block

```toml
[theme]
name = "claude"          # "claude" | "claude-blue" | "custom"

# Custom token overrides — only applied when name = "custom"
# Omit any token to fall back to the "claude" theme value for that token
# accent      = "#DA7756"
# accent-dim  = "#A85A3E"
# success     = "#4CAF7D"
# warning     = "#E8C84A"
# error       = "#E05C5C"
# info        = "#8B9BB4"
# heading     = "#FFFFFF"
# muted       = "#5A6478"
# border      = "#2A3142"
# bg-highlight = "#1E2433"
```

---

## Theme Loading — `src/ui/theme.ts`

Theme is resolved once at startup and injected via React context.
All components read from `useTheme()` — never import theme directly.

Resolution order:
```
1. Read [theme].name from server-lens.toml
2. If "claude"      → load claude theme object (built-in)
3. If "claude-blue" → load claude-blue theme object (built-in)
4. If "custom"      → start with claude base, merge TOML token overrides on top
5. Validate all hex values — warn and fall back to claude default for invalid values
6. Provide via ThemeContext — available to all components via useTheme()
```

```typescript
// src/ui/theme.ts
export interface Theme {
  accent:       string
  accentDim:    string
  success:      string
  warning:      string
  error:        string
  info:         string
  heading:      string
  muted:        string
  border:       string
  bgHighlight:  string
}

export const themes: Record<string, Theme> = {
  claude: { ... },
  'claude-blue': { ... },
}

// useTheme() hook — import in any component
export function useTheme(): Theme
```

---

## Visual Layout — Annotated Output Reference

```
┌─ server-lens ──────────────────────────────────────── v1.0.0 ─┐   ← accent border + heading
│  prod-backend-01  •  Last scan: 2025-03-14 06:00  •  42 tools │   ← muted metadata
│  7 outdated  •  1 major  •  3 minor  •  3 patch               │   ← warning count + error for major
└───────────────────────────────────────────────────────────────┘

  RUNTIME                                                            ← accent category header
  ──────────────────────────────────────────────────────────────     ← border divider

  bun          1.1.29  →  2.0.0   MAJOR    github    2025-03-10     ← error for MAJOR
  nvm          0.39.7  →  0.40.4  minor    github    2025-01-30     ← warning for minor
  node (lts)   22.0.0  ✓          –        nvm       –              ← success checkmark
  pm2          5.3.1   →  5.3.4   patch    npm       2025-02-20     ← warning for patch
  pnpm         9.1.0   ✓          –        npm       –              ← success

  CONTAINER                                                          ← accent category header
  ──────────────────────────────────────────────────────────────

  n8n          1.85.0  ✓          –        dockerhub  –             ← success
  outline      0.78.0  →  0.80.0  minor    ghcr       2025-03-01   ← warning

  APT (18 packages, 3 outdated)                             [+]      ← collapsed by default, accent [+]
  TOOLS         (6 packages, 0 outdated)                    [✓]      ← success [✓] all good

  ─────────────────────────────────────────────────────────────      ← border
  ⚠  system.reboot_required — kernel update pending                  ← warning symbol + message
  ✗  probe.failed — dockerhub: outline (rate limited)               ← error symbol
```

---

## Status Symbols

Always pair a symbol with color — never rely on color alone (accessibility, monochrome terminals).

| Symbol | Color token | Meaning |
|---|---|---|
| `✓` | `success` | Up to date / healthy |
| `→` | `warning` | Update available (minor/patch) |
| `⚑` | `error` | Major update — review required |
| `✗` | `error` | Failed / error state |
| `⚠` | `warning` | Warning — attention needed |
| `?` | `info` | Untracked — no upstream data |
| `◉` | `accent` | Running / active (for services) |
| `○` | `muted` | Stopped / inactive (for services) |
| `…` | `muted` | Loading / scanning in progress |

---

## `update_type` → Visual Mapping

| `update_type` | Label | Color token | Symbol |
|---|---|---|---|
| `major` | `MAJOR` | `error` | `⚑` |
| `minor` | `minor` | `warning` | `→` |
| `patch` | `patch` | `warning` | `→` |
| `unknown` | `?ver` | `info` | `?` |
| `none` | `✓` | `success` | `✓` |
| `null` | `–` | `muted` | `?` |

---

## Component File Map

```
src/ui/
├── theme.ts                  ← Token types, built-in themes, useTheme() hook, ThemeContext
├── App.tsx                   ← Root component — routes subcommand to correct screen
├── screens/
│   ├── DashboardScreen.tsx   ← Default display mode — category groups + summary header
│   ├── StatusScreen.tsx      ← server-lens status — last scan, next scheduled, health
│   ├── EventsScreen.tsx      ← server-lens events — event log table, filterable
│   ├── NotesScreen.tsx       ← server-lens notes <tool> — markdown release notes render
│   └── ScanScreen.tsx        ← server-lens scan — live progress during active scan
├── components/
│   ├── Header.tsx            ← Tool name, version, hostname, last scan, summary counts
│   ├── CategoryGroup.tsx     ← Collapsible category section with tool rows
│   ├── ToolRow.tsx           ← Single tool row — name, versions, update_type, probe info
│   ├── StatusBadge.tsx       ← Colored symbol + label for update_type or probe_status
│   ├── SummaryBar.tsx        ← Outdated counts by update_type in header
│   ├── AlertBar.tsx          ← system.* event alerts shown below main table
│   ├── ScanProgress.tsx      ← Live probe progress — spinner + current tool name
│   ├── Table.tsx             ← Generic reusable table built on Ink Box rows
│   └── Divider.tsx           ← Horizontal border line using border token
└── hooks/
    ├── useTheme.ts           ← Re-export from theme.ts for clean imports
    └── useKeyInput.ts        ← Keyboard nav: arrow keys, expand/collapse, quit
```

---

## Component Rules (Agent Instructions)

- **Never hardcode hex values in components.** Always use `const theme = useTheme()` and reference `theme.accent`, `theme.error` etc.
- **Never use color alone for status.** Every colored element must also have a symbol or label conveying the same meaning.
- **`apt` category is collapsed by default.** It can contain 50+ packages — showing all by default destroys the layout. Show count + outdated count in the collapsed header. User presses Enter/Space to expand.
- **Column widths are fixed, not dynamic.** Name column: 20 chars max, truncate with `…`. Version columns: 10 chars each. Label column: 7 chars. Date column: 12 chars. This ensures consistent layout across all terminal widths ≥ 80 chars.
- **SSH/PTY compatibility.** Never use characters outside of UTF-8 box-drawing and the symbols listed in the Status Symbols table above. Avoid emoji — they render as double-width in some terminal emulators and break column alignment.
- **Display mode never shows a spinner or loading state.** It reads SQLite and renders immediately. If SQLite has no snapshot, it shows a single-line prompt: `No scan data found. Run: server-lens scan --now`
- **Scan mode shows live progress via `ScanProgress` component** — updates per probe as each one completes. Uses `ink-spinner` with the `dots` style.
- **`NotesScreen` renders markdown release notes.** Use simple inline rendering: `#` headings → `heading` color bold, `-` bullets → `muted` dash + white text, `code spans` → `accent-dim` color. Full markdown parsing is not required — only the subset GitHub release notes use.

---

## Minimum Terminal Width

Target: **80 columns** minimum. Layout must not break below this.
At < 80 columns: suppress the probe source and date columns, keep name + version + status.
At ≥ 120 columns: optionally show repo_url as a dim suffix on the tool row.

The `DashboardScreen` component should read `process.stdout.columns` on mount
and pass a `compact` boolean prop to child components when < 80.
