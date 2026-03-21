# upstream-probe — Probe Engine

> Sub-document of `server-lens`. Referenced from `@AGENTS.md`.
> Covers: probe types, TOML probe definition format, resolution flow, auto-discovery,
> the registered interest list, untracked fallback, and the ScriptProbe escape hatch.

---

## What Is the Probe Engine?

The probe engine is the subsystem inside `server-lens` responsible for one job:
**given a tool name, return its latest available version from the correct upstream source.**

It is implemented as two cooperating parts:

| Part | File | Responsibility |
|---|---|---|
| `ProbeFactory` | `src/engine/probe-factory.ts` | Maps a `probe_type` string to a Probe class instance |
| `ProbeEngine` | `src/engine/probe-engine.ts` | Orchestrates: loads TOML, runs all probes, merges scanner results, handles fallbacks |

The probe engine only runs during `server-lens scan`. It is never invoked in display mode.
Every probe implements the same `Probe` interface — the engine calls `.run()` and gets back
a `ProbeResult`. This is the core extensibility contract.

---

## The Probe Interface

```typescript
interface ProbeArgs {
  [key: string]: string   // Flat key-value pairs from TOML args.* fields
}

interface ProbeResult {
  latest_version: string | null        // null if upstream unreachable or parse failed
  latest_release_date: string | null   // ISO 8601 date or null
  repo_url: string | null
  source: ProbeSourceType              // Which upstream was queried
  probe_status: ProbeStatus            // "success" | "failed" | "timeout" | "rate_limited"
  error_message: string | null         // Populated when probe_status !== "success"
}

interface Probe {
  run(args: ProbeArgs): Promise<ProbeResult>
}
```

All probes receive flat `ProbeArgs` from the TOML `args.*` fields and return a `ProbeResult`.
No probe ever returns void or throws — errors are captured in `probe_status` and `error_message`.
The engine always receives a result, never an exception.

---

## Probe Types

### `AptProbe`
Queries the local apt cache. No network call.
Runs `apt-cache policy <package>` and parses the `Candidate:` line.

| Arg | Required | Description |
|---|---|---|
| `args.package` | ✅ | apt package name e.g. `nginx`, `redis-server`, `postgresql-15` |

Best for: anything installed via `apt install` or available in apt repositories.

---

### `GithubProbe`
Queries the GitHub Releases API for the latest published release.
Endpoint: `GET /repos/:owner/:repo/releases/latest`
Uses `github_token` from `[auth]` in TOML — strongly recommended to avoid the
60 requests/hour anonymous rate limit.

| Arg | Required | Description |
|---|---|---|
| `args.owner` | ✅ | GitHub org or user e.g. `oven-sh` |
| `args.repo` | ✅ | Repository name e.g. `bun` |
| `args.tag_prefix` | ❌ | Prefix to strip from tag name e.g. `bun-v` turns `bun-v1.2.3` → `1.2.3` |

Best for: tools distributed via GitHub Releases — Bun, nvm, gh CLI, etc.

---

### `NpmProbe`
Queries the public npm registry.
Endpoint: `GET https://registry.npmjs.org/:package/latest`

| Arg | Required | Description |
|---|---|---|
| `args.package` | ✅ | npm package name e.g. `pm2`, `pnpm`, `typescript` |

Best for: globally installed npm/pnpm packages.

---

### `DockerHubProbe`
Queries Docker Hub API for the latest tag on a public image.
Endpoint: `GET https://hub.docker.com/v2/repositories/:image/tags`

| Arg | Required | Description |
|---|---|---|
| `args.image` | ✅ | Full image name e.g. `n8nio/n8n`, `redis`, `postgres` |
| `args.tag_filter` | ❌ | Regex to match valid version tags e.g. `^\d+\.\d+\.\d+$` |

`tag_filter` is important — Docker Hub tags often include `latest`, `alpine`, `slim`, `edge`
alongside real version tags. Without a filter the probe may return `latest` as the version string.

Best for: self-hosted Docker Compose services — n8n, Mailu, OnlyOffice, etc.

