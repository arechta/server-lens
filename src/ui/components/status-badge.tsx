import React from "react";
import { Text } from "ink";
import { useTheme } from "../theme-context";
import type { UpdateType } from "../../schema/types";

interface StatusBadgeProps {
  updateType: UpdateType;
  /** Compact mode: only show symbol, not label */
  compact?: boolean;
}

interface BadgeConfig {
  symbol: string;
  label: string;
  colorKey: "error" | "warning" | "success" | "muted" | "info";
}

const BADGE_CONFIG: Record<UpdateType, BadgeConfig> = {
  major:   { symbol: "⚑", label: "MAJOR", colorKey: "error" },
  minor:   { symbol: "→", label: "minor", colorKey: "warning" },
  patch:   { symbol: "→", label: "patch", colorKey: "warning" },
  unknown: { symbol: "?", label: "?ver",  colorKey: "info" },
  none:    { symbol: "✓", label: "✓",     colorKey: "success" },
  null:    { symbol: "?", label: "–",     colorKey: "muted" },
};

export function StatusBadge({ updateType, compact = false }: StatusBadgeProps) {
  const theme = useTheme();
  const cfg = BADGE_CONFIG[updateType] ?? BADGE_CONFIG.null;
  const color = theme[cfg.colorKey];

  if (compact) {
    return <Text color={color}>{cfg.symbol}</Text>;
  }

  return (
    <Text color={color}>
      {cfg.symbol} {cfg.label.padEnd(5)}
    </Text>
  );
}
