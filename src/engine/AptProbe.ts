import type { Probe, ProbeArgs, ProbeResult } from "./probe-types";

/** Run apt-cache policy for multiple packages in a single subprocess call */
export async function batchAptProbe(packages: string[]): Promise<Map<string, ProbeResult>> {
  const results = new Map<string, ProbeResult>();
  if (packages.length === 0 || process.platform !== "linux") {
    for (const pkg of packages) {
      results.set(pkg, {
        latest_version: null, latest_release_date: null, repo_url: null,
        probe_source: `apt-cache policy ${pkg}`, probe_status: "failed",
        error_message: process.platform !== "linux" ? "apt only available on Linux" : "no packages",
      });
    }
    return results;
  }

  try {
    const proc = Bun.spawn(["apt-cache", "policy", ...packages], {
      stdout: "pipe",
      stderr: "pipe",
    });
    const out = await new Response(proc.stdout).text();
    await proc.exited;

    // Parse multi-stanza output: each package starts with "pkgname:\n"
    // followed by "  Installed: X\n  Candidate: Y\n..."
    const stanzas = out.split(/^(?=\S)/m);
    const parsed = new Map<string, string | null>();
    for (const stanza of stanzas) {
      const nameMatch = stanza.match(/^(\S+):/);
      if (!nameMatch) continue;
      const name = nameMatch[1].toLowerCase();
      const candMatch = stanza.match(/Candidate:\s*(\S+)/);
      const version = candMatch ? candMatch[1] : null;
      parsed.set(name, version && version !== "(none)" ? version : null);
    }

    for (const pkg of packages) {
      const version = parsed.get(pkg.toLowerCase()) ?? null;
      results.set(pkg, {
        latest_version: version,
        latest_release_date: null,
        repo_url: null,
        probe_source: `apt-cache policy (batch)`,
        probe_status: version ? "success" : "failed",
        error_message: version ? null : "No candidate version",
      });
    }
  } catch (e) {
    for (const pkg of packages) {
      results.set(pkg, {
        latest_version: null, latest_release_date: null, repo_url: null,
        probe_source: `apt-cache policy (batch)`, probe_status: "failed",
        error_message: String(e),
      });
    }
  }

  return results;
}

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
