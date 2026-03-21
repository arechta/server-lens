import type { Scanner, DiscoveredTool } from "./types";
import { readdirSync, existsSync, readFileSync } from "fs";
import { join } from "path";

/** Linux only — /usr/local/bin fallback for binaries not caught by other scanners */
const BINARY_DIR = "/usr/local/bin";

const SKIP_NAMES = new Set([
  "node", "npm", "npx", "pnpm", "bun", "nvm",
  "docker", "docker-compose", "systemctl", "snap", "apt", "apt-get", "dpkg",
  // PulseAudio / ALSA tools — libpulse init tries to connect to the daemon
  // (triggers SSH-forwarded audio connections as a side effect)
  "paplay", "pacat", "parec", "pactl", "pacmd", "pasuspender",
  "pulseaudio", "aplay", "arecord", "amixer", "alsamixer",
  // MOTD wrappers — running these executes /etc/update-motd.d/* scripts
  // which can trigger login sounds, MOTD display, and other side effects
  "motd-wrapper", "run-parts", "update-motd",
]);

/** Extensions that indicate a script file rather than a compiled binary.
 *  Scripts called with --version have arbitrary side effects. */
const SKIP_EXTENSIONS = new Set([
  ".sh", ".bash", ".zsh", ".fish",          // shell scripts
  ".js", ".mjs", ".cjs", ".ts", ".mts",     // JavaScript / TypeScript
  ".py", ".pyc",                             // Python
  ".rb",                                     // Ruby
  ".pl", ".pm",                              // Perl
  ".php",                                    // PHP
  ".out", ".log",                            // output / log files
]);

/** Returns true if the file starts with a shebang line (is a script). */
function hasShebang(filePath: string): boolean {
  try {
    const buf = readFileSync(filePath, { flag: "r" });
    return buf[0] === 0x23 && buf[1] === 0x21; // '#!'
  } catch {
    return false;
  }
}

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
        if (!e.isFile()) continue;
        if (SKIP_NAMES.has(e.name)) continue;
        // Skip by extension (scripts have arbitrary side effects when called with --version)
        const ext = e.name.includes(".") ? e.name.slice(e.name.lastIndexOf(".")) : "";
        if (ext && SKIP_EXTENSIONS.has(ext)) continue;
        // Skip any remaining scripts detected by shebang
        const fullPath = join(BINARY_DIR, e.name);
        if (hasShebang(fullPath)) continue;
        const name = e.name;
        const version = await getVersion(fullPath);
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
