/**
 * Config loader — parses server-lens.toml
 * Config is read-only at runtime. Never written by the tool.
 */

import { parse } from "@iarna/toml";
import { readFileSync, existsSync } from "fs";
import { join } from "path";

export interface SettingsConfig {
  scan_schedule: string;
  scan_timeout_seconds?: number;
  disk_warning_threshold_pct?: number;
  ignored_tools?: string[];
  /** Category names to hide in display (e.g. "tools"). Data still in DB and --json. */
  hidden_categories?: string[];
}

export interface ThemeConfig {
  name: "claude" | "claude-blue" | "custom";
  [key: string]: string | undefined;
}

export interface ProbeDefinition {
  name: string;
  probe_type: string;
  category: string;
  repo_url?: string;
  args?: Record<string, string>;
  [key: string]: unknown;
}

export interface AuthConfig {
  github_token?: string;
}

export interface WebhooksConfig {
  [eventName: string]: string;
}

export interface ApiConfig {
  host: string;
  port: number;
  token?: string;
}

export interface McpConfig {
  enabled?: boolean;
}

/** Map container name (as in docker ps) to base image for version check. Use for custom-built images whose Dockerfile FROM is the real upstream. */
export interface ContainerBaseImagesConfig {
  [containerName: string]: string; // e.g. "n8n-n8n" -> "n8nio/n8n"
}

/** Map container name to exec command to get running version (e.g. "n8n" -> "n8n --version"). Used when labels are missing. */
export interface ContainerVersionCommandsConfig {
  [containerName: string]: string; // e.g. "n8n" -> "n8n --version"
}

/** Group name -> list of container names (from same compose). Display as "group/name" e.g. mailu/oletools. */
export interface ContainerGroupsConfig {
  [groupName: string]: string[]; // e.g. mailu = ["admin", "dovecot", "oletools", ...]
}

export interface Config {
  settings: SettingsConfig;
  theme?: ThemeConfig;
  auth?: AuthConfig;
  webhooks?: WebhooksConfig;
  api?: ApiConfig;
  mcp?: McpConfig;
  probes?: ProbeDefinition[];
  /** Base image (Docker Hub repo) per container name — for custom builds, probe this image for latest version. */
  container_base_images?: ContainerBaseImagesConfig;
  /** Exec command per container name to detect current version (e.g. "n8n" -> "n8n --version"). */
  container_version_commands?: ContainerVersionCommandsConfig;
  /** Group label for display (e.g. mailu -> ["admin", "dovecot"] so UI shows mailu/admin, mailu/oletools). */
  container_groups?: ContainerGroupsConfig;
  dbPath: string;
  configPath: string;
}

const DEFAULT_SETTINGS: SettingsConfig = {
  scan_schedule: "0 */6 * * *",
  scan_timeout_seconds: 30,
  disk_warning_threshold_pct: 20,
  ignored_tools: [],
  hidden_categories: [],
};

function findConfigPath(): string {
  // Explicit override via env var
  const envPath = process.env.SERVER_LENS_CONFIG;
  if (envPath) return envPath;
  // Production system install takes priority over CWD (avoids dev repo TOML shadowing /etc config)
  const etc = "/etc/server-lens/server-lens.toml";
  if (existsSync(etc)) return etc;
  // Local dev fallback
  const cwd = process.cwd();
  const local = join(cwd, "server-lens.toml");
  return local; // Default even if missing — will throw on load
}

function getDbPath(configPath: string): string {
  const cwd = process.cwd();
  const isLocal = configPath.includes(cwd) || !configPath.startsWith("/");
  if (isLocal) {
    return join(cwd, "server-lens.db");
  }
  return "/var/lib/server-lens/server-lens.db";
}

export function loadConfig(): Config {
  const configPath = findConfigPath();

  if (!existsSync(configPath)) {
    return {
      settings: DEFAULT_SETTINGS,
      dbPath: getDbPath(configPath),
      configPath,
    };
  }

  const raw = readFileSync(configPath, "utf-8");
  const parsed = parse(raw) as Record<string, unknown>;

  const settings = {
    ...DEFAULT_SETTINGS,
    ...(parsed.settings as Partial<SettingsConfig>),
  };

  const probes = (parsed.probes as ProbeDefinition[] | undefined) ?? [];
  const theme = parsed.theme as ThemeConfig | undefined;
  const auth = parsed.auth as AuthConfig | undefined;
  const webhooks = (parsed.webhooks as WebhooksConfig | undefined) ?? {};
  const api = parsed.api as ApiConfig | undefined;
  const mcp = parsed.mcp as McpConfig | undefined;
  const container_base_images = (parsed.container_base_images as ContainerBaseImagesConfig | undefined) ?? {};
  const container_version_commands = (parsed.container_version_commands as ContainerVersionCommandsConfig | undefined) ?? {};
  const container_groups = (parsed.container_groups as ContainerGroupsConfig | undefined) ?? {};

  return {
    settings,
    theme,
    auth,
    webhooks,
    api: api ?? { host: "127.0.0.1", port: 7845 },
    mcp: mcp ?? { enabled: true },
    probes,
    container_base_images,
    container_version_commands,
    container_groups,
    dbPath: getDbPath(configPath),
    configPath,
  };
}
