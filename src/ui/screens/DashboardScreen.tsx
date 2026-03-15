import React, { useState } from "react";
import { Box, Text, useApp } from "ink";
import { useTheme } from "../theme-context";
import { Header } from "../components/Header";
import { CategoryGroup } from "../components/CategoryGroup";
import { AlertBar } from "../components/AlertBar";
import { useKeyInput } from "../hooks/useKeyInput";
import type { SnapshotSummary, VersionEntry, UpdateType } from "../../schema/types";
import type { AlertItem } from "../components/AlertBar";

export interface RecentScanItem {
  id: number;
  scanned_at: string;
  hostname: string;
  total_tools: number;
}

interface DashboardScreenProps {
  snapshot: SnapshotSummary | null;
  tools: VersionEntry[];
  filterOutdated?: boolean;
  filterCategory?: string | null;
  systemAlerts?: AlertItem[];
  recentScans?: RecentScanItem[];
}

/** Priority order: items needing update first (MAJOR → minor → patch → unknown → none/null) */
const UPDATE_PRIORITY: Record<UpdateType, number> = {
  major: 0,
  minor: 1,
  patch: 2,
  unknown: 3,
  none: 4,
  null: 5,
};

function parseReleaseDate(d: string | null): number {
  if (!d || typeof d !== "string") return Number.MAX_SAFE_INTEGER;
  const t = Date.parse(d.slice(0, 10));
  return Number.isNaN(t) ? Number.MAX_SAFE_INTEGER : t;
}

/** Sortable key for latest_version: bigger version sorts later when we compare descending */
function versionSortKey(v: string | null): string {
  if (!v || typeof v !== "string") return "";
  const s = v.replace(/^v/, "").trim();
  const semver = /^(\d+)\.(\d+)\.(\d+)/.exec(s);
  if (semver)
    return [
      String(parseInt(semver[1]!, 10)).padStart(6, "0"),
      String(parseInt(semver[2]!, 10)).padStart(6, "0"),
      String(parseInt(semver[3]!, 10)).padStart(6, "0"),
    ].join(".");
  if (/^\d{8}$/.test(s) || /^\d{4}\.\d{2}/.test(s)) return s;
  return s;
}

/** Sort: 1) update priority, 2) oldest release date, 3) latest version (bigger first), 4) probe type, 5) name */
function compareTools(a: VersionEntry, b: VersionEntry): number {
  const pa = UPDATE_PRIORITY[a.update_type ?? "null"] ?? 5;
  const pb = UPDATE_PRIORITY[b.update_type ?? "null"] ?? 5;
  if (pa !== pb) return pa - pb;
  const da = parseReleaseDate(a.latest_release_date);
  const db = parseReleaseDate(b.latest_release_date);
  if (da !== db) return da - db;
  const va = versionSortKey(a.latest_version);
  const vb = versionSortKey(b.latest_version);
  if (va !== vb) return vb.localeCompare(va);
  const probeA = String(a.probe_type ?? "");
  const probeB = String(b.probe_type ?? "");
  if (probeA !== probeB) return probeA.localeCompare(probeB);
  return (a.display_name ?? a.name).localeCompare(b.display_name ?? b.name);
}

// ─── Kernel package filtering ────────────────────────────────────────────────

/** Extract the kernel version embedded in a package name, or null for meta-packages.
 *  e.g. "linux-image-6.8.0-87-generic" → "6.8.0-87-generic"
 *       "linux-image-generic"           → null  (meta/flavor pointer)
 */
function kernelPkgVersion(name: string): string | null {
  const m = /^linux-(?:image|headers|modules(?:-extra)?)-(\d[\d.\-]+\w*)$/i.exec(name);
  return m ? m[1]! : null;
}

let _runningKernel: string | null | undefined = undefined;
/** Returns the currently-running kernel release (uname -r), cached. */
function getRunningKernel(): string | null {
  if (_runningKernel !== undefined) return _runningKernel;
  try {
    const r = Bun.spawnSync(["uname", "-r"], { stdout: "pipe" });
    _runningKernel = new TextDecoder().decode(r.stdout).trim() || null;
  } catch {
    _runningKernel = null;
  }
  return _runningKernel;
}

/**
 * For linux-image/headers/modules packages, keep only:
 *   • meta/generic packages (no version in name, e.g. linux-image-generic)
 *   • packages whose name-version matches the running kernel  (what we're using)
 *   • packages whose name-version is the highest installed     (pending reboot, if different)
 *
 * All other historical kernel versions are dropped.
 */
function filterKernelPackages(
  packages: VersionEntry[],
  runningKernel: string | null,
): VersionEntry[] {
  const meta: VersionEntry[] = [];
  const versioned: VersionEntry[] = [];
  for (const pkg of packages) {
    if (kernelPkgVersion(pkg.name) === null) meta.push(pkg);
    else versioned.push(pkg);
  }
  if (versioned.length === 0) return meta;

  // Newest installed — sort by version string in package name (numeric-aware, descending)
  const sorted = [...versioned].sort((a, b) => {
    const va = kernelPkgVersion(a.name) ?? "";
    const vb = kernelPkgVersion(b.name) ?? "";
    return vb.localeCompare(va, undefined, { numeric: true });
  });
  const newestVer = kernelPkgVersion(sorted[0]!.name)!;

  // Running kernel packages — match by version embedded in package name
  const runningPkgs = new Set<string>();
  if (runningKernel) {
    // Strip optional flavor suffix so "6.8.0-87-generic" also matches "linux-headers-6.8.0-87"
    const base = runningKernel.replace(/-[a-z][a-z0-9]*(?:-[a-z][a-z0-9]*)*$/, "");
    for (const pkg of versioned) {
      const v = kernelPkgVersion(pkg.name)!;
      if (v === runningKernel || v.startsWith(base)) runningPkgs.add(pkg.name);
    }
  }

  const seen = new Set<string>();
  const result: VersionEntry[] = [...meta];
  for (const pkg of versioned) {
    const v = kernelPkgVersion(pkg.name)!;
    const keep = runningPkgs.has(pkg.name) || v === newestVer;
    if (keep && !seen.has(pkg.name)) {
      seen.add(pkg.name);
      result.push(pkg);
    }
  }
  return result;
}

