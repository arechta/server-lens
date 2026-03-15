import type { Probe, ProbeArgs, ProbeResult } from "./probe-types";
import { getRandomUserAgent } from "../utils/user-agent";

interface GithubRelease {
  tag_name: string;
  published_at: string | null;
  html_url?: string;
  body?: string | null;
}

export class GithubProbe implements Probe {
  constructor(private token?: string) {}

  async run(args: ProbeArgs): Promise<ProbeResult> {
    const owner = args.owner;
    const repo = args.repo;
    const tagPrefix = args.tag_prefix ?? "";

    const apiUrl = `https://api.github.com/repos/${owner}/${repo}/releases/latest`;
    if (!owner || !repo) {
      return {
        latest_version: null,
        latest_release_date: null,
        repo_url: null,
        probe_source: apiUrl,
        probe_status: "failed",
        error_message: "args.owner and args.repo required",
      };
    }

    const headers: Record<string, string> = {
      Accept: "application/vnd.github.v3+json",
      "User-Agent": getRandomUserAgent(),
    };
    if (this.token) {
      headers.Authorization = `Bearer ${this.token}`;
    }

    try {
      const res = await fetch(
        `https://api.github.com/repos/${owner}/${repo}/releases/latest`,
        { headers }
      );

      if (res.status === 404) {
        return {
          latest_version: null,
          latest_release_date: null,
          repo_url: `https://github.com/${owner}/${repo}`,
          probe_source: apiUrl,
          probe_status: "failed",
          error_message: "No releases found",
        };
      }

      if (res.status === 403 && res.headers.get("x-ratelimit-remaining") === "0") {
        return {
          latest_version: null,
          latest_release_date: null,
          repo_url: null,
          probe_source: apiUrl,
          probe_status: "rate_limited",
          error_message: "GitHub API rate limit exceeded",
        };
      }

      if (!res.ok) {
        return {
          latest_version: null,
          latest_release_date: null,
          repo_url: null,
          probe_source: apiUrl,
          probe_status: "failed",
          error_message: `HTTP ${res.status}`,
        };
      }

      const data = (await res.json()) as GithubRelease;
      let version = data.tag_name ?? "";
      if (tagPrefix && version.startsWith(tagPrefix)) {
        version = version.slice(tagPrefix.length);
      }

      const withNotes = args._with_notes === "true";
      const notes = withNotes && data.body ? data.body.slice(0, 4000) : null;

      return {
        latest_version: version || null,
        latest_release_date: data.published_at ?? null,
        repo_url: data.html_url ?? `https://github.com/${owner}/${repo}`,
        probe_source: apiUrl,
        probe_status: "success",
        error_message: null,
        release_notes: notes,
        release_notes_source: notes ? "github-release" : null,
      };
    } catch (e) {
      return {
        latest_version: null,
        latest_release_date: null,
        repo_url: null,
        probe_source: apiUrl,
        probe_status: "failed",
        error_message: String(e),
      };
    }
  }
}
