import type { ProbeStatus } from "../schema/types";

export interface ProbeArgs {
  [key: string]: string;
}

export interface ProbeResult {
  latest_version: string | null;
  latest_release_date: string | null;
  repo_url: string | null;
  probe_source: string | null;
  probe_status: ProbeStatus;
  error_message: string | null;
}

export interface Probe {
  run(args: ProbeArgs): Promise<ProbeResult>;
}
