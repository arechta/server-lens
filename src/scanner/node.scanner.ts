import type { Scanner, DiscoveredTool } from "./types";

/** Detects Node.js and sets source from path: nvm, fnm, or node (apt/system) */
async function getNodePath(): Promise<string | null> {
  try {
    if (process.platform === "win32") {
      const proc = Bun.spawn(["cmd", "/c", "where", "node"], {
        stdout: "pipe",
        stderr: "pipe",
      });
      const out = await new Response(proc.stdout).text();
      await proc.exited;
      const line = out.trim().split(/\r?\n/)[0];
      return line?.trim() || null;
    }
    const proc = Bun.spawn(
      ["sh", "-c", "type node 2>/dev/null || command -v node 2>/dev/null"],
      { stdout: "pipe", stderr: "pipe" }
    );
    const out = await new Response(proc.stdout).text();
    await proc.exited;
    const path = out.trim() || null;
    return path;
  } catch {
    return null;
  }
}

export class NodeScanner implements Scanner {
  readonly source = "node" as const;

  async scan(): Promise<DiscoveredTool[]> {
    try {
      const proc = Bun.spawn(["node", "--version"], {
        stdout: "pipe",
        stderr: "pipe",
      });
      const out = await new Response(proc.stdout).text();
      await proc.exited;
      const v = out.trim().replace(/^v/, "");
      if (!v) return [];

      const path = await getNodePath();
      let source: "nvm" | "fnm" | "node" = "node";
      if (path) {
        const lower = path.toLowerCase();
        if (lower.includes(".nvm") || lower.includes("/nvm/")) source = "nvm";
        else if (lower.includes(".fnm") || lower.includes("\\fnm\\") || lower.includes("/fnm/"))
          source = "fnm";
      }

      return [
        {
          name: "node",
          display_name: "Node.js",
          current_version: v,
          category: "runtime",
          source,
        },
      ];
    } catch {
      return [];
    }
  }
}
