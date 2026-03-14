/**
 * System checks — reboot_required, disk_warning, service_degraded
 * Linux-focused; other platforms may no-op.
 * @see docs/data-schema.md
 */

import { existsSync, readFileSync } from "fs";
import { platform } from "os";

export interface RebootRequiredResult {
  event: "system.reboot_required";
  reason: "kernel_update" | "package_update" | "unknown";
  detected_at: string;
}

export interface DiskWarningResult {
  event: "system.disk_warning";
  mount_point: string;
  used_pct: number;
  available_gb: number;
  threshold_pct: number;
}

export interface ServiceDegradedResult {
  event: "system.service_degraded";
  name: string;
  category: "systemd" | "pm2";
  state: string;
  since: string | null;
}

export async function checkRebootRequired(): Promise<RebootRequiredResult | null> {
  if (platform() !== "linux") return null;

  const path = "/var/run/reboot-required";
  if (!existsSync(path)) return null;

  let reason: RebootRequiredResult["reason"] = "unknown";
  try {
    const pkgsPath = "/var/run/reboot-required.pkgs";
    if (existsSync(pkgsPath)) {
      const content = readFileSync(pkgsPath, "utf-8");
      const hasKernel = /linux-image|linux-headers|linux-modules/.test(content);
      reason = hasKernel ? "kernel_update" : "package_update";
    }
  } catch {
    /* keep unknown */
  }

  return {
    event: "system.reboot_required",
    reason,
    detected_at: new Date().toISOString(),
  };
}

export async function checkDiskWarning(
  thresholdPct: number
): Promise<DiskWarningResult[]> {
  const results: DiskWarningResult[] = [];

  if (platform() === "win32") {
    /* Windows disk check: wmic or skip. For Linux-primary target, no-op on Windows. */
    return results;
  }

  try {
    const proc = Bun.spawn(
      ["df", "-P", "-k"],
      { stdout: "pipe", stderr: "pipe" }
    );
    const out = await new Response(proc.stdout).text();
    await proc.exited;

    const lines = out.trim().split("\n").slice(1);
    for (const line of lines) {
      const parts = line.split(/\s+/);
      if (parts.length < 6) continue;
      const mount = parts[5];
      const totalK = parseInt(parts[1], 10) || 0;
      const usedK = parseInt(parts[2], 10) || 0;
      const availK = parseInt(parts[3], 10) || 0;
      const usedPct = totalK > 0 ? Math.round((100 * usedK) / totalK) : 0;
      const availableGb = Math.round((availK / (1024 * 1024)) * 10) / 10;

      if (usedPct >= thresholdPct) {
        results.push({
          event: "system.disk_warning",
          mount_point: mount,
          used_pct: usedPct,
          available_gb: availableGb,
          threshold_pct: thresholdPct,
        });
      }
    }
  } catch {
    /* df may not exist or fail */
  }

  return results;
}

export async function checkServiceDegraded(): Promise<ServiceDegradedResult[]> {
  const results: ServiceDegradedResult[] = [];

  if (platform() === "linux") {
    try {
      const proc = Bun.spawn(
        ["systemctl", "list-units", "--state=failed", "--plain", "--no-legend", "--no-pager"],
        { stdout: "pipe", stderr: "pipe" }
      );
      const out = await new Response(proc.stdout).text();
      await proc.exited;

      for (const line of out.trim().split("\n").filter(Boolean)) {
        const parts = line.split(/\s+/);
        const unit = parts[0];
        if (unit?.endsWith(".service")) {
          results.push({
            event: "system.service_degraded",
            name: unit.replace(".service", ""),
            category: "systemd",
            state: "failed",
            since: null,
          });
        }
      }
    } catch {
      /* systemctl may not exist */
    }
  }

  try {
    const proc = Bun.spawn(["pm2", "jlist"], {
      stdout: "pipe",
      stderr: "pipe",
    });
    const out = await new Response(proc.stdout).text();
    await proc.exited;

    const arr = JSON.parse(out) as Array<{
      name?: string;
      pm2_env?: { status?: string; pm_uptime?: number };
    }>;
    if (!Array.isArray(arr)) return results;

    for (const p of arr) {
      const status = p.pm2_env?.status ?? "";
      if (status === "stopped" || status === "errored") {
        const since = p.pm2_env?.pm_uptime
          ? new Date(p.pm2_env.pm_uptime).toISOString()
          : null;
        results.push({
          event: "system.service_degraded",
          name: p.name ?? "unknown",
          category: "pm2",
          state: status,
          since,
        });
      }
    }
  } catch {
    /* pm2 may not be installed */
  }

  return results;
}
