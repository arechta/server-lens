import React from "react";
import { Box, Text } from "ink";
import { useTheme } from "../theme-context";

export interface AlertItem {
  id: number;
  event: string;
  timestamp: string;
  message?: string;
}

interface AlertBarProps {
  alerts: AlertItem[];
}

function alertSymbol(event: string): string {
  if (event.includes("reboot")) return "⚠";
  if (event.includes("disk")) return "⚠";
  if (event.includes("degraded")) return "✗";
  return "⚠";
}

function alertColor(event: string, theme: ReturnType<typeof useTheme>): string {
  if (event.includes("degraded")) return theme.error;
  return theme.warning;
}

export function AlertBar({ alerts }: AlertBarProps) {
  const theme = useTheme();
  if (alerts.length === 0) return null;

  return (
    <Box flexDirection="column" marginTop={1}>
      <Text color={theme.border}>{"─".repeat(50)}</Text>
      {alerts.map((alert) => (
        <Box key={alert.id}>
          <Text color={alertColor(alert.event, theme)}>{alertSymbol(alert.event)} </Text>
          <Text>{alert.event}</Text>
          {alert.message && <Text color={theme.muted}> — {alert.message}</Text>}
        </Box>
      ))}
    </Box>
  );
}
