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
import {
  getContainerCurrentVersion,
  getContainerBaseImageFromLabels,
  getContainerImageRepoDigest,
  getVersionByDigestFromDockerHub,
  getDigestForTagFromDockerHub,
} from "./container-version";
import { getGhcrManifestDigest } from "./GhcrProbe";
import { clearDockerHubTagCache } from "./DockerHubProbe";
import { resetUserAgent } from "../utils/user-agent";

/** Built-in exec commands for common containers when labels are missing. Config overrides these. */
const KNOWN_CONTAINER_VERSION_COMMANDS: Record<string, string> = {
  n8n: "n8n --version",
  "n8n-n8n": "n8n --version",
  "n8nio/n8n": "n8n --version",
};

function getContainerGroupPrefix(containerName: string, groups: Record<string, string[]>): string | null {
  for (const [groupName, names] of Object.entries(groups)) {
    if (names.includes(containerName)) return groupName;
  }
  return null;
}

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

/** Parse container image string (from docker ps) into registry + probe args. Local builds (e.g. project_service) return null. */
function parseContainerImage(
  imageRef: string
): { registry: "ghcr"; owner: string; image: string } | { registry: "dockerhub"; image: string } | null {
  if (!imageRef?.trim()) return null;
  const namePart = imageRef.includes(":") ? imageRef.split(":", 2)[0]!.trim() : imageRef.trim();
  if (!namePart) return null;
  const parts = namePart.split("/");
  if (parts.length >= 3 && parts[0] === "ghcr.io") {
    return { registry: "ghcr", owner: parts[1], image: parts[2] };
  }
  if (parts.length >= 3 && parts[0]?.includes(".")) {
    return { registry: "ghcr", owner: parts[1], image: parts[2] };
  }
  if (parts.length >= 2 && !parts[0].includes(".")) {
    return { registry: "dockerhub", image: `${parts[0]}/${parts[1]}` };
  }
  if (parts.length === 1) {
    if (namePart.includes("-")) return null;
    return { registry: "dockerhub", image: `library/${namePart}` };
  }
  return null;
}