---

### `GhcrProbe`
Queries GitHub Container Registry for latest image tag.
Endpoint: `GET https://ghcr.io/v2/:owner/:image/tags/list`
Requires `github_token` from `[auth]` — GHCR requires authentication even for public images.

| Arg | Required | Description |
|---|---|---|
| `args.owner` | ✅ | GitHub org or user e.g. `outlinewiki` |
| `args.image` | ✅ | Image name e.g. `outline` |
| `args.tag_filter` | ❌ | Regex to match valid version tags |

Best for: self-hosted services distributed via GHCR — Outline, Hoppscotch, etc.

---

### `NodeProbe`
Queries the Node.js release index (`nodejs.org/download/release/index.json`).
LTS-aware: if the current installed version is an LTS release, it compares against the
latest version in the same LTS line (e.g., "Jod"). If the current version is a Current
(non-LTS) release, it compares against the latest Current release.

| Arg | Required | Description |
|---|---|---|
| `args.current_version` | ✅ | The currently installed Node.js version (e.g., `22.14.0`) |
| `args.version` | ❌ | Alias for `current_version` |

Best for: Node.js installations managed by nvm, fnm, or system package manager.
Note: This probe is typically auto-assigned by the probe engine when Node.js is
discovered by NvmScanner, FnmScanner, or NodeScanner — no TOML entry needed.

---

### `SnapProbe`
Queries the Snap Store API (`api.snapcraft.io/v2/snaps/info/:name`).
Returns the latest version from the `stable` channel for the current architecture.
Architecture-aware: detects `amd64`, `arm64`, or `armhf` from `process.arch`.

| Arg | Required | Description |
|---|---|---|
| `args.package` | ✅ | Snap package name e.g. `lxd`, `certbot`, `canonical-livepatch` |
| `args.name` | ❌ | Alias for `args.package` |

Best for: tools installed via `snap install` — LXD, certbot, etc.

---

### `BinaryProbe`
Runs the installed binary with a version flag. No network call.
Populates `current_version` only — `latest_version` remains `null`.
Tool appears as `untracked` in latest version context.

| Arg | Required | Description |
|---|---|---|
| `args.binary` | ✅ | Binary name or full path e.g. `terraform`, `/usr/local/bin/my-tool` |
| `args.flag` | ❌ | Version flag — default `--version` |
| `args.parse_regex` | ❌ | Regex with capture group to extract semver e.g. `(\d+\.\d+\.\d+)` |

Best for: script-installed binaries with no known upstream API.

---

### `ScriptProbe`
Escape hatch. Runs a custom shell command and captures stdout as the version string.
No network call unless the script makes one.

| Arg | Required | Description |
|---|---|---|
| `args.command` | ✅ | Shell command returning current version string |
| `args.latest_command` | ❌ | Separate shell command returning latest version string |

Agent rule: if you find yourself writing `ScriptProbe` for a mainstream tool, consider
whether a proper probe type should be created instead.

---

## TOML Probe Definition Format

Each tool to track is a `[[probes]]` array entry in `server-lens.toml`.
All probe arguments use flat `args.*` dot-notation on the same level as the probe fields.
No nested blocks — `[[probes]]` is the only block boundary.

