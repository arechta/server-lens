import React from "react";
import { Box, Text } from "ink";
import { useTheme } from "../theme-context";
import type { SnapshotSummary } from "../../schema/types";

interface SummaryBarProps {
  summary: SnapshotSummary["summary"];
}

export function SummaryBar({ summary }: SummaryBarProps) {
  const theme = useTheme();
  const { by_update_type, outdated } = summary;

  if (outdated === 0) {
    return <Text color={theme.success}>✓ all up to date</Text>;
  }

  return (
    <Box gap={2}>
      {by_update_type.major > 0 && (
        <Text color={theme.error}>⚑ {by_update_type.major} major</Text>
      )}
      {by_update_type.minor > 0 && (
        <Text color={theme.warning}>→ {by_update_type.minor} minor</Text>
      )}
      {by_update_type.patch > 0 && (
        <Text color={theme.warning}>→ {by_update_type.patch} patch</Text>
      )}
      {by_update_type.unknown > 0 && (
        <Text color={theme.info}>? {by_update_type.unknown} unknown</Text>
      )}
    </Box>
  );
}
