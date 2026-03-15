import type { Probe, ProbeArgs, ProbeResult } from "./probe-types";
import { getRandomUserAgent } from "../utils/user-agent";

interface GhcrTokenResponse {
  token?: string;
}

interface GhcrTagsResponse {
  tags?: string[];
  name?: string;
}

interface GhcrManifestConfig {
  digest?: string;
  mediaType?: string;
  size?: number;
}

interface GhcrManifest {
  schemaVersion?: number;
  config?: GhcrManifestConfig;
  layers?: unknown[];
  manifests?: Array<{ digest: string; platform?: { architecture: string; os: string } }>;
  mediaType?: string;
  annotations?: Record<string, string>;
}

interface GhcrImageConfig {
  created?: string;
  architecture?: string;
  [key: string]: unknown;
}

const GHCR_BASE = "https://ghcr.io";

/** Parse Link header and return absolute URL for rel="next" if present. */
function parseLinkNext(linkHeader: string | null, baseUrl: string): string | null {
  if (!linkHeader) return null;
  const parts = linkHeader.split(",");
  for (const part of parts) {
    const match = part.trim().match(/<([^>]+)>;\s*rel="next"/);
    if (!match) continue;
    const raw = match[1].trim();
    try {
      return new URL(raw, `${baseUrl}/`).href;
    } catch {
      return null;
    }
  }
  return null;
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

/** Fetch image config blob and return 'created' date (ISO string) if present. */
async function fetchGhcrImageCreated(
  owner: string,
  image: string,
  tag: string,
  authHeader: string | undefined
): Promise<string | null> {
  const headers: Record<string, string> = {
    Accept:
      "application/vnd.oci.image.manifest.v1+json, application/vnd.docker.distribution.manifest.v2+json, application/vnd.docker.distribution.manifest.list.v2+json",
  };
  if (authHeader) headers.Authorization = authHeader;
  const manifestUrl = `${GHCR_BASE}/v2/${owner}/${image}/manifests/${tag}`;
  let res = await fetch(manifestUrl, { headers });
  if (!res.ok) return null;
  const manifest = (await res.json()) as GhcrManifest;
  const fromAnnotations = (m: GhcrManifest) =>
    m.annotations?.["org.opencontainers.image.created"] ?? null;
  let createdFromManifest = fromAnnotations(manifest);
  let configDigest: string | undefined = manifest.config?.digest;
  if (!configDigest && manifest.manifests?.length) {
    const first = manifest.manifests.find(
      (m) =>
        m.platform?.architecture === "amd64" && m.platform?.os === "linux"
    ) ?? manifest.manifests[0];
    const subUrl = `${GHCR_BASE}/v2/${owner}/${image}/manifests/${first.digest}`;
    res = await fetch(subUrl, {
      headers: {
        Accept:
          "application/vnd.oci.image.manifest.v1+json, application/vnd.docker.distribution.manifest.v2+json",
        "User-Agent": getRandomUserAgent(),
        ...(authHeader && { Authorization: authHeader }),
      },
    });
    if (!res.ok) return null;
    const subManifest = (await res.json()) as GhcrManifest;
    configDigest = subManifest.config?.digest;
    if (!createdFromManifest) createdFromManifest = fromAnnotations(subManifest);
  }
  if (createdFromManifest) return createdFromManifest;
  if (!configDigest) return null;
  const blobUrl = `${GHCR_BASE}/v2/${owner}/${image}/blobs/${configDigest}`;
  const blobRes = await fetch(blobUrl, {
    headers: {
      "User-Agent": getRandomUserAgent(),
      ...(authHeader ? { Authorization: authHeader } : {}),
    },
  });
  if (!blobRes.ok) return null;
  const config = (await blobRes.json()) as GhcrImageConfig;
  return config.created ?? null;
}

/** Fallback: get release date from GitHub Releases API when registry config has no "created". */
async function fetchGhcrReleaseDateFromGitHub(
  owner: string,
  repo: string,
  tag: string,
  githubToken?: string
): Promise<string | null> {
  const url = `https://api.github.com/repos/${owner}/${repo}/releases/tags/${tag}`;
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "User-Agent": getRandomUserAgent(),
  };
  if (githubToken) headers.Authorization = `Bearer ${githubToken}`;
  const res = await fetch(url, { headers });
  if (!res.ok) return null;
  const data = (await res.json()) as { published_at?: string };
  return data.published_at ?? null;
}