```toml
# ─── GLOBAL SETTINGS ─────────────────────────────────────────────────────────
[settings]
scan_schedule              = "0 */6 * * *"    # Cron expression — REQUIRED, no default
scan_timeout_seconds       = 30
disk_warning_threshold_pct = 20
ignored_tools              = []               # Tool names never shown in output

# ─── MCP ─────────────────────────────────────────────────────────────────────
[mcp]
enabled = true     # Expose /mcp SSE endpoint when running server-lens serve
                   # server-lens mcp (stdio) always available regardless of this flag

# ─── THEME ───────────────────────────────────────────────────────────────────
[theme]
name = "claude"          # "claude" (orange) | "claude-blue" | "custom"
# Custom token overrides — only used when name = "custom"
# accent      = "#DA7756"
# accent-dim  = "#A85A3E"
# See docs/ui-design.md for full token reference

# ─── AUTHENTICATION ───────────────────────────────────────────────────────────
[auth]
github_token = "ghp_xxxxxxxxxxxxxxxxxxxx"     # Required for GhcrProbe; avoids GithubProbe rate limits

# ─── WEBHOOKS ─────────────────────────────────────────────────────────────────
[webhooks]
"tool.discovered"         = "https://n8n.yourdomain.com/webhook/server-lens"
"tool.version_changed"    = "https://n8n.yourdomain.com/webhook/server-lens"
"version.outdated"        = "https://n8n.yourdomain.com/webhook/server-lens"
"version.major_available" = "https://n8n.yourdomain.com/webhook/server-lens"
"probe.failed"            = "https://n8n.yourdomain.com/webhook/server-lens"
"probe.rate_limited"      = "https://n8n.yourdomain.com/webhook/server-lens"
"system.reboot_required"  = "https://n8n.yourdomain.com/webhook/server-lens"

# ─── PROBE DEFINITIONS ────────────────────────────────────────────────────────
# Each [[probes]] entry = one registered tool with a known upstream.
# Auto-discovered tools NOT listed here still appear in output as "untracked".

[[probes]]
name       = "nginx"
probe_type = "apt"
category   = "tools"
args.package = "nginx"

[[probes]]
name       = "redis"
probe_type = "apt"
category   = "tools"
args.package = "redis-server"

[[probes]]
name       = "postgresql"
probe_type = "apt"
category   = "tools"
args.package = "postgresql-15"

[[probes]]
name       = "bun"
probe_type = "github"
category   = "runtime"
repo_url   = "https://github.com/oven-sh/bun"
args.owner      = "oven-sh"
args.repo       = "bun"
args.tag_prefix = "bun-v"

[[probes]]
name       = "nvm"
probe_type = "github"
category   = "runtime"
repo_url   = "https://github.com/nvm-sh/nvm"
args.owner      = "nvm-sh"
args.repo       = "nvm"
args.tag_prefix = "v"

[[probes]]
name       = "gh"
probe_type = "github"
category   = "tools"
repo_url   = "https://github.com/cli/cli"
args.owner      = "cli"
args.repo       = "cli"
args.tag_prefix = "v"

[[probes]]
name       = "pm2"
probe_type = "npm"
category   = "runtime"
repo_url   = "https://www.npmjs.com/package/pm2"
args.package = "pm2"

[[probes]]
name       = "pnpm"
probe_type = "npm"
category   = "runtime"
repo_url   = "https://www.npmjs.com/package/pnpm"
args.package = "pnpm"

[[probes]]
name       = "n8n"
probe_type = "dockerhub"
category   = "container"
repo_url   = "https://hub.docker.com/r/n8nio/n8n"
args.image      = "n8nio/n8n"
args.tag_filter = "^\\d+\\.\\d+\\.\\d+$"

[[probes]]
name       = "outline"
probe_type = "ghcr"
category   = "container"
repo_url   = "https://github.com/outline/outline"
args.owner      = "outlinewiki"
args.image      = "outline"
args.tag_filter = "^\\d+\\.\\d+\\.\\d+$"

[[probes]]
name       = "my-internal-tool"
probe_type = "script"
category   = "tools"
args.command        = "/usr/local/bin/my-tool --version | awk '{print $2}'"
args.latest_command = "curl -s https://internal.example.com/version"
```

---

## Auto-Discovery Scanners

Scanners run before the probe engine and produce the initial tool list.
The probe engine then enriches each discovered item with upstream latest version data.

