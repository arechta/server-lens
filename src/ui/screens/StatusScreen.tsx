import React, { useEffect } from "react";
import { Box, Text, useApp } from "ink";
import { useTheme } from "../theme-context";

export interface StatusData {
  lastScan: {
    scanned_at: string;
    total_tools: number;
    outdated: number;
    probe_failed: number;
    scan_status: string;
  };
  nextScan: string;
  webhooksOk: number;
  webhooksTotal: number;
  systemAlerts: Array<{ id: number; event: string; timestamp: string }>;
  recentEvents: Array<{ id: number; event: string; timestamp: string; tool_name: string | null; severity: string }>;
}

interface StatusScreenProps {
  data: StatusData | null;
}

export function StatusScreen({ data }: StatusScreenProps) {
  const theme = useTheme();
  const { exit } = useApp();

  useEffect(() => { exit(); }, []);

  if (!data) {
    return (
      <Box padding={1}>
        <Text color={theme.muted}>No scan data yet. Run: server-lens scan --now</Text>
      </Box>
    );
  }

  const { lastScan, nextScan, webhooksOk, webhooksTotal, systemAlerts, recentEvents } = data;
  const scanTime = new Date(lastScan.scanned_at).toLocaleString();
  const statusColor = lastScan.scan_status === "completed" ? theme.success : theme.warning;

  return (
    <Box flexDirection="column" padding={1}>
      <Box borderStyle="single" borderColor={theme.accent} paddingX={1}>
        <Text color={theme.heading} bold>server-lens status</Text>
      </Box>

      <Box flexDirection="column" marginTop={1} paddingLeft={2}>
        <Box>
          <Text color={theme.muted}>Last scan:    </Text>
          <Text>{scanTime}</Text>
          <Text color={statusColor}> ({lastScan.scan_status})</Text>
          <Text color={theme.muted}> — {lastScan.total_tools} tools</Text>
        </Box>
        <Box>
          <Text color={theme.muted}>Next scan:    </Text>
          <Text>{nextScan}</Text>
        </Box>
        <Box>
          <Text color={theme.muted}>Outdated:     </Text>
          <Text color={lastScan.outdated > 0 ? theme.warning : theme.success}>
            {lastScan.outdated} tools
          </Text>
        </Box>
        <Box>
          <Text color={theme.muted}>Probe issues: </Text>
          <Text color={lastScan.probe_failed > 0 ? theme.error : theme.success}>
            {lastScan.probe_failed} failed
          </Text>
        </Box>
        {webhooksTotal > 0 && (
          <Box>
            <Text color={theme.muted}>Webhooks:     </Text>
            <Text color={webhooksOk === webhooksTotal ? theme.success : theme.warning}>
              {webhooksOk}/{webhooksTotal} delivered
            </Text>
          </Box>
        )}
        {systemAlerts.length > 0 && (
          <Box marginTop={1} flexDirection="column">
            {systemAlerts.map((a) => (
              <Box key={a.id}>
                <Text color={theme.warning}>⚠ </Text>
                <Text>{a.event}</Text>
              </Box>
            ))}
          </Box>
        )}
      </Box>

      {recentEvents.length > 0 && (
        <Box flexDirection="column" marginTop={1} paddingLeft={2}>
          <Text color={theme.accent} bold>Recent events</Text>
          <Text color={theme.border}>{"─".repeat(50)}</Text>
          {recentEvents.map((e) => (
            <Box key={e.id}>
              <Text color={theme.muted}>{e.timestamp.slice(0, 19)}  </Text>
              <Text color={e.severity === "warning" ? theme.warning : theme.muted}>
                [{e.severity.slice(0, 4)}]
              </Text>
              <Text>  {e.event}</Text>
              {e.tool_name && <Text color={theme.muted}>  {e.tool_name}</Text>}
            </Box>
          ))}
        </Box>
      )}
    </Box>
  );
}
