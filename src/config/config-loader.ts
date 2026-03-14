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

export interface Config {
  settings: SettingsConfig;
  theme?: ThemeConfig;
  auth?: AuthConfig;
  webhooks?: WebhooksConfig;
  api?: ApiConfig;
  mcp?: McpConfig;
  probes?: ProbeDefinition[];
  dbPath: string;
  configPath: string;
}

const DEFAULT_SETTINGS: SettingsConfig = {
  scan_schedule: "0 */6 * * *",
  scan_timeout_seconds: 30,
  disk_warning_threshold_pct: 20,
  ignored_tools: [],
};

function findConfigPath(): string {
  const cwd = process.cwd();
  const local = join(cwd, "server-lens.toml");
  if (existsSync(local)) return local;
  // Production paths (Linux)
  const etc = "/etc/server-lens/server-lens.toml";
  if (existsSync(etc)) return etc;
  return local; // Default to local even if missing — will throw on load
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

  return {
    settings,
    theme,
    auth,
    webhooks,
    api: api ?? { host: "127.0.0.1", port: 7845 },
    mcp: mcp ?? { enabled: true },
    probes,
    dbPath: getDbPath(configPath),
    configPath,
  };
}
