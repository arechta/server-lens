import React, { useState } from "react";
import { Box, Text, useApp } from "ink";
import { useTheme } from "../theme-context";
import { Header } from "../components/Header";
import { CategoryGroup } from "../components/CategoryGroup";
import { AlertBar } from "../components/AlertBar";
import { useKeyInput } from "../hooks/useKeyInput";
import type { SnapshotSummary, VersionEntry } from "../../schema/types";
import type { AlertItem } from "../components/AlertBar";

interface DashboardScreenProps {
  snapshot: SnapshotSummary | null;
  tools: VersionEntry[];
  filterOutdated?: boolean;
  filterCategory?: string | null;
  systemAlerts?: AlertItem[];
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

// Category display order
const CATEGORY_ORDER = ["os", "runtime", "tools", "container", "systemd", "pm2", "snap", "apt"];

function sortedCategories(groups: Map<string, VersionEntry[]>): string[] {
  const keys = [...groups.keys()];
  return keys.sort((a, b) => {
    const ia = CATEGORY_ORDER.indexOf(a);
    const ib = CATEGORY_ORDER.indexOf(b);
    if (ia === -1 && ib === -1) return a.localeCompare(b);
    if (ia === -1) return 1;
    if (ib === -1) return -1;
    return ia - ib;
  });
}

export function DashboardScreen({
  snapshot,
  tools,
  filterOutdated = false,
  filterCategory = null,
  systemAlerts = [],
}: DashboardScreenProps) {
  const theme = useTheme();
  const { exit } = useApp();
  const [aptExpanded, setAptExpanded] = useState(false);

  // Responsive: compact when terminal < 80 cols
  const cols = process.stdout.columns ?? 80;
  const compact = cols < 80;

  useKeyInput({
    onQuit: () => exit(),
    onKey: (key) => {
      if (key === "a") setAptExpanded((v) => !v);
    },
  });

  const groups = groupByCategory(tools);
  const categories = sortedCategories(groups);

  return (
    <Box flexDirection="column" padding={1}>
      <Header
        snapshot={snapshot}
        filterOutdated={filterOutdated}
        filterCategory={filterCategory}
      />

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
          {categories.map((category) => {
            const items = groups.get(category)!;
            const isApt = category === "apt";
            return (
              <CategoryGroup
                key={category}
                category={category}
                tools={items}
                collapsed={isApt ? !aptExpanded : undefined}
                compact={compact}
              />
            );
          })}
        </Box>
      )}

      <AlertBar alerts={systemAlerts} />

      {groups.size > 0 && (
        <Box marginTop={1}>
          <Text color={theme.muted} dimColor>q: quit  a: toggle apt</Text>
        </Box>
      )}
    </Box>
  );
}
