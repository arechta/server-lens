import type { Scanner, DiscoveredTool } from "./types";

/** Linux only — systemd service units */
export class SystemdScanner implements Scanner {
  readonly source = "systemd" as const;

  async scan(): Promise<DiscoveredTool[]> {
    if (process.platform !== "linux") return [];

    try {
      const proc = Bun.spawn(
        ["systemctl", "list-units", "--type=service", "--output=json", "--no-pager"],
        { stdout: "pipe", stderr: "pipe" }
      );
      const out = await new Response(proc.stdout).text();
      await proc.exited;

      const arr = JSON.parse(out) as Array<{ unit?: string; sub?: string }>;
      if (!Array.isArray(arr)) return [];

      return arr
        .filter((u) => u.unit && !u.unit.startsWith("systemd-") && !u.unit.includes("@"))
        .map((u) => ({
          name: u.unit!.replace(".service", ""),
          display_name: u.unit!.replace(".service", ""),
          current_version: null,
          category: "systemd" as const,
          source: "systemd" as const,
        }));
    } catch {
      return [];
    }
  }
}
