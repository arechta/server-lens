/**
 * Probe engine — enriches discovered tools with latest versions
 * @see docs/probe-engine.md
 */

import type { DiscoveredTool } from "../scanner/types";
import type { VersionEntry, ToolCategory, ToolStatus, ProbeType } from "../schema/types";
import type { Config, ProbeDefinition } from "../config/config-loader";
import { createProbe } from "./probe-factory";
import { batchAptProbe } from "./AptProbe";
import { computeUpdateType } from "./version-utils";

function getProbeArgs(probe: ProbeDefinition): Record<string, string> {
  const args: Record<string, string> = {};
  const raw = (probe as Record<string, unknown>).args;
  if (typeof raw === "object" && raw !== null) {
    for (const [k, v] of Object.entries(raw)) {
      if (typeof v === "string") args[k] = v;
    }
  }
  return args;
}

function toVersionEntry(
  discovered: DiscoveredTool,
  probeResult: {
    latest_version: string | null;
    latest_release_date: string | null;
    repo_url: string | null;
    probe_source: string | null;
    probe_status: VersionEntry["probe_status"];
    error_message: string | null;
    release_notes?: string | null;
    release_notes_source?: string | null;
  },
  probeType: ProbeType,
  toolStatus: ToolStatus,
  repoUrl?: string
): VersionEntry {
  const latest = probeResult.latest_version;
  const current = discovered.current_version;
  const updateType = computeUpdateType(current, latest);
  const isOutdated = updateType !== "none" && updateType !== "null";

  return {
    name: discovered.name,
    display_name: discovered.display_name,
    category: discovered.category,
    tool_status: toolStatus,
    current_version: current,
    latest_version: latest,
    is_outdated: isOutdated,
    update_type: updateType,
    latest_release_date: probeResult.latest_release_date,
    probe_type: probeType,
    probe_status: probeResult.probe_status,
    probe_source: probeResult.probe_source,
    probe_error: probeResult.error_message,
    repo_url: repoUrl ?? probeResult.repo_url,
    release_notes: probeResult.release_notes ?? null,
    release_notes_source: probeResult.release_notes_source ?? null,
    last_checked_at: new Date().toISOString(),
    first_seen_at: new Date().toISOString(),
  };
}

export interface EnrichOptions {
  withNotes?: boolean;
  onProgress?: (toolName: string) => void;
  /** Max concurrent probe calls — default 20 */
  concurrency?: number;
}

/** Run tasks concurrently with a bounded limit */
async function runConcurrent<T>(
  tasks: Array<() => Promise<T>>,
  limit: number
): Promise<T[]> {
  const results: T[] = new Array(tasks.length);
  let next = 0;
  async function worker() {
    while (next < tasks.length) {
      const i = next++;
      results[i] = await tasks[i]();
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(limit, tasks.length) }, worker)
  );
  return results;
}

export async function enrichWithProbes(
  discovered: DiscoveredTool[],
  config: Config,
  options?: EnrichOptions
): Promise<VersionEntry[]> {
  const { withNotes = false, onProgress, concurrency = 20 } = options ?? {};
  const probeMap = new Map<string, ProbeDefinition>();
  for (const p of config.probes ?? []) {
    probeMap.set(p.name.toLowerCase(), p);
  }

  const githubToken = config.auth?.github_token;

  // Pre-batch all auto-discovered apt packages into a single subprocess call
  const autoAptTools = discovered.filter(
    (d) => !probeMap.has(d.name.toLowerCase()) && d.source === "apt" && d.source_key && process.platform === "linux"
  );
  const aptBatchMap = autoAptTools.length > 0
    ? await batchAptProbe(autoAptTools.map((d) => d.source_key!))
    : new Map<string, import("./probe-types").ProbeResult>();

  const tasks = discovered.map((d) => async (): Promise<VersionEntry> => {
    const key = d.name.toLowerCase();
    const def = probeMap.get(key);

    onProgress?.(d.name);

    if (def) {
      const probe = createProbe(def.probe_type, githubToken);
      if (!probe) {
        return toVersionEntry(
          d,
          {
            latest_version: null,
            latest_release_date: null,
            repo_url: def.repo_url ?? null,
            probe_source: null,
            probe_status: "failed",
            error_message: `Unknown probe_type: ${def.probe_type}`,
          },
          null,
          "registered",
          def.repo_url
        );
      }

      const args = getProbeArgs(def);
      if (withNotes) args._with_notes = "true";
      const result = await probe.run(args);
      return toVersionEntry(
        d,
        result,
        def.probe_type as ProbeType,
        "registered",
        def.repo_url
      );
    } else if (d.source === "apt" && d.source_key && process.platform === "linux") {
      // Use pre-batched result
      const result = aptBatchMap.get(d.source_key);
      if (result) {
        return toVersionEntry(d, result, "apt", "auto");
      }
      return toVersionEntry(
        d,
        {
          latest_version: null,
          latest_release_date: null,
          repo_url: null,
          probe_source: null,
          probe_status: "failed",
          error_message: "AptProbe not available",
        },
        null,
        "untracked"
      );
    } else {
      return toVersionEntry(
        d,
        {
          latest_version: null,
          latest_release_date: null,
          repo_url: null,
          probe_source: null,
          probe_status: "success",
          error_message: null,
        },
        "binary",
        "untracked"
      );
    }
  });

  return runConcurrent(tasks, concurrency);
}
