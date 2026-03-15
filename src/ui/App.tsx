import React from "react";
import { Box } from "ink";
import { ThemeProvider } from "./theme-context";
import { getTheme } from "./theme";
import { DashboardScreen } from "./screens/DashboardScreen";
import { StatusScreen } from "./screens/StatusScreen";
import { EventsScreen } from "./screens/EventsScreen";
import { NotesScreen } from "./screens/NotesScreen";
import { ScanScreen } from "./screens/ScanScreen";
import type { SnapshotSummary, VersionEntry } from "../schema/types";
import type { AlertItem } from "./components/AlertBar";
import type { StatusData } from "./screens/StatusScreen";
import type { EventItem } from "./screens/EventsScreen";

export type AppScreen = "dashboard" | "status" | "events" | "notes" | "scan";

interface AppProps {
  screen?: AppScreen;
  // dashboard
  snapshot?: SnapshotSummary | null;
  tools?: VersionEntry[];
  filterOutdated?: boolean;
  filterCategory?: string | null;
  systemAlerts?: AlertItem[];
  recentScans?: Array<{ id: number; scanned_at: string; hostname: string; total_tools: number }>;
  // status
  statusData?: StatusData | null;
  // events
  eventsData?: EventItem[];
  eventsFilter?: { event?: string; toolName?: string; since?: string };
  // notes
  toolName?: string;
  notesTool?: VersionEntry | null;
  // scan
  scanPhase?: "scanning" | "done" | "error";
  scanCurrentTool?: string;
  scanTotalProbed?: number;
  scanDryRun?: boolean;
  scanErrorMsg?: string;
  // theme
  themeName?: string;
  themeTokens?: Record<string, string | undefined>;
}

export function App({
  screen = "dashboard",
  snapshot = null,
  tools = [],
  filterOutdated = false,
  filterCategory = null,
  systemAlerts = [],
  recentScans = [],
  statusData = null,
  eventsData = [],
  eventsFilter,
  toolName = "",
  notesTool = null,
  scanPhase = "scanning",
  scanCurrentTool = "",
  scanTotalProbed = 0,
  scanDryRun = false,
  scanErrorMsg,
  themeName = "claude",
  themeTokens,
}: AppProps) {
  const theme = getTheme(themeName, themeTokens);

  return (
    <ThemeProvider theme={theme}>
      <Box flexDirection="column">
        {screen === "dashboard" && (
          <DashboardScreen
            snapshot={snapshot}
            tools={tools}
            filterOutdated={filterOutdated}
            filterCategory={filterCategory}
            systemAlerts={systemAlerts}
            recentScans={recentScans}
          />
        )}
        {screen === "status" && <StatusScreen data={statusData} />}
        {screen === "events" && (
          <EventsScreen events={eventsData ?? []} filter={eventsFilter} />
        )}
        {screen === "notes" && (
          <NotesScreen toolName={toolName} tool={notesTool ?? null} />
        )}
        {screen === "scan" && (
          <ScanScreen
            phase={scanPhase}
            currentTool={scanCurrentTool}
            totalProbed={scanTotalProbed}
            dryRun={scanDryRun}
            errorMsg={scanErrorMsg}
          />
        )}
      </Box>
    </ThemeProvider>
  );
}
