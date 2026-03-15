import React from "react";
import { Box, Text, useStdout } from "ink";
import { useTheme } from "../theme-context";
import { ScanProgress } from "../components/ScanProgress";

export interface ScanLogEntry {
  name: string;
  probeType: string | null;
  currentVersion: string | null;
  latestVersion: string | null;
  isOutdated: boolean;
  probeFailed: boolean;
  updateType: string | null;
  durationMs: number;
}

interface ScanScreenProps {
  phase: "scanning" | "done" | "error";
  currentTool: string;
  totalProbed: number;
  dryRun?: boolean;
  errorMsg?: string;
  /** Live log of completed probes — shown as they stream in */
  scanLog?: ScanLogEntry[];
}


function truncpad(s: string | null | undefined, len: number): string {
  if (!s) return " ".repeat(len);
  if (s.length > len) return s.slice(0, len - 1) + "…";
  return s.padEnd(len);
}

function ScanLogRow({ entry }: { entry: ScanLogEntry }) {
  const theme = useTheme();

  const sym     = entry.probeFailed ? "✗" : "✓";
  const symColor = entry.probeFailed ? theme.error : theme.success;
  const name    = truncpad(entry.name, 22);
  const probe   = truncpad(entry.probeType, 10);

  const ms = entry.durationMs;
  const timeColor = ms >= 10_000 ? theme.error
    : ms >= 2_000 ? theme.warning
    : theme.muted;
  const timeStr = ms >= 1_000 ? `${(ms / 1000).toFixed(1)}s` : `${ms}ms`;

  let verPart: React.ReactNode;
  if (entry.probeFailed) {
    verPart = <Text color={theme.muted}>{"probe failed".padEnd(28)}</Text>;
  } else if (entry.isOutdated) {
    const cur = truncpad(entry.currentVersion, 10);
    const lat = truncpad(entry.latestVersion, 10);
    const upd = (entry.updateType ?? "").padEnd(7);
    verPart = (
      <>
        <Text>{cur}</Text>
        <Text color={theme.warning}> → </Text>
        <Text>{lat}</Text>
        <Text color={theme.warning}>  {upd}</Text>
      </>
    );
  } else {
    const ver = truncpad(entry.currentVersion ?? entry.latestVersion, 10);
    verPart = (
      <>
        <Text>{ver}</Text>
        <Text color={theme.success}>   ✓       </Text>
      </>
    );
  }

  return (
    <Box>
      <Text color={symColor}>{sym}  </Text>
      <Text>{name}  </Text>
      {verPart}
      <Text color={theme.muted}>  {probe}  </Text>
      <Text color={timeColor}>{timeStr}</Text>
    </Box>
  );
}

export function ScanScreen({
  phase,
  currentTool,
  totalProbed,
  dryRun = false,
  errorMsg,
  scanLog = [],
}: ScanScreenProps) {
  const theme = useTheme();
  const { stdout } = useStdout();

  // Skip auto-apt entries (batch lookups, all ~0ms — not useful for timing)
  const allVisible = scanLog.filter((e) => e.probeType !== "apt" || e.probeFailed || e.isOutdated);

  // Cap rendered rows to terminal height to prevent Ink cursor-tracking overflow
  // (once the list exceeds the viewport, cursor math breaks and the screen jumps).
  // No pre-filling — component grows naturally so the terminal scrollback is preserved.
  // Fixed rows: outer padding(2) + header box(3) + marginTop(1) + spinner(1) + marginTop(1) = 8
  const termRows = stdout?.rows ?? 30;
  const maxLogRows = Math.max(3, termRows - 8);
  const visible = allVisible.slice(-maxLogRows);

  return (
    <Box flexDirection="column" padding={1}>
      {/* Header */}
      <Box borderStyle="single" borderColor={theme.accent} paddingX={1}>
        <Text color={theme.heading} bold>server-lens scan</Text>
        {dryRun && <Text color={theme.warning}> [dry-run]</Text>}
      </Box>

      {/* Live probe log — grows naturally, capped at terminal height */}
      {visible.length > 0 && (
        <Box flexDirection="column" marginTop={1}>
          {visible.map((entry, i) => (
            <ScanLogRow key={`${entry.name}-${i}`} entry={entry} />
          ))}
        </Box>
      )}

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
