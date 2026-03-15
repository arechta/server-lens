import { homedir } from "os";
import type { Scanner, DiscoveredTool } from "./types";

/**
 * Try to get nvm script path when nvm is already a function (e.g. in login shell).
 * Output: "nvm 3053 /root/.nvm/nvm.sh" → we use the third field and set NVM_DIR to its dirname.
 */
async function getNvmPathFromShell(env: Record<string, string>): Promise<string | null> {
  try {
    const proc = Bun.spawn(
      ["bash", "-l", "-c", "shopt -s extdebug 2>/dev/null; declare -F nvm 2>/dev/null; shopt -u extdebug 2>/dev/null"],
      { stdout: "pipe", stderr: "pipe", env }
    );
    const out = await new Response(proc.stdout).text();
    await proc.exited;
    const match = out.match(/nvm\s+\d+\s+(.+\.nvm\.sh)/);
    if (match) {
      const path = match[1].trim();
      if (path) return path;
    }
  } catch {
    // ignore
  }
  return null;
}

/** Build shell script that sources nvm then runs a command. Uses NVM_SCRIPT_PATH (env) if set, else NVM_DIR, HOME/.nvm, or /usr/local/nvm. */
function nvmShellScript(command: string): string {
  return [
    '[ -n "$NVM_SCRIPT_PATH" ] && [ -f "$NVM_SCRIPT_PATH" ] && . "$NVM_SCRIPT_PATH"',
    '[ -z "$NVM_SCRIPT_PATH" ] && [ -n "$NVM_DIR" ] && [ -f "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"',
    '[ -z "$NVM_SCRIPT_PATH" ] && [ -n "$HOME" ] && [ -f "$HOME/.nvm/nvm.sh" ] && . "$HOME/.nvm/nvm.sh"',
    '[ -z "$NVM_SCRIPT_PATH" ] && [ -f /usr/local/nvm/nvm.sh ] && . /usr/local/nvm/nvm.sh',
    "nvm " + command + " 2>/dev/null",
  ].join("; ");
}

export class NvmScanner implements Scanner {
  readonly source = "nvm" as const;

  async scan(): Promise<DiscoveredTool[]> {
    const tools: DiscoveredTool[] = [];
    if (process.platform === "win32") {
      try {
        const proc = Bun.spawn(["cmd", "/c", "nvm version"], {
          stdout: "pipe",
          stderr: "pipe",
          env: { ...process.env },
        });
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
        const procLs = Bun.spawn(["cmd", "/c", "nvm list"], {
          stdout: "pipe",
          stderr: "pipe",
          env: { ...process.env },
        });
        const outLs = await new Response(procLs.stdout).text();
        await procLs.exited;
        const match = outLs.match(/v?(\d+\.\d+\.\d+)/g);
        if (match) {
          const versions = [...new Set(match)];
          const defaultMatch = outLs.match(/\*\s+v?(\d+\.\d+\.\d+)/);
          const defaultVer = defaultMatch ? defaultMatch[1].replace(/^v/, "") : null;
          for (const v of versions) {
            const ver = v.startsWith("v") ? v.slice(1) : v;
            const isDefault = defaultVer === ver || outLs.includes(`* ${v}`) || outLs.includes(`* ${ver}`);
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
        // nvm not available on Windows
      }
      return tools;
    }

    const env = {
      ...process.env,
      HOME: process.env.HOME || process.env.USERPROFILE || homedir(),
      NVM_DIR: process.env.NVM_DIR || "",
    };

    // Optional: when nvm is a function (e.g. in login shell), get script path via declare -F for reliable sourcing
    const nvmShPath = await getNvmPathFromShell(env);
    const envWithPath = nvmShPath ? { ...env, NVM_SCRIPT_PATH: nvmShPath } : env;

    // nvm itself — source from NVM_SCRIPT_PATH, NVM_DIR, HOME/.nvm, or /usr/local/nvm then run nvm --version
    try {
      const proc = Bun.spawn(
        ["bash", "-c", nvmShellScript("--version")],
        { stdout: "pipe", stderr: "pipe", env: envWithPath }
      );
      const out = await new Response(proc.stdout).text();
      await proc.exited;
      const version = out.trim();
      if (version && !version.includes("not found") && /^\d|^v?\d+\.\d+/.test(version)) {
        tools.push({
          name: "nvm",
          display_name: "nvm",
          current_version: version.replace(/^v/, ""),
          category: "runtime",
          source: "nvm",
        });
      }
    } catch {
      // nvm not available
    }

    // Node versions via nvm ls (or nvm list; both work)
    try {
      const proc = Bun.spawn(
        ["bash", "-c", nvmShellScript("ls --no-colors")],
        { stdout: "pipe", stderr: "pipe", env: envWithPath }
      );
      const out = await new Response(proc.stdout).text();
      await proc.exited;

      const match = out.match(/v?(\d+\.\d+\.\d+)/g);
      if (match) {
        const versions = [...new Set(match)];
        for (const v of versions) {
          const ver = v.startsWith("v") ? v.slice(1) : v;
          const isDefault =
            out.includes(`-> ${v}`) ||
            out.includes(`* ${v}`) ||
            out.includes(`-> ${ver}`) ||
            out.includes(`* ${ver}`);
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
