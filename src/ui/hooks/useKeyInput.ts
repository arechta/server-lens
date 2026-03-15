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
      // Leave rendered content in the terminal buffer on exit.
      // Ink's default cleanup (cursor-up N + erase-to-end) wipes the screen;
      // blocking stdout writes prevents that so the output stays visible in
      // the scrollback — same behaviour as Claude Code and other inline TUIs.
      if (process.stdout.isTTY) {
        const origWrite = process.stdout.write.bind(process.stdout);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (process.stdout as any).write = () => true; // swallow Ink's cleanup
        origWrite('\n'); // ensure shell prompt starts on a fresh line
      }
      process.exit(0);
    }
    if (key.upArrow) { onUp?.(); return; }
    if (key.downArrow) { onDown?.(); return; }
    if (key.return || input === " ") { onSelect?.(); return; }
    if (input) onKey?.(input);
  });
}
