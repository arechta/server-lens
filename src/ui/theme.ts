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

export function getTheme(name: string = "claude"): Theme {
  return themes[name] ?? themes.claude;
}