/** Get the manifest digest for a tag (for digest comparison). Returns Docker-Content-Digest value or null. */
export async function getGhcrManifestDigest(
  owner: string,
  image: string,
  tag: string,
  githubToken?: string
): Promise<string | null> {
  let authHeader: string | undefined;
  if (githubToken) {
    const scope = `repository:${owner}/${image}:pull`;
    const credentials = Buffer.from(`oauth:${githubToken}`).toString("base64");
    const tokenRes = await fetch(
      `https://ghcr.io/token?service=ghcr.io&scope=${encodeURIComponent(scope)}`,
      {
        headers: {
          Authorization: `Basic ${credentials}`,
          "User-Agent": getRandomUserAgent(),
        },
      }
    );
    if (!tokenRes.ok) return null;
    const tokenData = (await tokenRes.json()) as GhcrTokenResponse;
    if (tokenData.token) authHeader = `Bearer ${tokenData.token}`;
  }
  const url = `${GHCR_BASE}/v2/${owner}/${image}/manifests/${tag}`;
  const headers: Record<string, string> = {
    Accept: "application/vnd.docker.distribution.manifest.v2+json, application/vnd.oci.image.manifest.v1+json",
    "User-Agent": getRandomUserAgent(),
  };
  if (authHeader) headers.Authorization = authHeader;
  const res = await fetch(url, { headers });
  if (!res.ok) return null;
  const digest =
    res.headers.get("docker-content-digest") ??
    res.headers.get("Docker-Content-Digest");
  return digest?.startsWith("sha256:") ? digest : null;
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

    /** Fetch all tags from tags/list, following Link next pagination. */
    const fetchAllTags = async (
      initialUrl: string,
      authHeader?: string
    ): Promise<string[]> => {
      const allTags: string[] = [];
      let url: string | null = initialUrl;
      const headers: Record<string, string> = {
        "User-Agent": getRandomUserAgent(),
        ...(authHeader ? { Authorization: authHeader } : {}),
      };
      while (url) {
        const res = await fetch(url, { headers });
        if (!res.ok) return allTags;
        const data = (await res.json()) as GhcrTagsResponse;
        const pageTags = data.tags ?? [];
        allTags.push(...pageTags);
        url = parseLinkNext(res.headers.get("Link"), GHCR_BASE);
      }
      return allTags;
    };

    // Try anonymous first for public images (no token needed if GHCR allows)
    const tryAnonymous = async (): Promise<ProbeResult | null> => {
      const tags = await fetchAllTags(tagsUrl);
      if (tags.length === 0) return null;
      const latest = findLatestVersionTag(tags, tagFilter);
      if (!latest) return null;
      let created: string | null = null;
      try {
        created = await fetchGhcrImageCreated(owner, image, latest, undefined);
      } catch {
        // ignore; release date stays null for anonymous
      }
      return {
        latest_version: latest,
        latest_release_date: created,
        repo_url: `https://github.com/${owner}`,
        probe_source: tagsUrl,
        probe_status: "success",
        error_message: null,
      };
    };

    const anonymousResult = await tryAnonymous();
    if (anonymousResult) {
      if (this.token && anonymousResult.latest_version) {
        try {
          const credentials = Buffer.from(`oauth:${this.token}`).toString("base64");
          const tokenRes = await fetch(
            `https://ghcr.io/token?service=ghcr.io&scope=${encodeURIComponent(scope)}`,
            {
              headers: {
                Authorization: `Basic ${credentials}`,
                "User-Agent": getRandomUserAgent(),
              },
            }
          );
          if (tokenRes.ok) {
            const tokenData = (await tokenRes.json()) as GhcrTokenResponse;
            const registryToken = tokenData.token;
            if (registryToken) {
              let created = await fetchGhcrImageCreated(
                owner,
                image,
                anonymousResult.latest_version,
                `Bearer ${registryToken}`
              );
              if (!created && this.token)
                created = await fetchGhcrReleaseDateFromGitHub(
                  owner,
                  image,
                  anonymousResult.latest_version,
                  this.token
                );
              if (created) return { ...anonymousResult, latest_release_date: created };
            }
          }
        } catch {
          // ignore; keep anonymous result without date
        }
      }
      return anonymousResult;
    }

    if (!this.token) {
      return {
        latest_version: null,
        latest_release_date: null,
        repo_url: `https://github.com/${owner}`,
        probe_source: tagsUrl,
        probe_status: "failed",
        error_message: "GHCR requires github_token in [auth] for private packages, or use Docker Hub probe for public images",
      };
    }

    try {
      const credentials = Buffer.from(`oauth:${this.token}`).toString("base64");
      const tokenRes = await fetch(
        `https://ghcr.io/token?service=ghcr.io&scope=${encodeURIComponent(scope)}`,
        {
          headers: {
            Authorization: `Basic ${credentials}`,
            "User-Agent": getRandomUserAgent(),
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

      const tags = await fetchAllTags(
        tagsUrl,
        `Bearer ${registryToken}`
      );

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

      let created: string | null = null;
      try {
        created = await fetchGhcrImageCreated(
          owner,
          image,
          latest,
          `Bearer ${registryToken}`
        );
        if (!created && this.token)
          created = await fetchGhcrReleaseDateFromGitHub(owner, image, latest, this.token);
      } catch {
        // optional; keep latest_release_date null on failure
      }

      return {
        latest_version: latest,
        latest_release_date: created,
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
