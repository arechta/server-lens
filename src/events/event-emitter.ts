/**
 * Event emitter — diffs current vs previous snapshot, emits events
 */

import type { Database } from "bun:sqlite";
import type { VersionEntry } from "../schema/types";
import type { Config } from "../config/config-loader";
import { insertEvent } from "../db/events-repo";
import { dispatchWebhooks, type WebhookPayload } from "./webhook-dispatcher";
import {
  checkRebootRequired,
  checkDiskWarning,
  checkServiceDegraded,
} from "./system-checks";

export async function emitScanEvents(
  db: Database,
  config: Config,
  currentTools: VersionEntry[],
  previousTools: VersionEntry[],
  scanId: number,
  hostname: string
): Promise<void> {
  const prevMap = new Map(previousTools.map((t) => [t.name, t]));
  const currMap = new Map(currentTools.map((t) => [t.name, t]));

  const fire = (event: string, severity: string, data: unknown, toolName?: string | null) => {
    const eventId = insertEvent(db, event, severity, data, toolName, scanId);
    const urls = config.webhooks?.[event];
    if (urls) {
      const arr = typeof urls === "string" ? [urls] : Array.isArray(urls) ? urls : [];
      const payload: WebhookPayload = {
        event,
        timestamp: new Date().toISOString(),
        severity,
        hostname,
        data: data ?? {},
      };
      dispatchWebhooks(db, eventId, event, payload, arr);
    }
  };

  for (const t of currentTools) {
    const prev = prevMap.get(t.name);
    if (!prev) {
      fire(
        "tool.discovered",
        "info",
        {
          name: t.name,
          category: t.category,
          current_version: t.current_version,
          tool_status: t.tool_status,
        },
        t.name
      );
    } else if (prev.current_version !== t.current_version) {
      fire(
        "tool.version_changed",
        "info",
        {
          name: t.name,
          category: t.category,
          previous_version: prev.current_version,
          current_version: t.current_version,
        },
        t.name
      );
    }

    if (t.is_outdated && t.update_type === "major") {
      fire(
        "version.major_available",
        "warning",
        {
          name: t.name,
          category: t.category,
          current_version: t.current_version,
          latest_version: t.latest_version,
          repo_url: t.repo_url,
        },
        t.name
      );
    } else if (t.is_outdated) {
      fire(
        "version.outdated",
        "info",
        {
          name: t.name,
          category: t.category,
          current_version: t.current_version,
          latest_version: t.latest_version,
          update_type: t.update_type,
          repo_url: t.repo_url,
        },
        t.name
      );
    } else if (t.latest_version && !t.is_outdated) {
      fire(
        "version.up_to_date",
        "info",
        {
          name: t.name,
          category: t.category,
          current_version: t.current_version,
          latest_version: t.latest_version,
        },
        t.name
      );
    }

    if (t.probe_status === "failed") {
      fire(
        "probe.failed",
        "warning",
        {
          name: t.name,
          probe_type: t.probe_type,
          error_message: t.probe_error,
          probe_source: t.probe_source,
        },
        t.name
      );
    }
  }

  for (const prev of previousTools) {
    if (!currMap.has(prev.name)) {
      fire(
        "tool.removed",
        "info",
        {
          name: prev.name,
          category: prev.category,
          last_known_version: prev.current_version,
        },
        prev.name
      );
    }
  }

  // System events
  const reboot = await checkRebootRequired();
  if (reboot) {
    fire("system.reboot_required", "warning", { reason: reboot.reason, detected_at: reboot.detected_at }, null);
  }

  // threshold = min free %; warn when used_pct >= (100 - threshold). Default 20 = warn when <20% free (>=80% used)
  const minFreePct = config.settings.disk_warning_threshold_pct ?? 20;
  const usedThreshold = 100 - minFreePct;
  const diskWarnings = await checkDiskWarning(usedThreshold);
  for (const d of diskWarnings) {
    fire("system.disk_warning", "warning", d, null);
  }

  const degraded = await checkServiceDegraded();
  for (const s of degraded) {
    fire("system.service_degraded", "warning", { name: s.name, category: s.category, state: s.state, since: s.since }, s.name);
  }

  fire(
    "scan.completed",
    "info",
    {
      total: currentTools.length,
      outdated: currentTools.filter((t) => t.is_outdated).length,
      probe_failed: currentTools.filter((t) => t.probe_status === "failed").length,
      duration_ms: 0,
      by_update_type: {} as Record<string, number>,
    },
    null
  );
}
