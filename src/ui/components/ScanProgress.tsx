import React, { useState, useEffect } from "react";
import { Box, Text } from "ink";
import { useTheme } from "../theme-context";

const SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

interface ScanProgressProps {
  currentTool: string;
  totalProbed: number;
  phase?: "scanning" | "done" | "error";
}

export function ScanProgress({
  currentTool,
  totalProbed,
  phase = "scanning",
}: ScanProgressProps) {
  const theme = useTheme();
  const [frame, setFrame] = useState(0);

  useEffect(() => {
    if (phase !== "scanning") return;
    const id = setInterval(() => setFrame((f) => (f + 1) % SPINNER_FRAMES.length), 80);
    return () => clearInterval(id);
  }, [phase]);

  if (phase === "done") {
    return (
      <Box>
        <Text color={theme.success}>✓ </Text>
        <Text>Scan complete</Text>
        {totalProbed > 0 && <Text color={theme.muted}> — {totalProbed} tools checked</Text>}
      </Box>
    );
  }

  if (phase === "error") {
    return (
      <Box>
        <Text color={theme.error}>✗ </Text>
        <Text>Scan failed</Text>
      </Box>
    );
  }

  return (
    <Box>
      <Text color={theme.accent}>{SPINNER_FRAMES[frame]} </Text>
      <Text>Scanning</Text>
      {currentTool ? (
        <Text color={theme.muted}>: {currentTool}</Text>
      ) : (
        <Text color={theme.muted}>...</Text>
      )}
      {totalProbed > 0 && <Text color={theme.muted}> ({totalProbed} done)</Text>}
    </Box>
  );
}
