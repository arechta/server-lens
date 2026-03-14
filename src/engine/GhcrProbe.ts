import type { Probe, ProbeArgs, ProbeResult } from "./probe-types";

interface GhcrTokenResponse {
  token?: string;
}

interface GhcrTagsResponse {
  tags?: string[];
  name?: string;
}

function findLatestVersionTag(tags: string[], tagFilter?: string): string | null {
  const regex = tagFilter ? new RegExp(tagFilter) : /^\d+\.\d+\.\d+$/;
  const versionTags = tags
    .filter((t) => regex.test(t) && t !== "latest")
    .sort((a, b) => {
      const va = a.split(".").map(Number);
      const vb = b.split(".").map(Number);
      for (let i = 0; i < Math.max(va.length, vb.length); i++) {
        const diff = (va[i] ?? 0) - (vb[i] ?? 0);
        if (diff !== 0) return diff;
      }
      return 0;
    });
  return versionTags[versionTags.length - 1] ?? null;
}

export class GhcrProbe implements Probe {
  constructor(private token?: string) {}

  async run(args: ProbeArgs): Promise<ProbeResult> {
    const owner = args.owner;
    const image = args.image;
    const tagFilter = args.tag_filter;

    const scope = owner && image ? `repository:${owner}/${image}:pull` : "";
    const tagsUrl = owner && image
      ? `https://ghcr.io/v2/${owner}/${image}/tags/list`
      : "";

    if (!owner || !image) {
      return {
        latest_version: null,
        latest_release_date: null,
        repo_url: null,
        probe_source: tagsUrl,
        probe_status: "failed",
        error_message: "args.owner and args.image required",
      };
    }

    if (!this.token) {
      return {
        latest_version: null,
        latest_release_date: null,
        repo_url: `https://github.com/${owner}`,
        probe_source: tagsUrl,
        probe_status: "failed",
        error_message: "GHCR requires github_token in [auth]",
      };
    }

    try {
      const credentials = Buffer.from(`oauth:${this.token}`).toString("base64");
      const tokenRes = await fetch(
        `https://ghcr.io/token?service=ghcr.io&scope=${encodeURIComponent(scope)}`,
        {
          headers: {
            Authorization: `Basic ${credentials}`,
          },
        }
      );

      if (!tokenRes.ok) {
        return {
          latest_version: null,
          latest_release_date: null,
          repo_url: `https://github.com/${owner}`,
          probe_source: tagsUrl,
          probe_status: "failed",
          error_message: `Token request failed: HTTP ${tokenRes.status}`,
        };
      }

      const tokenData = (await tokenRes.json()) as GhcrTokenResponse;
      const registryToken = tokenData.token;

      if (!registryToken) {
        return {
          latest_version: null,
          latest_release_date: null,
          repo_url: `https://github.com/${owner}`,
          probe_source: tagsUrl,
          probe_status: "failed",
          error_message: "No token in GHCR response",
        };
      }

      const tagsRes = await fetch(tagsUrl, {
        headers: {
          Authorization: `Bearer ${registryToken}`,
        },
      });

      if (!tagsRes.ok) {
        return {
          latest_version: null,
          latest_release_date: null,
          repo_url: `https://github.com/${owner}`,
          probe_source: tagsUrl,
          probe_status: "failed",
          error_message: `Tags request failed: HTTP ${tagsRes.status}`,
        };
      }

      const tagsData = (await tagsRes.json()) as GhcrTagsResponse;
      const tags = tagsData.tags ?? [];
      const latest = findLatestVersionTag(tags, tagFilter);

      if (!latest) {
        return {
          latest_version: null,
          latest_release_date: null,
          repo_url: `https://github.com/${owner}`,
          probe_source: tagsUrl,
          probe_status: "failed",
          error_message: "No version tag found (use tag_filter?)",
        };
      }

      return {
        latest_version: latest,
        latest_release_date: null,
        repo_url: `https://github.com/${owner}`,
        probe_source: tagsUrl,
        probe_status: "success",
        error_message: null,
      };
    } catch (e) {
      return {
        latest_version: null,
        latest_release_date: null,
        repo_url: null,
        probe_source: tagsUrl,
        probe_status: "failed",
        error_message: String(e),
      };
    }
  }
}
