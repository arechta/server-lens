import type { Scanner, DiscoveredTool } from "./types";

/** Detects Node.js via `node --version` — works when nvm is not used */
export class NodeScanner implements Scanner {
  readonly source = "npm" as const; // category runtime

  async scan(): Promise<DiscoveredTool[]> {
    try {
      const proc = Bun.spawn(["node", "--version"], {
        stdout: "pipe",
        stderr: "pipe",
      });
      const out = await new Response(proc.stdout).text();
      await proc.exited;
      const v = out.trim().replace(/^v/, "");
      if (v) {
        return [
          {
            name: "node",
            display_name: "Node.js",
            current_version: v,
            category: "runtime",
            source: "npm",
          },
        ];
      }
    } catch {
      // node not installed
    }
    return [];
  }
}
