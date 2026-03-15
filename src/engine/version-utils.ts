import type { UpdateType } from "../schema/types";

const SEMVER = /^(\d+)\.(\d+)\.(\d+)(?:[-.](\w+))?$/;

/** Coerce short versions so 1 vs 1.12.1 is compared as 1.0.0 vs 1.12.1 (minor), not unknown. */
function normalizeForCompare(v: string): string {
  const s = v.trim().replace(/^v/, "");
  if (SEMVER.test(s)) return s;
  const parts = s.split(".").filter(Boolean);
  if (parts.length === 1 && /^\d+$/.test(parts[0]!)) return `${parts[0]}.0.0`;
  if (parts.length === 2 && /^\d+$/.test(parts[0]!) && /^\d+$/.test(parts[1]!)) return `${parts[0]}.${parts[1]}.0`;
  return s;
}

function parseSemver(v: string): [number, number, number] | null {
  const normalized = normalizeForCompare(v);
  const m = normalized.match(SEMVER);
  if (!m) return null;
  return [parseInt(m[1], 10), parseInt(m[2], 10), parseInt(m[3], 10)];
}

function compareSemver(a: string, b: string): number {
  const va = parseSemver(normalizeForCompare(a));
  const vb = parseSemver(normalizeForCompare(b));
  if (!va || !vb) return 0; // unknown
  for (let i = 0; i < 3; i++) {
    if (va[i] !== vb[i]) return va[i] - vb[i];
  }
  return 0;
}

export function computeUpdateType(
  current: string | null,
  latest: string | null
): UpdateType {
  if (!latest) return "null";
  if (!current) return "unknown";
  if (current === latest) return "none";

  const va = parseSemver(normalizeForCompare(current));
  const vb = parseSemver(normalizeForCompare(latest));
  if (!va || !vb) return "unknown";

  const cmp = compareSemver(current, latest);
  if (cmp === 0) return "none";
  if (cmp > 0) return "none"; // current newer than latest (e.g. prerelease)

  if (va[0] !== vb[0]) return "major";
  if (va[1] !== vb[1]) return "minor";
  return "patch";
}
