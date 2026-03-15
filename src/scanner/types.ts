/** Scanner output — discovered tools before probe enrichment */

import type { ToolCategory } from "../schema/types";

export type ScannerSource =
  | "apt"
  | "snap"
  | "nvm"
  | "fnm"
  | "bun"
  | "npm"
  | "pnpm"
  | "docker"
  | "pm2"
  | "systemd"
  | "binary"
  | "node";

export interface DiscoveredTool {
  name: string;
  display_name: string;
  current_version: string | null;
  category: ToolCategory;
  source: ScannerSource;
  /** For apt: package name. For docker: full image ref (e.g. n8nio/n8n:latest). */
  source_key?: string;
  /** For docker containers: container name from docker ps (e.g. n8n) for version detection. */
  container_name?: string;
}

export interface Scanner {
  readonly source: ScannerSource;
  scan(): Promise<DiscoveredTool[]>;
}
