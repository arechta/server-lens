/**
 * Multi-step container version detection for Docker containers.
 * Works with any container; exec step is only for configured or built-in commands.
 *
 * Steps (in order):
 * 1. Container labels — org.opencontainers.image.version
 * 2. Image labels — same label from the image used by the container
 * 3. Docker exec — optional command (e.g. n8n --version) from config or built-in map
 * 4. Image tag — from docker ps (handled by caller when this returns null)
 * 5. Image digest (fallback) — short image ID so it can be compared with upstream
 */

import { getRandomUserAgent } from "../utils/user-agent";

const VERSION_LABEL = "org.opencontainers.image.version";
const BASE_IMAGE_LABEL = "io.server-lens.base-image"; // Dockerfile: LABEL io.server-lens.base-image="owner/image" for custom builds
const DIGEST_SHORT_LEN = 19; // sha256: + 12 chars

export interface ContainerVersionOptions {
  /** Optional: exec command to run inside container (e.g. "n8n --version"). No shell wrapper. */
  execCommand?: string;
  /** If true, when no version is found return short image digest as last resort (for upstream comparison). */
  fallbackToDigest?: boolean;
}

/**
 * Get current version of a running container using multiple fallbacks.
 * Returns null if no version could be determined (unless fallbackToDigest is true).
 */
export async function getContainerCurrentVersion(
  containerName: string,
  options?: ContainerVersionOptions
): Promise<string | null> {
  if (!containerName) return null;

  let v: string | null = null;

  v = await getVersionFromContainerLabels(containerName);
  if (v) return normalizeVersion(v);

  v = await getVersionFromImageLabels(containerName);
  if (v) return normalizeVersion(v);

  if (options?.execCommand) {
    v = await getVersionFromExec(containerName, options.execCommand);
    if (v) return normalizeVersion(extractVersionFromOutput(v));
  }

  if (options?.fallbackToDigest) {
    v = await getContainerImageDigestShort(containerName);
    if (v) return v;
  }

  return null;
}

/**
 * Get base image (e.g. redis/redisinsight) from container/image labels for auto-resolve of custom-built images.
 * Set in Dockerfile: LABEL io.server-lens.base-image="owner/image"
 * Returns null if not set.
 */
export async function getContainerBaseImageFromLabels(containerName: string): Promise<string | null> {
  if (!containerName) return null;
  const readLabel = async (target: string, label: string): Promise<string | null> => {
    try {
      const proc = Bun.spawn(
        ["docker", "inspect", target, "--format", `{{index .Config.Labels "${label}"}}`],
        { stdout: "pipe", stderr: "pipe" }
      );
      const out = await new Response(proc.stdout).text();
      await proc.exited;
      const v = out.trim();
      return v && !v.startsWith("<no value>") ? v : null;
    } catch {
      return null;
    }
  };
  let v = await readLabel(containerName, BASE_IMAGE_LABEL);
  if (v) return v;
  try {
    const procId = Bun.spawn(
      ["docker", "inspect", containerName, "--format", "{{.Image}}"],
      { stdout: "pipe", stderr: "pipe" }
    );
    const idOut = await new Response(procId.stdout).text();
    await procId.exited;
    const imageId = idOut.trim();
    if (imageId) v = await readLabel(imageId, BASE_IMAGE_LABEL);
  } catch {
    // ignore
  }
  return v || null;
}

/**
 * Get short image digest for a running container (e.g. sha256:abc123456789).
 * Use for fallback when no version label/exec is available; can be compared with upstream digest.
 */
export async function getContainerImageDigestShort(containerName: string): Promise<string | null> {
  try {
    const proc = Bun.spawn(
      ["docker", "inspect", containerName, "--format", "{{.Image}}"],
      { stdout: "pipe", stderr: "pipe" }
    );
    const out = await new Response(proc.stdout).text();
    await proc.exited;
    const id = out.trim();
    if (!id || !id.startsWith("sha256:")) return null;
    return id.slice(0, DIGEST_SHORT_LEN);
  } catch {
    return null;
  }
}

function normalizeVersion(s: string): string {
  const t = s.trim().replace(/^v/, "");
  return t || s;
}

/** Extract first x.y.z or x.y from exec output (e.g. "Redis server v=7.2.4 sha=..." -> "7.2.4"). */
function extractVersionFromOutput(output: string): string {
  const m = output.match(/\d+\.\d+(?:\.\d+)?/);
  return m ? m[0]! : output;
}

/**
 * Get the registry repo digest (e.g. sha256:abc...) for the image used by a container.
 * Uses RepoDigests from `docker image inspect` so it can be matched against registry tag digests.
 * Returns null if the image has no RepoDigests (e.g. locally built).
 */
export async function getContainerImageRepoDigest(containerName: string): Promise<string | null> {
  try {
    const procImage = Bun.spawn(
      ["docker", "inspect", containerName, "--format", "{{.Config.Image}}"],
      { stdout: "pipe", stderr: "pipe" }
    );
    const imageRef = (await new Response(procImage.stdout).text()).trim();
    await procImage.exited;
    if (!imageRef) return null;

    const procDigest = Bun.spawn(
      ["docker", "image", "inspect", imageRef, "--format", "{{index .RepoDigests 0}}"],
      { stdout: "pipe", stderr: "pipe" }
    );
    const repoDigestLine = (await new Response(procDigest.stdout).text()).trim();
    await procDigest.exited;
    if (!repoDigestLine || repoDigestLine.startsWith("<no value>")) return null;
    const at = repoDigestLine.indexOf("@");
    if (at === -1) return null;
    const digest = repoDigestLine.slice(at + 1);
    return digest.startsWith("sha256:") ? digest : null;
  } catch {
    return null;
  }
}

