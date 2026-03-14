import React from "react";
import { Box, Text } from "ink";
import { useTheme } from "../theme-context";
import { ScanProgress } from "../components/ScanProgress";

interface ScanScreenProps {
  phase: "scanning" | "done" | "error";
  currentTool: string;
  totalProbed: number;
  dryRun?: boolean;
  errorMsg?: string;
}

export function ScanScreen({
  phase,
  currentTool,
  totalProbed,
  dryRun = false,
  errorMsg,
}: ScanScreenProps) {
  const theme = useTheme();

  return (
    <Box flexDirection="column" padding={1}>
      {/* Header */}
      <Box borderStyle="single" borderColor={theme.accent} paddingX={1}>
        <Text color={theme.heading} bold>server-lens scan</Text>
        {dryRun && <Text color={theme.warning}> [dry-run]</Text>}
      </Box>

      <Box marginTop={1}>
        <ScanProgress
          phase={phase}
          currentTool={currentTool}
          totalProbed={totalProbed}
        />
      </Box>

      {phase === "error" && errorMsg && (
        <Box marginTop={1}>
          <Text color={theme.error}>{errorMsg}</Text>
        </Box>
      )}

      {phase === "done" && (
        <Box marginTop={1}>
          <Text color={theme.muted}>
            {dryRun
              ? "Dry run — no data written. Remove --dry-run to save results."
              : "Run 'server-lens' to view results."}
          </Text>
        </Box>
      )}
    </Box>
  );
}
