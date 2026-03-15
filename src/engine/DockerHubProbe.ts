import type { Probe, ProbeArgs, ProbeResult } from "./probe-types";
import { getRandomUserAgent } from "../utils/user-agent";
import { debugLog } from "../utils/debug-log";

/**
 * Per-scan in-flight cache: if multiple containers use the same image (e.g. 9 redis pools),
 * only one fetch is made — the rest wait on the same Promise and reuse the result.
 */
const _tagFetchCache = new Map<string, Promise<DockerHubTag[] | string>>();

/** Call between scans to prevent stale cache across multiple scan runs. */
export function clearDockerHubTagCache(): void {
  _tagFetchCache.clear();
}

interface DockerHubTag {
  name: string;
  last_updated?: string;
}

interface DockerHubResponse {
  results?: DockerHubTag[];
  next?: string;
}

function parseImage(image: string): { namespace: string; repository: string } {
  if (!image.includes("/")) {
    return { namespace: "library", repository: image };
  }
  const [namespace, repository] = image.split("/", 2);
  return { namespace: namespace!, repository: repository! };
}

function findLatestVersionTag(
  tags: DockerHubTag[],
  tagFilter?: string
): DockerHubTag | null {
  const regex = tagFilter ? new RegExp(tagFilter) : /^\d+\.\d+\.\d+$/;
  const versionTags = tags
    .filter((t) => regex.test(t.name) && t.name !== "latest")
    .sort((a, b) => {
      const va = a.name.split(".").map(Number);
      const vb = b.name.split(".").map(Number);
      for (let i = 0; i < Math.max(va.length, vb.length); i++) {
        const diff = (va[i] ?? 0) - (vb[i] ?? 0);
        if (diff !== 0) return diff;
      }
      return 0;
    });
  return versionTags[versionTags.length - 1] ?? null;
}

export class DockerHubProbe implements Probe {
  async run(args: ProbeArgs): Promise<ProbeResult> {
    const image = args.image;
    const tagFilter = args.tag_filter;
    const apiUrl = image
      ? `https://hub.docker.com/v2/repositories/${image}/tags`
      : "";

    if (!image) {
      return {
        latest_version: null,
        latest_release_date: null,
        repo_url: null,
        probe_source: apiUrl,
        probe_status: "failed",
        error_message: "args.image required",
      };
    }

    const { namespace, repository } = parseImage(image);
    const url = `https://hub.docker.com/v2/repositories/${namespace}/${repository}/tags?page_size=100`;

    try {
      // Deduplicate concurrent fetches for the same image (e.g. 9 redis pool containers)
      if (!_tagFetchCache.has(url)) {
        debugLog(`DockerHubProbe: fetching tags for ${image}`);
        const ua = getRandomUserAgent();
        const fetchPromise: Promise<DockerHubTag[] | string> = (async () => {
          const allTags: DockerHubTag[] = [];
          let next: string | null = url;
          while (next) {
            const res = await fetch(next, { headers: { "User-Agent": ua } });
            debugLog(`DockerHubProbe: ${res.status} ${next}`);
            if (!res.ok) return `HTTP ${res.status}`;
            const data = (await res.json()) as DockerHubResponse;
            allTags.push(...(data.results ?? []));
            next = data.next ?? null;
          }
          return allTags;
        })();
        _tagFetchCache.set(url, fetchPromise);
      }

      const tagsOrError = await _tagFetchCache.get(url)!;
      if (typeof tagsOrError === "string") {
        return {
          latest_version: null,
          latest_release_date: null,
          repo_url: `https://hub.docker.com/r/${image}`,
          probe_source: url,
          probe_status: "failed",
          error_message: tagsOrError,
        };
      }

      const latest = findLatestVersionTag(tagsOrError, tagFilter);
      if (!latest) {
        debugLog(`DockerHubProbe: no matching tag for ${image} with filter=${tagFilter}`);
        return {
          latest_version: null,
          latest_release_date: null,
          repo_url: `https://hub.docker.com/r/${image}`,
          probe_source: url,
          probe_status: "failed",
          error_message: "No version tag found (use tag_filter?)",
        };
      }

      return {
        latest_version: latest.name,
        latest_release_date: latest.last_updated ?? null,
        repo_url: `https://hub.docker.com/r/${image}`,
        probe_source: url,
        probe_status: "success",
        error_message: null,
      };
    } catch (e) {
      return {
        latest_version: null,
        latest_release_date: null,
        repo_url: null,
        probe_source: url,
        probe_status: "failed",
        error_message: String(e),
      };
    }
  }
}
