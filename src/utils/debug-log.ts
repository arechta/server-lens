/**
 * Lightweight debug logger — writes to /tmp/server-lens-debug.log when enabled.
 * Enable via setDebugEnabled(true) before any probes run.
 */

import { appendFileSync } from "fs";

const DEBUG_LOG_PATH = "/tmp/server-lens-debug.log";

let _enabled = false;

export function setDebugEnabled(enabled: boolean): void {
  _enabled = enabled;
  if (enabled) {
    // Write header line so the file is clearly a new session
    const line = `\n${"=".repeat(60)}\nserver-lens debug log — ${new Date().toISOString()}\n${"=".repeat(60)}\n`;
    try {
      appendFileSync(DEBUG_LOG_PATH, line, "utf-8");
    } catch {
      // ignore write errors
    }
  }
}

export function isDebugEnabled(): boolean {
  return _enabled;
}

export function debugLog(message: string): void {
  if (!_enabled) return;
  const line = `[${new Date().toISOString()}] ${message}\n`;
  try {
    appendFileSync(DEBUG_LOG_PATH, line, "utf-8");
  } catch {
    // ignore write errors
  }
}
