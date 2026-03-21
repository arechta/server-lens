import type { Probe, ProbeArgs, ProbeResult } from "../engine/probe-types";
import { getRandomUserAgent } from "../utils/user-agent";
import { debugLog } from "../utils/debug-log";

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
      debugLog(`GithubProbe → GET ${apiUrl} (token: ${this.token ? `yes (${this.token.slice(0, 8)}…)` : "no"})`);
      const res = await fetch(
        `https://api.github.com/repos/${owner}/${repo}/releases/latest`,
        { headers }
      );
      debugLog(`GithubProbe ← ${res.status} ${owner}/${repo}`);

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

      if (res.status === 401) {
        const hint = this.token
          ? "token present but rejected — token may be expired, revoked, or malformed. Regenerate at github.com/settings/tokens and update [auth] github_token in server-lens.toml"
          : "no token — add github_token under [auth] in server-lens.toml";
        debugLog(`GithubProbe 401 for ${owner}/${repo}: ${hint}`);
        return {
          latest_version: null,
          latest_release_date: null,
          repo_url: null,
          probe_source: apiUrl,
          probe_status: "failed",
          error_message: `HTTP 401 — ${hint}`,
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

      if (res.status === 403) {
        const hint = this.token
          ? "HTTP 403 — token present but lacks repo scope, or repo is private. Ensure token has 'public_repo' or 'repo' scope."
          : "HTTP 403 — add github_token under [auth] in server-lens.toml";
        debugLog(`GithubProbe 403 for ${owner}/${repo}: ${hint}`);
        return {
          latest_version: null,
          latest_release_date: null,
          repo_url: null,
          probe_source: apiUrl,
          probe_status: "failed",
          error_message: hint,
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
