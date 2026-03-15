/**
 * NodeProbe — fetches latest Node.js version from nodejs.org
 * If current version is LTS: compare to latest in same LTS line.
 * If current is Current (non-LTS): compare to latest Current.
 */

import type { Probe, ProbeArgs, ProbeResult } from "./probe-types";
import { getRandomUserAgent } from "../utils/user-agent";

const NODE_INDEX_URL = "https://nodejs.org/download/release/index.json";

interface NodeRelease {
  version: string;
  date: string;
  lts: false | string;
}

function parseVersion(v: string): string {
  return v.replace(/^v/, "").trim();
}


export class NodeProbe implements Probe {
  private index: NodeRelease[] | null = null;

  private async fetchIndex(): Promise<NodeRelease[]> {
    if (this.index) return this.index;
    const res = await fetch(NODE_INDEX_URL, {
      headers: { "User-Agent": getRandomUserAgent() },
    });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }
    const data = (await res.json()) as NodeRelease[];
    this.index = data;
    return data;
  }

  async run(args: ProbeArgs): Promise<ProbeResult> {
    const currentRaw = args.current_version ?? args.version ?? "";
    const current = parseVersion(currentRaw);
    if (!current) {
      return {
        latest_version: null,
        latest_release_date: null,
        repo_url: "https://nodejs.org/",
        probe_source: NODE_INDEX_URL,
        probe_status: "failed",
        error_message: "current_version required",
      };
    }

    try {
      const list = await this.fetchIndex();
      const currentEntry = list.find(
        (r) => parseVersion(r.version) === current || r.version === `v${current}`
      );
      const currentIsLts = currentEntry && currentEntry.lts !== false;

      let targetEntry: NodeRelease | undefined;
      if (currentIsLts && typeof currentEntry!.lts === "string") {
        const ltsName = currentEntry!.lts;
        targetEntry = list.find(
          (r) => r.lts === ltsName
        );
      } else {
        targetEntry = list.find((r) => r.lts === false);
      }

      if (!targetEntry) {
        return {
          latest_version: null,
          latest_release_date: null,
          repo_url: "https://nodejs.org/",
          probe_source: NODE_INDEX_URL,
          probe_status: "failed",
          error_message: "Could not determine target release line",
        };
      }

      const latest = parseVersion(targetEntry.version);
      const date = targetEntry.date
        ? `${targetEntry.date}T00:00:00.000Z`
        : null;

      return {
        latest_version: latest,
        latest_release_date: date,
        repo_url: "https://nodejs.org/",
        probe_source: NODE_INDEX_URL,
        probe_status: "success",
        error_message: null,
      };
    } catch (err) {
      return {
        latest_version: null,
        latest_release_date: null,
        repo_url: "https://nodejs.org/",
        probe_source: NODE_INDEX_URL,
        probe_status: "failed",
        error_message: err instanceof Error ? err.message : String(err),
      };
    }
  }
}
