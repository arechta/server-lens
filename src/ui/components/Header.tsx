import React from "react";
import { Box, Text } from "ink";
import { useTheme } from "../theme-context";
import { SummaryBar } from "./SummaryBar";
import type { SnapshotSummary } from "../../schema/types";

/** Logo area: visual 1:1 aspect-square. Height must fit Recent scans (title + 5 rows) + Summary. */
const LOGO_HEIGHT_LINES = 18;
const LOGO_WIDTH_CHARS = LOGO_HEIGHT_LINES * 2;
const MAINTAINER = "arechta.dev <Asphira Andreas>";
const SUMMARY_NAME_WIDTH = 12;

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
      {/* Left: logo = visual square (28×14), rowspan 2 */}
      <Box
        width={LOGO_WIDTH_CHARS}
        minWidth={LOGO_WIDTH_CHARS}
        height={LOGO_HEIGHT_LINES}
        minHeight={LOGO_HEIGHT_LINES}
        flexDirection="column"
        justifyContent="center"
        alignItems="center"
        borderStyle="single"
        borderColor={theme.accent}
        paddingX={0}
        paddingY={0}
      >
        <Text color={theme.muted} dimColor>◼</Text>
      </Box>
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
