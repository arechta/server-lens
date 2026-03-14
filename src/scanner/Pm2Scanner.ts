import type { Scanner, DiscoveredTool } from "./types";

/** PM2 processes — category pm2 */
export class Pm2Scanner implements Scanner {
  readonly source = "pm2" as const;

  async scan(): Promise<DiscoveredTool[]> {
    try {
      const proc = Bun.spawn(["pm2", "jlist"], {
        stdout: "pipe",
        stderr: "pipe",
      });
      const out = await new Response(proc.stdout).text();
      await proc.exited;

      const arr = JSON.parse(out) as Array<{ name?: string; pm2_env?: { version?: string } }>;
      if (!Array.isArray(arr)) return [];

      return arr.map((p) => ({
        name: p.name ?? "unknown",
        display_name: p.name ?? "unknown",
        current_version: p.pm2_env?.version ?? null,
        category: "pm2" as const,
        source: "pm2" as const,
      }));
    } catch {
      return [];
    }
  }
}
