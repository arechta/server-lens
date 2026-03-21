import React, { useEffect } from "react";
import { Box, Text, useApp } from "ink";
import { useTheme } from "../theme-context";

export interface EventItem {
  id: number;
  event: string;
  severity: string;
  timestamp: string;
  tool_name: string | null;
  data_json: string;
}

interface EventsScreenProps {
  events: EventItem[];
  filter?: {
    event?: string;
    toolName?: string;
    since?: string;
  };
}

function severityColor(severity: string, theme: ReturnType<typeof useTheme>): string {
  switch (severity) {
    case "error":   return theme.error;
    case "warning": return theme.warning;
    default:        return theme.muted;
  }
}

export function EventsScreen({ events, filter }: EventsScreenProps) {
  const theme = useTheme();
  const { exit } = useApp();

  useEffect(() => { exit(); }, []);

  return (
    <Box flexDirection="column" padding={1}>
      <Box borderStyle="single" borderColor={theme.accent} paddingX={1}>
        <Text color={theme.heading} bold>server-lens events</Text>
        {filter?.event && <Text color={theme.muted}> — event: {filter.event}</Text>}
        {filter?.toolName && <Text color={theme.muted}> — tool: {filter.toolName}</Text>}
        {filter?.since && <Text color={theme.muted}> — since: {filter.since.slice(0, 10)}</Text>}
        <Text color={theme.muted}> ({events.length})</Text>
      </Box>

      {events.length === 0 ? (
        <Box marginTop={1} paddingLeft={1}>
          <Text color={theme.muted}>No events found.</Text>
        </Box>
      ) : (
        <Box flexDirection="column" marginTop={1} paddingLeft={1}>
          {events.map((e) => {
            let extra = "";
            try {
              const data = JSON.parse(e.data_json) as Record<string, unknown>;
              extra = Object.entries(data)
                .filter(([k]) => !["name", "category"].includes(k))
                .slice(0, 3)
                .map(([k, v]) => `${k}=${String(v)}`)
                .join(" ");
            } catch {/* ignore */}

            return (
              <Box key={e.id}>
                <Text color={theme.muted}>{e.timestamp.slice(0, 19)}</Text>
                <Text>  </Text>
                <Text color={severityColor(e.severity, theme)}>[{e.severity.slice(0, 4)}]</Text>
                <Text>  {e.event}</Text>
                {e.tool_name && <Text color={theme.muted}>  {e.tool_name}</Text>}
                {extra && <Text color={theme.muted}>  {extra}</Text>}
              </Box>
            );
          })}
        </Box>
      )}
    </Box>
  );
}
