import type { Scanner, DiscoveredTool } from "./types";

/** Linux only — snap packages */
export class SnapScanner implements Scanner {
  readonly source = "snap" as const;

  async scan(): Promise<DiscoveredTool[]> {
    if (process.platform !== "linux") return [];

    try {
      const proc = Bun.spawn(["snap", "list"], {
        stdout: "pipe",
        stderr: "pipe",
      });
      const out = await new Response(proc.stdout).text();
      await proc.exited;

      const lines = out.trim().split("\n").slice(1);
      return lines.map((line) => {
        const parts = line.split(/\s+/);
        const name = parts[0];
        const version = parts[1] ?? null;
        return {
          name,
          display_name: name,
          current_version: version,
          category: "snap" as const,
          source: "snap" as const,
          source_key: name,
        };
      });
    } catch {
      return [];
    }
  }
}
