import type { Scanner, DiscoveredTool } from "./types";

async function runCmd(cmd: string, args: string[]): Promise<string> {
  try {
    const proc = Bun.spawn([cmd, ...args], {
      stdout: "pipe",
      stderr: "pipe",
      env: { ...process.env },
    });
    const out = await new Response(proc.stdout).text();
    await proc.exited;
    return out.trim();
  } catch {
    return "";
  }
}

export class NvmScanner implements Scanner {
  readonly source = "nvm" as const;

  async scan(): Promise<DiscoveredTool[]> {
    const tools: DiscoveredTool[] = [];

    // nvm itself — try nvm --version (bash) or nvm version
    try {
      const proc = Bun.spawn(
        process.platform === "win32" ? "cmd" : "bash",
        process.platform === "win32"
          ? ["/c", "nvm version"]
          : ["-c", "source ~/.nvm/nvm.sh 2>/dev/null; nvm --version"],
        { stdout: "pipe", stderr: "pipe" }
      );
      const out = await new Response(proc.stdout).text();
      await proc.exited;
      const version = out.trim();
      if (version && !version.includes("not found")) {
        tools.push({
          name: "nvm",
          display_name: "nvm",
          current_version: version,
          category: "runtime",
          source: "nvm",
        });
      }
    } catch {
      // nvm not available
    }

    // Node versions via nvm ls
    try {
      const proc = Bun.spawn(
        process.platform === "win32" ? "cmd" : "bash",
        process.platform === "win32"
          ? ["/c", "nvm list"]
          : ["-c", "source ~/.nvm/nvm.sh 2>/dev/null; nvm ls --no-colors"],
        { stdout: "pipe", stderr: "pipe" }
      );
      const out = await new Response(proc.stdout).text();
      await proc.exited;

      const match = out.match(/v?(\d+\.\d+\.\d+)/g);
      if (match) {
        const versions = [...new Set(match)];
        for (const v of versions) {
          const ver = v.startsWith("v") ? v.slice(1) : v;
          const isDefault = out.includes(`-> ${v}`) || out.includes(`* ${v}`);
          tools.push({
            name: isDefault ? "node" : `node-${ver}`,
            display_name: isDefault ? "Node.js" : `Node ${ver}`,
            current_version: ver,
            category: "runtime",
            source: "nvm",
          });
        }
      }
    } catch {
      // ignore
    }

    return tools;
  }
}
