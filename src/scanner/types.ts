/** Scanner output — discovered tools before probe enrichment */

import type { ToolCategory } from "../schema/types";

export type ScannerSource =
  | "apt"
  | "snap"
  | "nvm"
  | "bun"
  | "npm"
  | "pnpm"
  | "docker"
  | "pm2"
  | "systemd"
  | "binary";

export interface DiscoveredTool {
  name: string;
  display_name: string;
  current_version: string | null;
  category: ToolCategory;
  source: ScannerSource;
  /** For apt: package name. For docker: image. */
  source_key?: string;
}

export interface Scanner {
  readonly source: ScannerSource;
  scan(): Promise<DiscoveredTool[]>;
}
