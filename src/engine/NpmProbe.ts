import type { Probe, ProbeArgs, ProbeResult } from "./probe-types";

interface NpmPackage {
  "dist-tags"?: { latest?: string };
  time?: Record<string, string>;
}

export class NpmProbe implements Probe {
  async run(args: ProbeArgs): Promise<ProbeResult> {
    const pkg = args.package;
    const regUrl = `https://registry.npmjs.org/${encodeURIComponent(pkg ?? "")}`;
    if (!pkg) {
      return {
        latest_version: null,
        latest_release_date: null,
        repo_url: null,
        probe_source: regUrl,
        probe_status: "failed",
        error_message: "args.package required",
      };
    }

    try {
      const res = await fetch(regUrl);

      if (!res.ok) {
        return {
          latest_version: null,
          latest_release_date: null,
          repo_url: `https://www.npmjs.com/package/${pkg}`,
          probe_source: regUrl,
          probe_status: "failed",
          error_message: `HTTP ${res.status}`,
        };
      }

      const data = (await res.json()) as NpmPackage;
      const version = data["dist-tags"]?.latest ?? null;
      const time = data.time;
      const date = version && time ? time[version] ?? null : null;

      return {
        latest_version: version,
        latest_release_date: date,
        repo_url: `https://www.npmjs.com/package/${pkg}`,
        probe_source: regUrl,
        probe_status: version ? "success" : "failed",
        error_message: version ? null : "No latest version",
      };
    } catch (e) {
      return {
        latest_version: null,
        latest_release_date: null,
        repo_url: null,
        probe_source: regUrl,
        probe_status: "failed",
        error_message: String(e),
      };
    }
  }
}
