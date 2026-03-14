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
      onQuit?.();
      return;
    }
    if (key.upArrow) { onUp?.(); return; }
    if (key.downArrow) { onDown?.(); return; }
    if (key.return || input === " ") { onSelect?.(); return; }
    if (input) onKey?.(input);
  });
}