interface DockerHubTagResult {
  name: string;
  digest?: string;
  [key: string]: unknown;
}

interface DockerHubTagsResponse {
  results?: DockerHubTagResult[];
  next?: string;
}

/**
 * Resolve a Docker Hub image tag name by matching local image digest to registry tags.
 * Fetches tags from Docker Hub API (paginated), finds tag(s) with matching digest, returns the best (prefer semver-like).
 * Useful when the container uses tag "latest" so we can show the actual version (e.g. 1.49.0).
 */
export async function getVersionByDigestFromDockerHub(
  image: string,
  digest: string
): Promise<string | null> {
  if (!image || !digest.startsWith("sha256:")) return null;
  const parts = image.split("/");
  const namespace = parts.length >= 2 ? parts[0]! : "library";
  const repository = parts.length >= 2 ? parts[1]! : image;
  let url: string | null = `https://hub.docker.com/v2/repositories/${namespace}/${repository}/tags?page_size=100`;
  const matchingTags: string[] = [];
  const ua = getRandomUserAgent();

  while (url) {
    const res = await fetch(url, { headers: { "User-Agent": ua } });
    if (!res.ok) return null;
    const data = (await res.json()) as DockerHubTagsResponse;
    for (const tag of data.results ?? []) {
      const matches =
        (tag.digest && tag.digest === digest) ||
        (tag as { images?: Array<{ digest?: string }> }).images?.some((img) => img.digest === digest);
      if (matches) matchingTags.push(tag.name);
    }
    url = data.next ?? null;
  }

  if (matchingTags.length === 0) return null;
  const versionTags = matchingTags.filter((t) => t !== "latest" && /\d/.test(t));
  const toSort = versionTags.length > 0 ? versionTags : matchingTags;
  toSort.sort((a, b) => {
    const aParts = a.split(".").map(Number);
    const bParts = b.split(".").map(Number);
    for (let i = 0; i < Math.max(aParts.length, bParts.length); i++) {
      const diff = (aParts[i] ?? 0) - (bParts[i] ?? 0);
      if (diff !== 0) return diff;
    }
    return b.length - a.length;
  });
  return toSort[toSort.length - 1] ?? null;
}

/**
 * Get the digest for a specific tag from Docker Hub (for digest comparison).
 * Returns the digest (sha256:...) for that tag or null.
 */
export async function getDigestForTagFromDockerHub(
  image: string,
  tag: string
): Promise<string | null> {
  if (!image || !tag) return null;
  const parts = image.split("/");
  const namespace = parts.length >= 2 ? parts[0]! : "library";
  const repository = parts.length >= 2 ? parts[1]! : image;
  let url: string | null = `https://hub.docker.com/v2/repositories/${namespace}/${repository}/tags?page_size=100`;
  const ua = getRandomUserAgent();
  while (url) {
    const res = await fetch(url, { headers: { "User-Agent": ua } });
    if (!res.ok) return null;
    const data = (await res.json()) as DockerHubTagsResponse;
    for (const t of data.results ?? []) {
      if (t.name === tag) {
        const d = t.digest ?? (t as { images?: Array<{ digest?: string }> }).images?.[0]?.digest;
        return d?.startsWith("sha256:") ? d : null;
      }
    }
    url = data.next ?? null;
  }
  return null;
}

async function getVersionFromContainerLabels(containerName: string): Promise<string | null> {
  try {
    const proc = Bun.spawn(
      ["docker", "inspect", containerName, "--format", `{{index .Config.Labels "${VERSION_LABEL}"}}`],
      { stdout: "pipe", stderr: "pipe" }
    );
    const out = await new Response(proc.stdout).text();
    await proc.exited;
    const v = out.trim();
    return v && !v.startsWith("<no value>") ? v : null;
  } catch {
    return null;
  }
}

async function getVersionFromImageLabels(containerName: string): Promise<string | null> {
  try {
    const procId = Bun.spawn(
      ["docker", "inspect", containerName, "--format", "{{.Image}}"],
      { stdout: "pipe", stderr: "pipe" }
    );
    const idOut = await new Response(procId.stdout).text();
    await procId.exited;
    const imageId = idOut.trim();
    if (!imageId) return null;

    const procLabel = Bun.spawn(
      ["docker", "inspect", imageId, "--format", `{{index .Config.Labels "${VERSION_LABEL}"}}`],
      { stdout: "pipe", stderr: "pipe" }
    );
    const out = await new Response(procLabel.stdout).text();
    await procLabel.exited;
    const v = out.trim();
    return v && !v.startsWith("<no value>") ? v : null;
  } catch {
    return null;
  }
}

async function getVersionFromExec(containerName: string, execCommand: string): Promise<string | null> {
  try {
    const parts = execCommand.trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return null;
    const proc = Bun.spawn(
      ["docker", "exec", containerName, ...parts],
      { stdout: "pipe", stderr: "pipe" }
    );
    const out = await new Response(proc.stdout).text();
    await proc.exited;
    if (proc.exitCode !== 0) return null;
    const v = out.trim();
    return v || null;
  } catch {
    return null;
  }
}
