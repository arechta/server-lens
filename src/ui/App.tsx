import React from "react";
import { Box } from "ink";
import { ThemeProvider } from "./theme-context";
import { getTheme } from "./theme";
import { DashboardScreen } from "./screens/DashboardScreen";
import type { SnapshotSummary, VersionEntry } from "../schema/types";

interface AppProps {
  snapshot?: SnapshotSummary | null;
  tools?: VersionEntry[];
  themeName?: "claude" | "claude-blue";
  filterOutdated?: boolean;
  filterCategory?: string | null;
}

export function App({
  snapshot = null,
  tools = [],
  themeName = "claude",
  filterOutdated = false,
  filterCategory = null,
}: AppProps) {
  const theme = getTheme(themeName);

  return (
    <ThemeProvider theme={theme}>
      <Box flexDirection="column">
        <DashboardScreen
          snapshot={snapshot}
          tools={tools}
          filterOutdated={filterOutdated}
          filterCategory={filterCategory}
        />
      </Box>
    </ThemeProvider>
  );
}
