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

  // Fixed-height log area: always render exactly maxLogRows slots.
  // Empty slots (null) pad the top; real entries fill from the bottom.
  //
  // WHY: Ink renders inline by moving cursor up N lines and overwriting.
  // If the component height changes (grows by 1 per new entry), Ink erases and
  // rewrites the whole component on every frame — visible as jumping/flicker.
  // With a fixed height, Ink just overwrites in-place with no erase needed.
  //
  // Fixed rows: outer padding(2) + header box(3) + marginTop(1) + spinner(1) + marginTop(1) = 8
  const termRows = stdout?.rows ?? 30;
  const maxLogRows = Math.max(3, termRows - 8);
  const tail = allVisible.slice(-maxLogRows);
  // Pre-fill top with nulls so total slots === maxLogRows from the very first frame
  const logSlots: (ScanLogEntry | null)[] = [
    ...Array<null>(Math.max(0, maxLogRows - tail.length)).fill(null),
    ...tail,
  ];

  return (
    <Box flexDirection="column" padding={1}>
      {/* Header */}
      <Box borderStyle="single" borderColor={theme.accent} paddingX={1}>
        <Text color={theme.heading} bold>server-lens scan</Text>
        {dryRun && <Text color={theme.warning}> [dry-run]</Text>}
      </Box>

      {/* Live probe log — fixed height, entries fill from bottom up */}
      <Box flexDirection="column" marginTop={1}>
        {logSlots.map((entry, i) =>
          entry
            ? <ScanLogRow key={`slot-${i}`} entry={entry} />
            : <Box key={`slot-${i}`}><Text> </Text></Box>
        )}
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
