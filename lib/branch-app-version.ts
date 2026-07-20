import type { Backup } from "@/lib/api";
import { formatDistanceToNow } from "date-fns";
import { cs } from "date-fns/locale";

export type BranchVersionFields = {
  app_version: string | null;
  app_version_seen_at: string | null;
};

export function formatAppVersionSeenAt(seenAt: string | null | undefined): string | null {
  if (!seenAt) return null;
  try {
    return formatDistanceToNow(new Date(seenAt), { addSuffix: true, locale: cs });
  } catch {
    return null;
  }
}

function firstNonEmptyString(
  record: Record<string, unknown>,
  keys: string[]
): string | null {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }
  return null;
}

/** App version reported inside this backup/uzaverka metadata — never the branch's last heartbeat. */
export function resolveBackupAppVersion(backup: Backup): BranchVersionFields {
  const meta = backup.metadata_json;
  if (!meta || typeof meta !== "object") {
    return { app_version: null, app_version_seen_at: null };
  }

  const record = meta as Record<string, unknown>;
  const app_version = firstNonEmptyString(record, [
    "app_version",
    "appVersion",
    "client_version",
    "clientVersion",
    "pos_version",
    "posVersion",
  ]);

  const app_version_seen_at = firstNonEmptyString(record, [
    "app_version_seen_at",
    "appVersionSeenAt",
  ]);

  return {
    app_version,
    app_version_seen_at,
  };
}
