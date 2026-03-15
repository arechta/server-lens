import { useInput } from "ink";

interface KeyInputHandlers {
  onUp?: () => void;
  onDown?: () => void;
  onSelect?: () => void;
  onQuit?: () => void;
  /** Called with the raw key character for custom bindings */
  onKey?: (key: string) => void;
}

/**
 * Keyboard input hook — arrow keys, enter/space, quit.
 * Used in interactive screens for navigation and expand/collapse.
 */
export function useKeyInput({
  onUp,
  onDown,
  onSelect,
  onQuit,
  onKey,
}: KeyInputHandlers) {
  useInput((input, key) => {
    if (input === "q" || key.escape) {
      // Leave rendered content in terminal (Claude Code style).
      // Ink runs cursor-up N + erase-to-end in its 'exit' event handler;
      // removing all exit/beforeExit listeners prevents that cleanup so the
      // rendered output stays in the buffer like normal command output.
      // We manually restore stdin raw mode so the shell works after exit.
      process.removeAllListeners('exit');
      process.removeAllListeners('beforeExit');
      try {
        if (process.stdin.isTTY) process.stdin.setRawMode(false);
        process.stdin.resume();
      } catch { /* non-TTY or already cleaned up */ }
      process.stdout.write('\n'); // cursor to fresh line so prompt lands correctly
      process.exit(0);
    }
    if (key.upArrow) { onUp?.(); return; }
    if (key.downArrow) { onDown?.(); return; }
    if (key.return || input === " ") { onSelect?.(); return; }
    if (input) onKey?.(input);
  });
}
