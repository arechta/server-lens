/** Theme tokens — see @docs/ui-design.md */

export interface Theme {
  accent: string;
  accentDim: string;
  success: string;
  warning: string;
  error: string;
  info: string;
  heading: string;
  muted: string;
  border: string;
  bgHighlight: string;
}

export const themes: Record<string, Theme> = {
  claude: {
    accent: "#DA7756",
    accentDim: "#A85A3E",
    success: "#4CAF7D",
    warning: "#E8C84A",
    error: "#E05C5C",
    info: "#8B9BB4",
    heading: "#FFFFFF",
    muted: "#5A6478",
    border: "#2A3142",
    bgHighlight: "#1E2433",
  },
  "claude-blue": {
    accent: "#4A9EDB",
    accentDim: "#2E6FA3",
    success: "#4CAF7D",
    warning: "#E8C84A",
    error: "#E05C5C",
    info: "#8B9BB4",
    heading: "#FFFFFF",
    muted: "#5A6478",
    border: "#2A3142",
    bgHighlight: "#1A2535",
  },
};

/** Resolve a theme by name, merging TOML custom token overrides when name is "custom" */
export function getTheme(name: string = "claude", customTokens?: Record<string, string | undefined>): Theme {
  if (name === "custom" && customTokens) {
    const base = themes.claude;
    return {
      accent:      customTokens["accent"]       ?? base.accent,
      accentDim:   customTokens["accent-dim"]   ?? base.accentDim,
      success:     customTokens["success"]      ?? base.success,
      warning:     customTokens["warning"]      ?? base.warning,
      error:       customTokens["error"]        ?? base.error,
      info:        customTokens["info"]         ?? base.info,
      heading:     customTokens["heading"]      ?? base.heading,
      muted:       customTokens["muted"]        ?? base.muted,
      border:      customTokens["border"]       ?? base.border,
      bgHighlight: customTokens["bg-highlight"] ?? base.bgHighlight,
    };
  }
  return themes[name] ?? themes.claude;
}
