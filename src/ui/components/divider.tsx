import React from "react";
import { Box, Text } from "ink";
import { useTheme } from "../theme-context";

interface DividerProps {
  width?: number;
}

export function Divider({ width = 50 }: DividerProps) {
  const theme = useTheme();
  return (
    <Box>
      <Text color={theme.border}>{"─".repeat(width)}</Text>
    </Box>
  );
}
