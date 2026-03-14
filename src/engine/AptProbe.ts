import type { Probe, ProbeArgs, ProbeResult } from "./probe-types";

export class AptProbe implements Probe {
  async run(args: ProbeArgs): Promise<ProbeResult> {
    const pkg = args.package;
    const source = `apt-cache policy ${pkg}`;
    if (!pkg) {
      return {
        latest_version: null,
        latest_release_date: null,
        repo_url: null,
        probe_source: source,
        probe_status: "failed",
        error_message: "args.package required",
      };
    }

    if (process.platform !== "linux") {
      return {
        latest_version: null,
        latest_release_date: null,
        repo_url: null,
        probe_source: source,
        probe_status: "failed",
        error_message: "apt only available on Linux",
      };
    }

    try {
      const proc = Bun.spawn(["apt-cache", "policy", pkg], {
        stdout: "pipe",
        stderr: "pipe",
      });
      const out = await new Response(proc.stdout).text();
      await proc.exited;

      const match = out.match(/Candidate:\s*(\S+)/);
      const version = match ? match[1] : null;
      if (version && version !== "(none)") {
        return {
          latest_version: version,
          latest_release_date: null,
          repo_url: null,
          probe_source: source,
          probe_status: "success",
          error_message: null,
        };
      }

      return {
        latest_version: null,
        latest_release_date: null,
        repo_url: null,
        probe_source: source,
        probe_status: "failed",
        error_message: "No candidate version",
      };
    } catch (e) {
      return {
        latest_version: null,
        latest_release_date: null,
        repo_url: null,
        probe_source: source,
        probe_status: "failed",
        error_message: String(e),
      };
    }
  }
}
