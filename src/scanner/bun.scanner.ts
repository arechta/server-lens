import type { Scanner, DiscoveredTool } from "./types";

export class BunScanner implements Scanner {
  readonly source = "bun" as const;

  async scan(): Promise<DiscoveredTool[]> {
    try {
      const proc = Bun.spawn(["bun", "--version"], {
        stdout: "pipe",
        stderr: "pipe",
      });
      const out = await new Response(proc.stdout).text();
      const code = await proc.exited;
      if (code !== 0) return [];

      const version = out.trim();
      if (!version) return [];

      return [
        {
          name: "bun",
          display_name: "Bun",
          current_version: version,
          category: "runtime",
          source: "bun",
        },
      ];
    } catch {
      return [];
    }
  }
}
