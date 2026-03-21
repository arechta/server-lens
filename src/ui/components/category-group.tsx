import React, { useState } from "react";
import { Box, Text, useInput } from "ink";
import { useTheme } from "../theme-context";
import type { VersionEntry } from "../../schema/types";
import { ToolRow } from "./tool-row";
import { Divider } from "./divider";

interface CategoryGroupProps {
  category: string;
  tools: VersionEntry[];
  /** If true, group starts collapsed (apt uses this by default) */
  defaultCollapsed?: boolean;
  /** Controlled collapsed state — overrides internal state when provided */
  collapsed?: boolean;
  compact?: boolean;
}

export function CategoryGroup({
  category,
  tools,
  defaultCollapsed = false,
  collapsed: collapsedProp,
  compact = false,
}: CategoryGroupProps) {
  const [internalCollapsed, setInternalCollapsed] = useState(defaultCollapsed);
  // Use controlled prop if provided, otherwise internal state
  const collapsed = collapsedProp !== undefined ? collapsedProp : internalCollapsed;
  const theme = useTheme();

  const outdated = tools.filter((t) => t.is_outdated).length;
  const statusColor = outdated > 0 ? theme.warning : theme.success;
  const statusSymbol = outdated > 0 ? (tools.some((t) => t.update_type === "major") ? "⚑" : "→") : "✓";
  const isCollapsible = collapsedProp !== undefined || defaultCollapsed;
  const collapseHint = isCollapsible ? (collapsed ? " [+]" : " [–]") : "";

  return (
    <Box flexDirection="column" marginBottom={1}>
      {/* Category header */}
      <Box>
        <Text color={theme.accent} bold>
          {category.toUpperCase()}
        </Text>
        {collapsed ? (
          <>
            <Text color={theme.muted}> ({tools.length} packages</Text>
            {outdated > 0 && <Text color={statusColor}>, {outdated} outdated</Text>}
            <Text color={theme.muted}>)</Text>
          </>
        ) : (
          outdated > 0 && <Text color={statusColor}> ({outdated} outdated)</Text>
        )}
        <Text color={statusColor}>{collapseHint}</Text>
      </Box>

      <Divider width={compact ? 40 : 60} />

      {/* Tool rows — hidden when collapsed */}
      {!collapsed && tools.map((tool) => (
        <ToolRow key={tool.name} tool={tool} compact={compact} />
      ))}

      {/* Collapsed hint */}
      {collapsed && (
        <Text color={theme.muted} dimColor>
          Press 'a' to expand
        </Text>
      )}
    </Box>
  );
}
