import type { Scanner, DiscoveredTool } from "./types";

interface NpmLsDep {
  version?: string;
  [key: string]: unknown;
}

interface NpmLsOutput {
  dependencies?: Record<string, NpmLsDep>;
}

async function runNpmLs(): Promise<DiscoveredTool[]> {
  try {
    const proc = Bun.spawn(
      ["npm", "ls", "-g", "--depth=0", "--json"],
      { stdout: "pipe", stderr: "pipe" }
    );
    const out = await new Response(proc.stdout).text();
    await proc.exited;

    let json: NpmLsOutput;
    try {
      json = JSON.parse(out) as NpmLsOutput;
    } catch {
      return [];
    }
    const deps = json.dependencies ?? {};
    const tools: DiscoveredTool[] = [];

    for (const [name, dep] of Object.entries(deps)) {
      if (!name) continue;
      const version = dep?.version ?? null;
      tools.push({
        name,
        display_name: name,
        current_version: version,
        category: "runtime",
        source: "npm",
      });
    }
    return tools;
  } catch {
    return [];
  }
}

async function runPnpmLs(): Promise<DiscoveredTool[]> {
  try {
    const proc = Bun.spawn(
      ["pnpm", "ls", "-g", "--json"],
      { stdout: "pipe", stderr: "pipe" }
    );
    const out = await new Response(proc.stdout).text();
    await proc.exited;

    const arr = JSON.parse(out) as Array<{ name: string; version?: string }>;
    if (!Array.isArray(arr)) return [];

    return arr.map((p) => ({
      name: p.name,
      display_name: p.name,
      current_version: p.version ?? null,
      category: "runtime" as const,
      source: "pnpm" as const,
    }));
  } catch {
    return [];
  }
}

export class NpmGlobalScanner implements Scanner {
  readonly source = "npm" as const;

  async scan(): Promise<DiscoveredTool[]> {
    const [npmTools, pnpmTools] = await Promise.all([
      runNpmLs(),
      runPnpmLs(),
    ]);

    const seen = new Set<string>();
    const merged: DiscoveredTool[] = [];

    for (const t of [...npmTools, ...pnpmTools]) {
      const key = `${t.source}:${t.name}`;
      if (seen.has(key)) continue;
      seen.add(key);
      merged.push(t);
    }

    return merged;
  }
}
