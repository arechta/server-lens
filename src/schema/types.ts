/** Core data types — public contract. See @docs/data-schema.md */

export type ToolCategory =
  | "os"
  | "apt"
  | "snap"
  | "runtime"
  | "tools"
  | "container"
  | "systemd"
  | "pm2";

export type UpdateType =
  | "major"
  | "minor"
  | "patch"
  | "unknown"
  | "none"
  | "null";

export type ToolStatus = "registered" | "auto" | "untracked";

export type ProbeStatus =
  | "success"
  | "failed"
  | "timeout"
  | "rate_limited"
  | "skipped";

export type ProbeType =
  | "apt"
  | "github"
  | "npm"
  | "node"
  | "dockerhub"
  | "ghcr"
  | "snap"
  | "binary"
  | "script"
  | null;

export interface VersionEntry {
  name: string;
  display_name: string;
  category: ToolCategory;
  tool_status: ToolStatus;
  current_version: string | null;
  latest_version: string | null;
  is_outdated: boolean;
  update_type: UpdateType;
  latest_release_date: string | null;
  probe_type: ProbeType;
  probe_status: ProbeStatus;
  probe_source: string | null;
  probe_error: string | null;
  repo_url: string | null;
  release_notes: string | null;
  release_notes_source: string | null;
  last_checked_at: string;
  first_seen_at: string;
}

export interface SnapshotSummary {
  schema_version: string;
  scanned_at: string;
  hostname: string;
  summary: {
    total: number;
    outdated: number;
    untracked: number;
    probe_failed: number;
    by_update_type: Record<UpdateType, number>;
    by_category: Record<ToolCategory, number>;
  };
  tools: VersionEntry[];
}
