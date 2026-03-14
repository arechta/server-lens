import type { Scanner, DiscoveredTool } from "./types";
import { readdirSync, existsSync } from "fs";
import { join } from "path";

/** Linux only — /usr/local/bin fallback for binaries not caught by other scanners */
const BINARY_DIR = "/usr/local/bin";
const SKIP_NAMES = new Set([
  "node", "npm", "npx", "pnpm", "bun", "nvm",
  "docker", "docker-compose", "systemctl", "snap", "apt", "apt-get", "dpkg",
]);

async function getVersion(binary: string): Promise<string | null> {
  try {
    const proc = Bun.spawn([binary, "--version"], {
      stdout: "pipe",
      stderr: "pipe",
    });
    const out = await new Response(proc.stdout).text();
    await proc.exited;
    const match = out.match(/(\d+\.\d+(?:\.\d+)?(?:\.\d+)?)/);
    return match ? match[1] : out.trim().split(/\s/)[1] ?? null;
  } catch {
    return null;
  }
}

export class BinaryScanner implements Scanner {
  readonly source = "binary" as const;

  async scan(): Promise<DiscoveredTool[]> {
    if (process.platform !== "linux" || !existsSync(BINARY_DIR)) return [];

    const tools: DiscoveredTool[] = [];
    try {
      const entries = readdirSync(BINARY_DIR, { withFileTypes: true });
      for (const e of entries) {
        if (!e.isFile() || SKIP_NAMES.has(e.name)) continue;
        const name = e.name;
        const version = await getVersion(join(BINARY_DIR, name));
        tools.push({
          name,
          display_name: name,
          current_version: version,
          category: "tools",
          source: "binary",
        });
      }
    } catch {
      // ignore
    }
    return tools;
  }
}
