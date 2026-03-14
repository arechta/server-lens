import React from "react";
import { Box, Text } from "ink";
import { useTheme } from "../theme-context";
import type { SnapshotSummary, VersionEntry } from "../../schema/types";

interface DashboardScreenProps {
  snapshot: SnapshotSummary | null;
  tools: VersionEntry[];
  filterOutdated?: boolean;
  filterCategory?: string | null;
}

function getUpdateSymbol(updateType: VersionEntry["update_type"]): string {
  switch (updateType) {
    case "major":
      return "⚑";
    case "minor":
    case "patch":
      return "→";
    case "none":
      return "✓";
    case "null":
    case "unknown":
      return "?";
    default:
      return "–";
  }
}

function getUpdateLabel(updateType: VersionEntry["update_type"]): string {
  switch (updateType) {
    case "major":
      return "MAJOR";
    case "minor":
      return "minor";
    case "patch":
      return "patch";
    case "unknown":
      return "?ver";
    case "none":
      return "✓";
    case "null":
      return "–";
    default:
      return "–";
  }
}

function groupByCategory(tools: VersionEntry[]): Map<string, VersionEntry[]> {
  const map = new Map<string, VersionEntry[]>();
  for (const t of tools) {
    const list = map.get(t.category) ?? [];
    list.push(t);
    map.set(t.category, list);
  }
  for (const list of map.values()) {
    list.sort((a, b) => a.name.localeCompare(b.name));
  }
  return map;
}

export function DashboardScreen({
  snapshot,
  tools,
}: DashboardScreenProps) {
  const theme = useTheme();
  const groups = groupByCategory(tools);

  return (
    <Box flexDirection="column" padding={1}>
      <Box borderStyle="single" borderColor={theme.accent} paddingX={1}>
        <Text color={theme.heading} bold>
          server-lens
        </Text>
        <Text color={theme.muted}> v0.1.0</Text>
        {snapshot && (
          <>
            <Text color={theme.muted}>
              {"  •  "}
              {snapshot.hostname}
            </Text>
            <Text color={theme.muted}>
              {"  •  Last scan: "}
              {new Date(snapshot.scanned_at).toLocaleString()}
            </Text>
            <Text color={theme.muted}>
              {"  •  "}
              {snapshot.summary.total} tools
            </Text>
            {snapshot.summary.outdated > 0 && (
              <Text color={theme.warning}>
                {"  •  "}
                {snapshot.summary.outdated} outdated
              </Text>
            )}
          </>
        )}
      </Box>

      {!snapshot ? (
        <Box marginTop={1}>
          <Text color={theme.muted}>
            No scan data found. Run: server-lens scan --now
          </Text>
        </Box>
      ) : groups.size === 0 ? (
        <Box marginTop={1}>
          <Text color={theme.muted}>No tools match the current filters.</Text>
        </Box>
      ) : (
        <Box flexDirection="column" marginTop={1}>
          {Array.from(groups.entries()).map(([category, items]) => (
            <Box key={category} flexDirection="column" marginBottom={1}>
              <Text color={theme.accent} bold>
                {category.toUpperCase()}
              </Text>
              <Text color={theme.border}>────────────────────────────────</Text>
              {items.map((tool) => {
                const symbol = getUpdateSymbol(tool.update_type);
                const label = getUpdateLabel(tool.update_type);
                const symbolColor =
                  tool.update_type === "major"
                    ? theme.error
                    : tool.update_type === "none" || tool.update_type === "null"
                      ? tool.update_type === "none"
                        ? theme.success
                        : theme.muted
                      : theme.warning;

                return (
                  <Box key={tool.name}>
                    <Text>{tool.name.padEnd(18)}</Text>
                    <Text>
                      {(tool.current_version ?? "–").padEnd(10)}
                    </Text>
                    <Text color={symbolColor}>
                      {tool.is_outdated ? "→" : "✓"}
                    </Text>
                    <Text>
                      {" "}
                      {(tool.latest_version ?? "–").padEnd(10)}
                    </Text>
                    <Text color={symbolColor}>
                      {" "}
                      {label.padEnd(7)}
                    </Text>
                    <Text color={theme.muted}>
                      {" "}
                      {(tool.probe_type ?? "–").padEnd(10)}
                    </Text>
                    <Text color={theme.muted}>
                      {" "}
                      {tool.latest_release_date
                        ? new Date(tool.latest_release_date).toISOString().slice(0, 10)
                        : "–"}
                    </Text>
                  </Box>
                );
              })}
            </Box>
          ))}
        </Box>
      )}
    </Box>
  );
}
