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
      // Scroll the visible terminal content into the scrollback buffer before
      // Ink's unmount cleanup (cursor-up N + erase-to-end) runs.
      // Without this, Ink erases the entire visible area and the user's
      // previous command history disappears. Writing stdout.rows newlines
      // pushes everything up into scrollback first, so Ink only clears blank space.
      if (process.stdout.isTTY) {
        process.stdout.write('\n'.repeat(process.stdout.rows ?? 50));
      }
      onQuit?.();
      return;
    }
    if (key.upArrow) { onUp?.(); return; }
    if (key.downArrow) { onDown?.(); return; }
    if (key.return || input === " ") { onSelect?.(); return; }
    if (input) onKey?.(input);
  });
}
