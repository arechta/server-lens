import React from "react";
import { Box, Text } from "ink";
import { useTheme } from "../theme-context";

export interface AlertItem {
  id: number;
  event: string;
  timestamp: string;
  /** Human-readable reason/details from event payload */
  message?: string;
  /** Formatted time for timeline (e.g. YYYY-MM-DD HH:mm) */
  timeLabel?: string;
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

const TIME_COLUMN_WIDTH = 17; // "YYYY-MM-DD HH:mm"

/** Format ISO timestamp to short date+time for timeline (left column) */
function formatTimeLabel(iso: string): string {
  try {
    const d = new Date(iso);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    const h = String(d.getHours()).padStart(2, "0");
    const min = String(d.getMinutes()).padStart(2, "0");
    return `${y}-${m}-${day} ${h}:${min}`;
  } catch {
    return iso.slice(0, 16).replace("T", " ");
  }
}

/** GitLens-style timeline: timestamp left, vertical branch line + node, then event + details */
export function AlertBar({ alerts }: AlertBarProps) {
  const theme = useTheme();
  if (alerts.length === 0) return null;

  return (
    <Box flexDirection="column" marginTop={1}>
      <Text color={theme.border}>{"─".repeat(50)}</Text>
      {alerts.map((alert, index) => {
        const timeStr = alert.timeLabel ?? (alert.timestamp ? formatTimeLabel(alert.timestamp) : "");
        const timePadded = timeStr.padEnd(TIME_COLUMN_WIDTH);
        const hasMessage = Boolean(alert.message);
        const color = alertColor(alert.event, theme);
        const symbol = alertSymbol(alert.event);
        return (
          <Box key={alert.id} flexDirection="column">
            {/* Event row: [timestamp] ● symbol event */}
            <Box>
              <Text color={theme.muted} dimColor>{timePadded}</Text>
              <Text color={theme.accent}> ● </Text>
              <Text color={color}>{symbol} </Text>
              <Text>{alert.event}</Text>
            </Box>
            {/* Detail row: [space] │  message */}
            {hasMessage && (
              <Box>
                <Text color={theme.muted}>{" ".repeat(TIME_COLUMN_WIDTH)}</Text>
                <Text color={theme.muted}> │  </Text>
                <Text color={theme.muted}>{alert.message}</Text>
              </Box>
            )}
            {/* Connector line to next node (except after last) */}
            {index < alerts.length - 1 && (
              <Box>
                <Text color={theme.muted}>{" ".repeat(TIME_COLUMN_WIDTH)}</Text>
                <Text color={theme.muted} dimColor> │</Text>
              </Box>
            )}
          </Box>
        );
      })}
    </Box>
  );
}
