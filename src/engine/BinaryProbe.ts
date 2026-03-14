import type { Probe, ProbeArgs, ProbeResult } from "./probe-types";

/** BinaryProbe only gets current_version — latest remains null (untracked) */
export class BinaryProbe implements Probe {
  async run(args: ProbeArgs): Promise<ProbeResult> {
    const binary = args.binary ?? "";
    return {
      latest_version: null,
      latest_release_date: null,
      repo_url: null,
      probe_source: binary ? `${binary} --version` : null,
      probe_status: "success",
      error_message: null,
    };
  }
}
