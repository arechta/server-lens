import React from "react";
import { Box, Text } from "ink";
import { useTheme } from "../theme-context";
import { SummaryBar } from "./SummaryBar";
import type { SnapshotSummary } from "../../schema/types";

interface HeaderProps {
  snapshot: SnapshotSummary | null;
  filterOutdated?: boolean;
  filterCategory?: string | null;
  version?: string;
}

export function Header({
  snapshot,
  filterOutdated = false,
  filterCategory = null,
  version = "v0.1.0",
}: HeaderProps) {
  const theme = useTheme();

  return (
    <Box flexDirection="column" borderStyle="single" borderColor={theme.accent} paddingX={1}>
      {/* Title row */}
      <Box>
        <Text color={theme.heading} bold>server-lens</Text>
        <Text color={theme.muted}> {version}</Text>
        {snapshot && (
          <>
            <Text color={theme.muted}>{"  •  "}{snapshot.hostname}</Text>
            <Text color={theme.muted}>
              {"  •  Last scan: "}
              {new Date(snapshot.scanned_at).toLocaleString()}
            </Text>
            <Text color={theme.muted}>{"  •  "}{snapshot.summary.total} tools</Text>
          </>
        )}
        {filterOutdated && <Text color={theme.accent}>{"  •  [outdated only]"}</Text>}
        {filterCategory && <Text color={theme.accent}>{"  •  [category: "}{filterCategory}{"]"}</Text>}
      </Box>
      {/* Summary row */}
      {snapshot && snapshot.summary.outdated > 0 && (
        <Box marginTop={0}>
          <SummaryBar summary={snapshot.summary} />
        </Box>
      )}
    </Box>
  );
}
