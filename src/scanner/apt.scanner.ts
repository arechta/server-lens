import type { Scanner, DiscoveredTool } from "./types";

/** Linux only — dpkg/apt packages */
export class AptScanner implements Scanner {
  readonly source = "apt" as const;

  async scan(): Promise<DiscoveredTool[]> {
    if (process.platform !== "linux") return [];

    try {
      const proc = Bun.spawn(
        ["dpkg-query", "-W", "-f", "${Package} ${Version}\n"],
        { stdout: "pipe", stderr: "pipe" }
      );
      const out = await new Response(proc.stdout).text();
      await proc.exited;

      const lines = out.trim().split("\n").filter(Boolean);
      return lines.map((line) => {
        const [name, version] = line.split(/\s+/, 2);
        return {
          name,
          display_name: name,
          current_version: version ?? null,
          category: "apt" as const,
          source: "apt" as const,
          source_key: name,
        };
      });
    } catch {
      return [];
    }
  }
}
