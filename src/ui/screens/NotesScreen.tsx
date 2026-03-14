import React, { useEffect } from "react";
import { Box, Text, useApp } from "ink";
import { useTheme } from "../theme-context";
import type { VersionEntry } from "../../schema/types";

interface NotesScreenProps {
  toolName: string;
  tool: VersionEntry | null;
}

/** Simple inline markdown renderer for GitHub release notes subset */
function renderMarkdown(
  text: string,
  theme: ReturnType<typeof useTheme>
): React.ReactNode[] {
  const lines = text.split("\n");
  return lines.map((line, i) => {
    // Headings
    if (line.startsWith("### ")) {
      return (
        <Text key={i} color={theme.heading} bold>
          {line.slice(4)}
        </Text>
      );
    }
    if (line.startsWith("## ")) {
      return (
        <Text key={i} color={theme.accent} bold>
          {line.slice(3)}
        </Text>
      );
    }
    if (line.startsWith("# ")) {
      return (
        <Text key={i} color={theme.heading} bold>
          {line.slice(2)}
        </Text>
      );
    }
    // Bullets
    if (line.startsWith("- ") || line.startsWith("* ")) {
      return (
        <Box key={i}>
          <Text color={theme.muted}>  – </Text>
          <Text>{line.slice(2)}</Text>
        </Box>
      );
    }
    // Empty line
    if (line.trim() === "") {
      return <Text key={i}> </Text>;
    }
    // Regular text
    return <Text key={i}>{line}</Text>;
  });
}

export function NotesScreen({ toolName, tool }: NotesScreenProps) {
  const theme = useTheme();
  const { exit } = useApp();

  useEffect(() => { exit(); }, []);

  return (
    <Box flexDirection="column" padding={1}>
      <Box borderStyle="single" borderColor={theme.accent} paddingX={1}>
        <Text color={theme.heading} bold>server-lens notes</Text>
        <Text color={theme.muted}> — {toolName}</Text>
        {tool && (
          <Text color={theme.muted}>
            {"  •  "}{tool.current_version ?? "–"} → {tool.latest_version ?? "–"}
          </Text>
        )}
      </Box>

      <Box flexDirection="column" marginTop={1} paddingLeft={1}>
        {!tool ? (
          <Text color={theme.muted}>
            Tool '{toolName}' not found. Run: server-lens scan --now
          </Text>
        ) : !tool.release_notes ? (
          <Box flexDirection="column">
            <Text color={theme.muted}>No release notes available for '{toolName}'.</Text>
            <Box marginTop={1}>
              <Text color={theme.info}>
                Run a scan with --with-notes to fetch release notes:
              </Text>
            </Box>
            <Text color={theme.accent}>  server-lens scan --with-notes --now</Text>
            {tool.release_notes_source === null && tool.probe_type === "github" && (
              <Box marginTop={1}>
                <Text color={theme.muted}>
                  Source: github-release (uses GitHub API release body)
                </Text>
              </Box>
            )}
          </Box>
        ) : (
          <>
            {tool.release_notes_source && (
              <Text color={theme.muted} dimColor>
                Source: {tool.release_notes_source}
                {"  •  "}
                {tool.latest_version ?? ""}
                {"  •  "}
                {tool.latest_release_date?.slice(0, 10) ?? ""}
              </Text>
            )}
            <Box marginTop={1} flexDirection="column">
              {renderMarkdown(tool.release_notes, theme)}
            </Box>
          </>
        )}
      </Box>
    </Box>
  );
}