/** When local image digest matches remote digest for "latest" tag, treat as up-to-date (e.g. opengist 1 and 1.12.1 same digest). */
async function applyDigestComparison<T extends { latest_version: string | null }>(
  displayTool: DiscoveredTool,
  result: T,
  d: DiscoveredTool,
  githubToken?: string
): Promise<T> {
  if (
    d.source !== "docker" ||
    d.category !== "container" ||
    !d.container_name ||
    !d.source_key ||
    !result.latest_version ||
    result.latest_version === displayTool.current_version
  )
    return result;
  const localDigest = await getContainerImageRepoDigest(d.container_name);
  if (!localDigest) return result;
  const parsed = parseContainerImage(d.source_key);
  if (!parsed) return result;
  let remoteDigest: string | null = null;
  if (parsed.registry === "dockerhub") {
    remoteDigest = await getDigestForTagFromDockerHub(parsed.image, result.latest_version);
  } else if (parsed.registry === "ghcr") {
    remoteDigest = await getGhcrManifestDigest(
      parsed.owner,
      parsed.image,
      result.latest_version,
      githubToken
    );
  }
  if (remoteDigest && localDigest === remoteDigest)
    return { ...result, latest_version: displayTool.current_version };
  return result;
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
  /** Called after each probe completes with the result and elapsed ms */
  onProbeComplete?: (entry: VersionEntry, durationMs: number) => void;
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
  resetUserAgent(); // new random browser UA per scan to avoid static bot fingerprint
  clearDockerHubTagCache(); // reset per-scan dedup cache
  const { withNotes = false, onProgress, onProbeComplete, concurrency = 20 } = options ?? {};
  const probeMap = new Map<string, ProbeDefinition>();
  for (const p of config.probes ?? []) {
    probeMap.set(p.name.toLowerCase(), p);
  }

  const githubToken = config.auth?.github_token;

  // Pre-batch all auto-discovered apt packages into a single subprocess call
  const autoAptTools = discovered.filter(
    (d) => !probeMap.has(d.name.toLowerCase()) && d.source === "apt" && d.source_key && process.platform === "linux"
  );
  if (autoAptTools.length > 0) onProgress?.("collecting apt packages…");
  const aptBatchMap = autoAptTools.length > 0
    ? await batchAptProbe(
        autoAptTools.map((d) => d.source_key!),
        (count) => onProgress?.(`collecting apt packages (${count} done)`)
      )
    : new Map<string, import("./probe-types").ProbeResult>();

  const tasks = discovered.map((d) => async (): Promise<VersionEntry> => {
    onProgress?.(d.name);
    const _t0 = performance.now();
    const _entry = await (async (): Promise<VersionEntry> => {

    // Resolve container current version (labels → exec → digest) for ALL containers so "latest" tag becomes digest or real version
    let containerDisplay = d;
    if (d.source === "docker" && d.category === "container" && d.container_name) {
      let execCmd =
        config.container_version_commands?.[d.container_name] ??
        config.container_version_commands?.[d.name] ??
        KNOWN_CONTAINER_VERSION_COMMANDS[d.container_name] ??
        KNOWN_CONTAINER_VERSION_COMMANDS[d.name];
      if (!execCmd && /^redis(-redis)?-pool-\d+$/.test(d.name)) execCmd = "redis-server --version";
      if (!execCmd && (d.name === "postgres" || d.name === "postgres-postgres")) execCmd = "postgres --version";
      if (!execCmd && config.container_groups?.mailu?.includes(d.name)) execCmd = "cat /version";
      const v = await getContainerCurrentVersion(d.container_name, {
        execCommand: execCmd,
        fallbackToDigest: true,
      });
      if (v) {
        const existingTag = d.current_version ?? "";
        const isDigest = v.startsWith("sha256:");
        const tagLooksLikeVersion = existingTag && existingTag !== "latest" && /\d/.test(existingTag);
        if (!isDigest || !tagLooksLikeVersion) {
          let showVersion = isDigest && existingTag === "latest" ? "latest" : v;
          if (d.source_key && (showVersion === "latest" || showVersion.startsWith("sha256:"))) {
            const parsed = parseContainerImage(d.source_key);
            if (parsed?.registry === "dockerhub") {
              const repoDigest = await getContainerImageRepoDigest(d.container_name!);
              if (repoDigest) {
                const resolved = await getVersionByDigestFromDockerHub(parsed.image, repoDigest);
                if (resolved) showVersion = resolved;
              }
            }
          }
          containerDisplay = { ...d, current_version: showVersion };
        }
      }
    }

    let displayTool = containerDisplay;
    if (d.source === "docker" && d.category === "container" && config.container_groups) {
      const prefix = getContainerGroupPrefix(d.name, config.container_groups);
      if (prefix) displayTool = { ...containerDisplay, display_name: `${prefix}/${d.name}` };
    }

    const key = d.name.toLowerCase();
    const def = probeMap.get(key);

    if (def) {
      const probe = createProbe(def.probe_type, githubToken);
      if (!probe) {
        return toVersionEntry(
          displayTool,
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
      if (def.probe_type === "node" && d.current_version)
        args.current_version = d.current_version;
      let result = await probe.run(args);
      if (def.category === "container")
        result = await applyDigestComparison(displayTool, result, d, githubToken);
      return toVersionEntry(
        displayTool,
        result,
        def.probe_type as ProbeType,
        "registered",
        def.repo_url
      );
    } else if (
      d.name === "node" &&
      (d.source === "nvm" || d.source === "fnm" || d.source === "node")
    ) {
      // Auto: Node.js from nvm/fnm/system — use NodeProbe (LTS vs latest)
      const probe = createProbe("node", githubToken);
      if (!probe) {
        return toVersionEntry(
          d,
          {
            latest_version: null,
            latest_release_date: null,
            repo_url: "https://nodejs.org/",
            probe_source: null,
            probe_status: "failed",
            error_message: "NodeProbe not available",
          },
          "node",
          "untracked"
        );
      }
      const result = await probe.run({
        current_version: d.current_version ?? "",
      });
      return toVersionEntry(d, result, "node", "auto");
    } else if (d.source === "apt" && d.source_key && process.platform === "linux") {
      // Auto: batch apt probe for discovered apt packages not in TOML
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
    } else if (d.source === "npm" || d.source === "pnpm") {
      // Auto: resolve by NpmProbe for discovered npm/pnpm globals not in TOML
      const probe = createProbe("npm", githubToken);
      if (!probe) {
        return toVersionEntry(
          d,
          {
            latest_version: null,
            latest_release_date: null,
            repo_url: null,
            probe_source: null,
            probe_status: "failed",
            error_message: "NpmProbe not available",
          },
          "npm",
          "untracked"
        );
      }
      const args: Record<string, string> = { package: d.name };
      if (withNotes) args._with_notes = "true";
      const result = await probe.run(args);
      return toVersionEntry(d, result, "npm", "auto");
    } else if (d.name === "nvm" && d.source === "nvm") {
      // Auto: resolve nvm via GitHub (nvm-sh/nvm) when not in TOML — uses config github_token
      const probe = createProbe("github", githubToken);
      if (!probe) {
        return toVersionEntry(
          d,
          {
            latest_version: null,
            latest_release_date: null,
            repo_url: "https://github.com/nvm-sh/nvm",
            probe_source: null,
            probe_status: "failed",
            error_message: "GithubProbe not available",
          },
          "github",
          "untracked"
        );
      }
      const result = await probe.run({
        owner: "nvm-sh",
        repo: "nvm",
        tag_prefix: "v",
      });
      return toVersionEntry(
        d,
        result,
        "github",
        "auto",
        "https://github.com/nvm-sh/nvm"
      );
    } else if (d.name === "bun" && d.source === "bun") {
      // Auto: resolve Bun via GitHub (oven-sh/bun) when not in TOML
      const probe = createProbe("github", githubToken);
      if (!probe) {
        return toVersionEntry(
          d,
          {
            latest_version: null,
            latest_release_date: null,
            repo_url: "https://github.com/oven-sh/bun",
            probe_source: null,
            probe_status: "failed",
            error_message: "GithubProbe not available",
          },
          "github",
          "untracked"
        );
      }
      const result = await probe.run({
        owner: "oven-sh",
        repo: "bun",
        tag_prefix: "bun-v",
      });
      return toVersionEntry(
        d,
        result,
        "github",
        "auto",
        "https://github.com/oven-sh/bun"
      );
    } else if (d.source === "snap" && d.category === "snap") {
      const probe = createProbe("snap", githubToken);
      if (!probe) {
        return toVersionEntry(
          d,
          {
            latest_version: null,
            latest_release_date: null,
            repo_url: `https://snapcraft.io/${d.name}`,
            probe_source: null,
            probe_status: "failed",
            error_message: "SnapProbe not available",
          },
          "snap",
          "untracked"
        );
      }
      const result = await probe.run({ package: d.name, name: d.name });
      return toVersionEntry(d, result, "snap", "auto", `https://snapcraft.io/${d.name}`);
    } else if (d.source === "docker" && d.category === "container" && d.source_key) {
      const parsed = parseContainerImage(d.source_key);
      if (parsed?.registry === "ghcr") {
        const probe = createProbe("ghcr", githubToken);
        if (!probe) {
          return toVersionEntry(
            displayTool,
            {
              latest_version: null,
              latest_release_date: null,
              repo_url: `https://github.com/${parsed.owner}`,
              probe_source: null,
              probe_status: "failed",
              error_message: "GhcrProbe not available",
            },
            "ghcr",
            "untracked"
          );
        }
        let result = await probe.run({
          owner: parsed.owner,
          image: parsed.image,
          tag_filter: String.raw`^\d+\.\d+(\.\d+)?$`,
        });
        result = await applyDigestComparison(displayTool, result, d, githubToken);
        return toVersionEntry(displayTool, result, "ghcr", "auto");
      }
      if (parsed?.registry === "dockerhub") {
        const probe = createProbe("dockerhub", githubToken);
        if (!probe) {
          return toVersionEntry(
            displayTool,
            {
              latest_version: null,
              latest_release_date: null,
              repo_url: `https://hub.docker.com/r/${parsed.image}`,
              probe_source: null,
              probe_status: "failed",
              error_message: "DockerHubProbe not available",
            },
            "dockerhub",
            "untracked"
          );
        }
        let result = await probe.run({
          image: parsed.image,
          tag_filter: String.raw`^\d+\.\d+(\.\d+)?$`,
        });
        result = await applyDigestComparison(displayTool, result, d, githubToken);
        return toVersionEntry(displayTool, result, "dockerhub", "auto");
      }
      // Custom-built: no registry in image name. Resolve from config (override) or from container label (auto).
      // Dockerfile: LABEL io.server-lens.base-image="owner/image" so we can probe that image for latest_version.
      const baseImage =
        config.container_base_images?.[d.name] ??
        (d.container_name ? await getContainerBaseImageFromLabels(d.container_name) : null);
      if (baseImage) {
        const probe = createProbe("dockerhub", githubToken);
        if (probe) {
          const result = await probe.run({
            image: baseImage,
            tag_filter: String.raw`^\d+\.\d+(\.\d+)?$`,
          });
          return toVersionEntry(
            displayTool,
            result,
            "dockerhub",
            "auto",
            `https://hub.docker.com/r/${baseImage}`
          );
        }
      }
      return toVersionEntry(
        displayTool,
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
    })(); // end probe IIFE
    onProbeComplete?.(_entry, Math.round(performance.now() - _t0));
    return _entry;
  });

  return runConcurrent(tasks, concurrency);
}
