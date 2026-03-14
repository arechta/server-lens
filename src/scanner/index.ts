/**
 * Scanner orchestrator — runs all scanners, deduplicates by name
 */

import type { DiscoveredTool } from "./types";
import { BunScanner } from "./BunScanner";
import { NodeScanner } from "./NodeScanner";
import { NpmGlobalScanner } from "./NpmGlobalScanner";
import { NvmScanner } from "./NvmScanner";
import { AptScanner } from "./AptScanner";
import { SnapScanner } from "./SnapScanner";
import { DockerScanner } from "./DockerScanner";
import { Pm2Scanner } from "./Pm2Scanner";
import { SystemdScanner } from "./SystemdScanner";
import { BinaryScanner } from "./BinaryScanner";

const SCANNERS = [
  new BunScanner(),
  new NodeScanner(),
  new NpmGlobalScanner(),
  new NvmScanner(),
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
      if (t?.name && !byName.has(t.name)) {
        byName.set(t.name, t);
      }
    }
  }

  return Array.from(byName.values());
}
