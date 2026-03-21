import React from "react";
import { Box, Text } from "ink";
import { useTheme } from "../theme-context";
import { SummaryBar } from "./summary-bar";
import type { SnapshotSummary } from "../../schema/types";

/** Logo area: visual 1:1 aspect-square. Height must fit Recent scans (title + 5 rows) + Summary. */
const LOGO_HEIGHT_LINES = 18;
const LOGO_WIDTH_CHARS = LOGO_HEIGHT_LINES * 2;
const APP_NAME = "server-lens";
const MAINTAINER = "arechta.dev <Asphira Andreas>";
const SUMMARY_NAME_WIDTH = 12;

/**
 * Box with a mixed-color title in the top border, Claude Code style:
 *   ┌─ server-lens v0.1.0 ─────────────┐
 *   │                                   │
 *   └───────────────────────────────────┘
 *
 * Ink v4 has no native borderLabel — we draw the top line manually as Text,
 * then use borderTop={false} on the Box so borders connect seamlessly.
 */
function LogoBox({
  version,
  theme,
  children,
}: {
  version: string;
  theme: ReturnType<typeof useTheme>;
  children: React.ReactNode;
}) {
  // ┌─ <APP_NAME> <version> ─...─┐
  // Fixed chars: ┌(1) + ─·(2) + name + ·version·(2+ver.len) + ┐(1)
  const titleFixed = 1 + 2 + APP_NAME.length + 1 + version.length + 1 + 1;
  const trailingDashes = "─".repeat(Math.max(0, LOGO_WIDTH_CHARS - titleFixed));

  return (
    <Box flexDirection="column" width={LOGO_WIDTH_CHARS} minWidth={LOGO_WIDTH_CHARS}>
      {/* Manual top border — mixed accent + muted colors */}
      <Text>
        <Text color={theme.accent}>{"┌─ "}</Text>
        <Text color={theme.accent} bold>{APP_NAME}</Text>
        <Text color={theme.muted}>{` ${version} `}</Text>
        <Text color={theme.accent}>{trailingDashes}{"┐"}</Text>
      </Text>
      {/* Body: borderTop=false so left/right/bottom connect to the manual line above */}
      <Box
        width={LOGO_WIDTH_CHARS}
        height={LOGO_HEIGHT_LINES - 1}
        borderStyle="single"
        borderTop={false}
        borderColor={theme.accent}
        flexDirection="column"
        justifyContent="center"
        alignItems="center"
        paddingX={0}
        paddingY={0}
      >
        {children}
      </Box>
    </Box>
  );
}

export interface RecentScanItem {
  id: number;
  scanned_at: string;
  hostname: string;
  total_tools: number;
}

interface HeaderProps {
  snapshot: SnapshotSummary | null;
  filterOutdated?: boolean;
  filterCategory?: string | null;
  version?: string;
  recentScans?: RecentScanItem[];
}

function formatScanTimeShort(iso: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: "numeric",
      day: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  } catch {
    return iso.slice(0, 19).replace("T", " ");
  }
}

export function Header({
  snapshot,
  filterOutdated = false,
  filterCategory = null,
  version = "v0.1.0",
  recentScans = [],
}: HeaderProps) {
  const theme = useTheme();

  return (
    <Box flexDirection="row" paddingX={0} paddingY={0} gap={1}>
      {/* Left: logo box with mixed-color title in border */}
      <LogoBox version={version} theme={theme}>
        <Text color={theme.muted} dimColor>◼</Text>
      </LogoBox>
      {/* Right: 2 rows, fixed height so it matches logo — both align, logo stays square */}
      <Box flexDirection="column" flexGrow={0} height={LOGO_HEIGHT_LINES} minHeight={LOGO_HEIGHT_LINES}>
        {/* Row 1: Recent scans */}
        <Box
          flexDirection="column"
          borderStyle="single"
          borderColor={theme.accent}
          paddingX={1}
          paddingY={0}
          flexGrow={1}
        >
          <Text color={theme.accent} bold>Recent activity</Text>
          {recentScans.length === 0 ? (
            <Text color={theme.muted}>  No activity yet</Text>
          ) : (
            recentScans.map((s) => (
              <Text key={s.id} color={theme.muted}>
                {" "}
                {formatScanTimeShort(s.scanned_at)}  #{s.id} — {s.total_tools} tools
              </Text>
            ))
          )}
        </Box>
        {/* Row 2: Summary — marginTop -1 so top border merges with Recent scans bottom */}
        <Box
          flexDirection="column"
          borderStyle="single"
          borderColor={theme.accent}
          paddingX={1}
          paddingY={0}
          flexGrow={1}
        >
          <Text color={theme.accent} bold>Summary</Text>
          <Box flexDirection="column" marginTop={0}>
            {snapshot && (
              <Text color={theme.muted}>
                {" "}{"Tools".padEnd(SUMMARY_NAME_WIDTH)}{snapshot.summary.total}
              </Text>
            )}
            {snapshot && snapshot.summary.outdated > 0 && (
              <Box>
                <Text color={theme.muted}> {"Updates".padEnd(SUMMARY_NAME_WIDTH)}</Text>
                <SummaryBar summary={snapshot.summary} />
              </Box>
            )}
            {snapshot && snapshot.summary.outdated === 0 && (
              <Text color={theme.success}>
                {" "}{"Updates".padEnd(SUMMARY_NAME_WIDTH)}✓ all up to date
              </Text>
            )}
            {filterOutdated && (
              <Text color={theme.accent}>
                {" "}{"Filter".padEnd(SUMMARY_NAME_WIDTH)}[outdated only]
              </Text>
            )}
            {filterCategory && (
              <Text color={theme.accent}>
                {" "}{"Filter".padEnd(SUMMARY_NAME_WIDTH)}[category: {filterCategory}]
              </Text>
            )}
            <Text color={theme.muted} dimColor>
              {" "}{"Maintainer".padEnd(SUMMARY_NAME_WIDTH)}{MAINTAINER}
            </Text>
          </Box>
        </Box>
      </Box>
    </Box>
  );
}