| Scanner | Discovers | How |
|---|---|---|
| `AptScanner` | All installed dpkg/apt packages | `dpkg-query -W -f '${Package} ${Version}\n'` |
| `SnapScanner` | Snap packages | `snap list` |
| `NvmScanner` | nvm itself + all installed Node versions | `nvm --version`, `nvm ls` |
| `FnmScanner` | Node.js via fnm (Fast Node Manager) | `fnm list` (detects default version) |
| `NodeScanner` | System Node.js (determines source: nvm/fnm/apt) | `node --version`, path inspection |
| `BunScanner` | Bun (script-installed) | `bun --version` |
| `NpmGlobalScanner` | npm globals + pnpm globals | `npm ls -g --depth=0 --json`, `pnpm ls -g --json` |
| `DockerScanner` | Docker engine + running container image tags | `docker version`, `docker ps --format json` |
| `Pm2Scanner` | PM2 processes (category: `pm2`) | `pm2 jlist` |
| `SystemdScanner` | systemd units (category: `systemd`) | `systemctl list-units --type=service --output=json` |
| `BinaryScanner` | Fallback — binaries in `/usr/local/bin` not caught above | `--version` flag per binary |

---

## Resolution Flow

For every tool in the discovered list, the engine follows this decision tree:

```
Tool found by scanner
        │
        ▼
Is this tool defined in [[probes]] in server-lens.toml?
        │
   YES ─┤
        │   Load probe_type + flat args.* from TOML entry
        │   Instantiate correct Probe via ProbeFactory
        │   Call probe.run(args) → ProbeResult
        │   Merge ProbeResult into VersionEntry
        │   probe_status = "success" | "failed" | "timeout" | "rate_limited"
        │
   NO ──┤
        │
        ├── Found by AptScanner?
        │       → Auto-fallback: run AptProbe with discovered package name
        │       → If no apt candidate found: probe_status = "failed"
        │
        ├── Found by BinaryScanner or other scanner?
        │       → Run BinaryProbe: captures current_version only
        │       → latest_version = null, tool_status = "untracked"
        │       → Emit: tool.untracked
        │
        └── Found but type unresolvable
                → current_version = null, tool_status = "untracked"
                → Emit: tool.untracked
```

**Key rule:** auto-discovered tools not in TOML are never silently dropped.
They always appear in output. The distinction is:

| State | Has probe definition | latest_version | tool_status |
|---|---|---|---|
| Registered | ✅ TOML `[[probes]]` entry | Populated | `registered` |
| Auto-probed | ❌ No TOML entry, apt fallback | Populated (best effort) | `auto` |
| Untracked | ❌ No TOML entry, no apt fallback | `null` | `untracked` |

---

## ProbeFactory — Type Registry

`probe-factory.ts` is the only place where `probe_type` strings map to classes.
To add a new probe type: create the class, add one entry here.

```
"apt"       → AptProbe
"github"    → GithubProbe
"npm"       → NpmProbe
"node"      → NodeProbe
"dockerhub" → DockerHubProbe
"ghcr"      → GhcrProbe
"snap"      → SnapProbe
"binary"    → BinaryProbe
"script"    → ScriptProbe
```

If a `probe_type` string from TOML is not found in the factory:
- Tool is treated as `untracked`
- Event `config.probe_conflict` is emitted with the unknown type name
- Scan continues — this is a non-fatal config error

---

## Rate Limiting Behaviour

GithubProbe and GhcrProbe both consume GitHub API quota.

| Auth state | Limit |
|---|---|
| No token (anonymous) | 60 requests/hour per IP |
| With `github_token` in `[auth]` | 5,000 requests/hour |

When a `429 Too Many Requests` response is received:
1. Probe engine stops all further GitHub/GHCR calls for the current scan
2. Remaining GitHub/GHCR-probed tools are marked `probe_status = "rate_limited"`
3. Event `probe.rate_limited` is emitted (fires configured webhook if set)
4. Scan completes normally — all non-GitHub probes are unaffected
5. Scan is marked `scan.partial` (not `scan.completed`) in the event log

This prevents a rate-limited scan from silently appearing as a full successful scan.
Always configure `github_token` in `[auth]` when tracking more than a few GitHub-probed tools.
With the SSH welcome screen pattern and a 6-hour scan schedule, even the anonymous
60/hr limit is rarely hit — but the token is still recommended for safety.
