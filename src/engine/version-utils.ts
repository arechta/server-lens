import type { UpdateType } from "../schema/types";

const SEMVER = /^(\d+)\.(\d+)\.(\d+)(?:[-.](\w+))?$/;

function parseSemver(v: string): [number, number, number] | null {
  const m = v.match(SEMVER);
  if (!m) return null;
  return [parseInt(m[1], 10), parseInt(m[2], 10), parseInt(m[3], 10)];
}

function compareSemver(a: string, b: string): number {
  const va = parseSemver(a);
  const vb = parseSemver(b);
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

  const va = parseSemver(current);
  const vb = parseSemver(latest);
  if (!va || !vb) return "unknown";

  const cmp = compareSemver(current, latest);
  if (cmp === 0) return "none";
  if (cmp > 0) return "none"; // current newer than latest (e.g. prerelease)

  if (va[0] !== vb[0]) return "major";
  if (va[1] !== vb[1]) return "minor";
  return "patch";
}
