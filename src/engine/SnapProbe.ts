import type { Probe, ProbeArgs, ProbeResult } from "./probe-types";
import { getRandomUserAgent } from "../utils/user-agent";

const SNAP_API_BASE = "https://api.snapcraft.io/v2";
/** Max response body size to avoid exhausting memory on huge channel-map responses */
const MAX_RESPONSE_BYTES = 2 * 1024 * 1024; // 2 MiB

interface SnapChannelObj {
  architecture?: string;
  name?: string;
  risk?: string;
  "released-at"?: string;
  track?: string;
  [key: string]: unknown;
}

interface SnapChannelMapEntry {
  channel?: string | SnapChannelObj;
  version?: string;
  "revision"?: number;
  "released-at"?: string;
  "created-at"?: string;
  when?: string;
  [key: string]: unknown;
}

function channelRisk(ch: string | SnapChannelObj | undefined): string {
  if (typeof ch === "string") return "";
  if (ch && typeof ch === "object") {
    const risk = (ch as SnapChannelObj).risk;
    return typeof risk === "string" ? risk : "";
  }
  return "";
}

function channelArch(ch: string | SnapChannelObj | undefined): string {
  if (typeof ch === "string") return "";
  if (ch && typeof ch === "object") {
    const arch = (ch as SnapChannelObj).architecture;
    return typeof arch === "string" ? arch : "";
  }
  return "";
}

function channelReleasedAt(ch: string | SnapChannelObj | undefined): string | null {
  if (typeof ch === "string") return null;
  if (ch && typeof ch === "object") {
    const at = (ch as SnapChannelObj)["released-at"];
    return typeof at === "string" ? at : null;
  }
  return null;
}

interface SnapInfoResponse {
  "channel-map"?: SnapChannelMapEntry[];
  [key: string]: unknown;
}

function snapArch(): string {
  const a = process.arch;
  if (a === "x64") return "amd64";
  if (a === "arm64") return "arm64";
  if (a === "arm") return "armhf";
  return "amd64";
}

/**
 * Fetch latest version for a snap from the Snap Store API (api.snapcraft.io v2).
 * Uses stable channel version when available.
 */
export class SnapProbe implements Probe {
  async run(args: ProbeArgs): Promise<ProbeResult> {
    const name = args.package ?? args.name ?? "";
    if (!name.trim()) {
      return {
        latest_version: null,
        latest_release_date: null,
        repo_url: null,
        probe_source: SNAP_API_BASE,
        probe_status: "failed",
        error_message: "args.package or args.name required",
      };
    }

    const url = `${SNAP_API_BASE}/snaps/info/${encodeURIComponent(name.trim())}`;
    const headers: Record<string, string> = {
      "Snap-Device-Series": "16",
      "Snap-Device-Architecture": snapArch(),
      "User-Agent": getRandomUserAgent(),
    };

    try {
      const res = await fetch(url, { headers });
      if (!res.ok) {
        return {
          latest_version: null,
          latest_release_date: null,
          repo_url: `https://snapcraft.io/${name}`,
          probe_source: url,
          probe_status: "failed",
          error_message: `HTTP ${res.status}`,
        };
      }

      const buf = await res.arrayBuffer();
      if (buf.byteLength > MAX_RESPONSE_BYTES) {
        return {
          latest_version: null,
          latest_release_date: null,
          repo_url: `https://snapcraft.io/${name}`,
          probe_source: url,
          probe_status: "failed",
          error_message: `Response too large (${buf.byteLength} bytes, max ${MAX_RESPONSE_BYTES})`,
        };
      }

      const data = JSON.parse(new TextDecoder().decode(buf)) as SnapInfoResponse;
      const channelMap = data["channel-map"] ?? [];
      const arch = snapArch();
      // First match: stable channel for current architecture only (stops early, no full scan)
      const entry = channelMap.find(
        (e) => channelRisk(e.channel) === "stable" && channelArch(e.channel) === arch
      ) ?? channelMap.find((e) => channelRisk(e.channel) === "stable") ?? channelMap[0];

      const version = entry?.version ?? null;
      const releasedAt =
        (entry && channelReleasedAt(entry.channel)) ??
        entry?.["released-at"] ??
        entry?.["created-at"] ??
        entry?.when ??
        null;

      return {
        latest_version: version,
        latest_release_date: releasedAt ?? null,
        repo_url: `https://snapcraft.io/${name}`,
        probe_source: url,
        probe_status: version ? "success" : "failed",
        error_message: version ? null : "No version in channel-map",
      };
    } catch (e) {
      return {
        latest_version: null,
        latest_release_date: null,
        repo_url: `https://snapcraft.io/${name}`,
        probe_source: url,
        probe_status: "failed",
        error_message: String(e),
      };
    }
  }
}