// ─────────────────────────────────────────────────────────────────────────────

/** APT priority tier: 0=linux image, 1=kernel/headers, 2=system, 3=security, 4=other (not priority) */
function aptPriorityTier(name: string): number {
  const n = name.toLowerCase();
  if (n.startsWith("linux-image")) return 0;
  if (n.startsWith("linux-headers") || n.startsWith("linux-modules")) return 1;
  const system = [
    "systemd", "udev", "dbus", "util-linux", "coreutils", "mount", "procps",
    "base-files", "libc6", "multiarch", "bash", "dash", "grep", "sed", "gzip", "tar",
    "findutils", "login", "hostname", "sysvinit", "e2fsprogs", "init",
  ];
  if (system.some((p) => n.startsWith(p) || n === p)) return 2;
  const security = [
    "openssl", "libssl", "sudo", "libapt", "ca-certificates", "policykit",
    "passwd", "shadow", "audit", "cryptsetup", "gnutls", "libgnutls",
  ];
  if (n.startsWith("apt") || security.some((p) => n.startsWith(p) || n.includes(p))) return 3;
  return 4;
}

function groupByCategory(tools: VersionEntry[]): Map<string, VersionEntry[]> {
  const map = new Map<string, VersionEntry[]>();
  for (const t of tools) {
    const list = map.get(t.category) ?? [];
    list.push(t);
    map.set(t.category, list);
  }
  for (const [category, list] of map) {
    let toSort = list;
    if (category === "apt") {
      // First pass: keep priority packages and any outdated package
      const priority = list.filter((t) => {
        const tier = aptPriorityTier(t.name);
        return tier < 4 || t.is_outdated;
      });

      // Second pass: for kernel packages (tier 0 & 1), collapse to running +
      // newest-installed only — hides all accumulated historical kernel versions
      const runningKernel = getRunningKernel();
      const kernelPkgs = priority.filter((t) => aptPriorityTier(t.name) <= 1);
      const nonKernelPkgs = priority.filter((t) => aptPriorityTier(t.name) > 1);
      const filteredKernel = filterKernelPackages(kernelPkgs, runningKernel);

      toSort = [...filteredKernel, ...nonKernelPkgs];
      toSort.sort((a, b) => {
        const ta = aptPriorityTier(a.name);
        const tb = aptPriorityTier(b.name);
        if (ta !== tb) return ta - tb;
        return compareTools(a, b);
      });
      map.set(category, toSort);
    } else {
      toSort.sort(compareTools);
    }
  }
  return map;
}

// Category display order
const CATEGORY_ORDER = ["os", "runtime", "tools", "container", "systemd", "pm2", "snap", "apt"];

function sortedCategories(groups: Map<string, VersionEntry[]>): string[] {
  const keys = [...groups.keys()];
  return keys.sort((a, b) => {
    const ia = CATEGORY_ORDER.indexOf(a);
    const ib = CATEGORY_ORDER.indexOf(b);
    if (ia === -1 && ib === -1) return a.localeCompare(b);
    if (ia === -1) return 1;
    if (ib === -1) return -1;
    return ia - ib;
  });
}

export function DashboardScreen({
  snapshot,
  tools,
  filterOutdated = false,
  filterCategory = null,
  systemAlerts = [],
  recentScans = [],
}: DashboardScreenProps) {
  const theme = useTheme();
  const { exit } = useApp();
  const [aptExpanded, setAptExpanded] = useState(false);

  // Responsive: compact when terminal < 80 cols
  const cols = process.stdout.columns ?? 80;
  const compact = cols < 80;

  useKeyInput({
    onQuit: () => exit(),
    onKey: (key) => {
      if (key === "a") setAptExpanded((v) => !v);
    },
  });

  const groups = groupByCategory(tools);
  const categories = sortedCategories(groups);

  return (
    <Box flexDirection="column" padding={1}>
      <Header
        snapshot={snapshot}
        filterOutdated={filterOutdated}
        filterCategory={filterCategory}
        recentScans={recentScans}
      />

      {!snapshot ? (
        <Box marginTop={1}>
          <Text color={theme.muted}>
            No scan data found. Run: server-lens scan --now
          </Text>
        </Box>
      ) : groups.size === 0 ? (
        <Box marginTop={1}>
          <Text color={theme.muted}>No tools match the current filters.</Text>
        </Box>
      ) : (
        <Box flexDirection="column" marginTop={1}>
          {categories.map((category) => {
            const items = groups.get(category)!;
            const isApt = category === "apt";
            return (
              <CategoryGroup
                key={category}
                category={category}
                tools={items}
                collapsed={isApt ? !aptExpanded : undefined}
                compact={compact}
              />
            );
          })}
        </Box>
      )}

      <AlertBar alerts={systemAlerts} />

      {groups.size > 0 && (
        <Box marginTop={1}>
          <Text color={theme.muted} dimColor>q: quit  a: toggle apt</Text>
        </Box>
      )}
    </Box>
  );
}
