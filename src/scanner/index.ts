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

export async function runAllScanners(): Promise<DiscoveredTool[]> {
  const results = await Promise.all(SCANNERS.map((s) => s.scan()));

  const byName = new Map<string, DiscoveredTool>();
  for (const tools of results) {
    for (const t of tools) {
      if (!t?.name) continue;
      const existing = byName.get(t.name);
      if (!existing) {
        byName.set(t.name, t);
        continue;
      }
      if (t.name === "node") {
        const a = NODE_SOURCE_PRIORITY[existing.source] ?? -1;
        const b = NODE_SOURCE_PRIORITY[t.source] ?? -1;
        if (b > a) byName.set(t.name, t);
      }
    }
  }

  return Array.from(byName.values());
}
