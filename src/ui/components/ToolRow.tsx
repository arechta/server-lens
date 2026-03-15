import React from "react";
import { Box, Text } from "ink";
import { useTheme } from "../theme-context";
import type { VersionEntry, UpdateType } from "../../schema/types";

interface ToolRowProps {
  tool: VersionEntry;
  /** When true, hide probe source and date columns */
  compact?: boolean;
}

function getUpdateColor(updateType: UpdateType, theme: ReturnType<typeof useTheme>): string {
  switch (updateType) {
    case "major":   return theme.error;
    case "minor":
    case "patch":   return theme.warning;
    case "none":    return theme.success;
    case "unknown": return theme.info;
    default:        return theme.muted;
  }
}

function getUpdateSymbol(tool: VersionEntry): string {
  if (tool.is_outdated) {
    return tool.update_type === "major" ? "⚑" : "→";
  }
  if (tool.update_type === "none") return "✓";
  return "?";
}

function getUpdateLabel(updateType: UpdateType): string {
  switch (updateType) {
    case "major":   return "MAJOR";
    case "minor":   return "minor";
    case "patch":   return "patch";
    case "unknown": return "?ver";
    case "none":    return "✓";
    default:        return "–";
  }
}

function truncate(s: string | null, len: number): string {
  if (!s) return "–".padEnd(len);
  if (s.length > len) return s.slice(0, len - 1) + "…";
  return s.padEnd(len);
}

export function ToolRow({ tool, compact = false }: ToolRowProps) {
  const theme = useTheme();
  const color = getUpdateColor(tool.update_type, theme);
  const symbol = getUpdateSymbol(tool);
  const label = getUpdateLabel(tool.update_type);

  return (
    <Box>
      <Text>{truncate(tool.display_name ?? tool.name, 20)}</Text>
      <Text> {truncate(tool.current_version, 10)}</Text>
      <Text color={color}> {symbol} </Text>
      <Text>{truncate(tool.latest_version, 10)}</Text>
      <Text color={color}> {label.padEnd(7)}</Text>
      {!compact && (
        <>
          <Text color={theme.muted}> {truncate(tool.probe_type, 10)}</Text>
          <Text color={theme.muted}>
            {" "}
            {tool.latest_release_date
              ? tool.latest_release_date.slice(0, 10)
              : "–".padEnd(10)}
          </Text>
        </>
      )}
    </Box>
  );
}
