import { platform } from "os";
import type { Probe, ProbeArgs, ProbeResult } from "../engine/probe-types";

function getShellArgs(command: string): [string, ...string[]] {
  if (platform() === "win32") {
    return ["powershell", "-NoProfile", "-Command", command];
  }
  return ["sh", "-c", command];
}

/** Escape hatch — runs custom shell command for version. Uses sh on Unix, PowerShell on Windows. */
export class ScriptProbe implements Probe {
  async run(args: ProbeArgs): Promise<ProbeResult> {
    const cmd = args.command;
    const latestCmd = args.latest_command;

    if (!cmd) {
      return {
        latest_version: null,
        latest_release_date: null,
        repo_url: null,
        probe_source: null,
        probe_status: "failed",
        error_message: "args.command required",
      };
    }

    try {
      const proc = Bun.spawn(getShellArgs(cmd), {
        stdout: "pipe",
        stderr: "pipe",
      });
      const out = await new Response(proc.stdout).text();
      await proc.exited;
      const current = out.trim();

      let latest: string | null = null;
      if (latestCmd) {
        const latestProc = Bun.spawn(getShellArgs(latestCmd), {
          stdout: "pipe",
          stderr: "pipe",
        });
        const latestOut = await new Response(latestProc.stdout).text();
        await latestProc.exited;
        latest = latestOut.trim() || null;
      }

      return {
        latest_version: latest,
        latest_release_date: null,
        repo_url: null,
        probe_source: cmd,
        probe_status: "success",
        error_message: null,
      };
    } catch (e) {
      return {
        latest_version: null,
        latest_release_date: null,
        repo_url: null,
        probe_source: cmd,
        probe_status: "failed",
        error_message: String(e),
      };
    }
  }
}
