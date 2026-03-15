/**
 * Scanner orchestrator — runs all scanners, deduplicates by name.
 * For "node": prefer nvm > fnm > node > npm (so version-manager source wins).
 */

import type { DiscoveredTool } from "./types";
import { BunScanner } from "./BunScanner";
import { NodeScanner } from "./NodeScanner";
import { NpmGlobalScanner } from "./NpmGlobalScanner";
import { NvmScanner } from "./NvmScanner";
import { FnmScanner } from "./FnmScanner";
import { AptScanner } from "./AptScanner";
import { SnapScanner } from "./SnapScanner";
import { DockerScanner } from "./DockerScanner";
import { Pm2Scanner } from "./Pm2Scanner";
import { SystemdScanner } from "./SystemdScanner";
import { BinaryScanner } from "./BinaryScanner";

const NODE_SOURCE_PRIORITY: Record<string, number> = {
  nvm: 3,
  fnm: 2,
  node: 1,
  npm: 0,
};

const SCANNERS = [
  new BunScanner(),
  new NvmScanner(),
  new FnmScanner(),
  new NodeScanner(),
  new NpmGlobalScanner(),
  new AptScanner(),
  new SnapScanner(),
  new DockerScanner(),
  new Pm2Scanner(),
  new SystemdScanner(),
  new BinaryScanner(),
];

export async function runAllScanners(
  onDiscover?: (category: string, totalSoFar: number) => void
): Promise<DiscoveredTool[]> {
  const byName = new Map<string, DiscoveredTool>();
  let totalDiscovered = 0;

  await Promise.all(SCANNERS.map(async (s) => {
    const tools = await s.scan();
    const valid = tools.filter((t) => t?.name);
    for (const t of valid) {
      const existing = byName.get(t.name);
      if (!existing) {
        byName.set(t.name, t);
      } else if (t.name === "node") {
        const a = NODE_SOURCE_PRIORITY[existing.source] ?? -1;
        const b = NODE_SOURCE_PRIORITY[t.source] ?? -1;
        if (b > a) byName.set(t.name, t);
      }
    }
    if (valid.length > 0 && onDiscover) {
      totalDiscovered += valid.length;
      const cats = [...new Set(valid.map((t) => t.category))];
      const label = cats.length === 1 ? cats[0]! : "tools";
      onDiscover(label, totalDiscovered);
    }
  }));

  return Array.from(byName.values());
}
