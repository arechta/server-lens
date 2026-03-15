import type { Scanner, DiscoveredTool } from "./types";

/** Detects Node.js via fnm (Fast Node Manager) — common on Windows */
export class FnmScanner implements Scanner {
  readonly source = "fnm" as const;

  async scan(): Promise<DiscoveredTool[]> {
    try {
      const proc = Bun.spawn(
        process.platform === "win32"
          ? ["fnm", "list"]
          : ["fnm", "list"],
        { stdout: "pipe", stderr: "pipe" }
      );
      const out = await new Response(proc.stdout).text();
      await proc.exited;
      if (proc.exitCode !== 0) return [];

      const tools: DiscoveredTool[] = [];
      const lines = out.split(/\r?\n/);
      for (const line of lines) {
        const defaultMatch = line.match(/v?(\d+\.\d+\.\d+)\s*\(default\)/i);
        if (defaultMatch) {
          tools.push({
            name: "node",
            display_name: "Node.js",
            current_version: defaultMatch[1],
            category: "runtime",
            source: "fnm",
          });
          break;
        }
      }
      return tools;
    } catch {
      return [];
    }
  }
}
