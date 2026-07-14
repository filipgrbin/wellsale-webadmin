import type { Backup, Branch } from "@/lib/api";
import { formatDistanceToNow } from "date-fns";
import { cs } from "date-fns/locale";

export type BranchVersionFields = Pick<Branch, "app_version" | "app_version_seen_at">;

export function formatAppVersionSeenAt(seenAt: string | null | undefined): string | null {
  if (!seenAt) return null;
  try {
    return formatDistanceToNow(new Date(seenAt), { addSuffix: true, locale: cs });
  } catch {
    return null;
  }
}

export function resolveBackupAppVersion(
  backup: Backup,
  branchById: Map<number, BranchVersionFields>
): BranchVersionFields {
  const meta = backup.metadata_json as {
    app_version?: string | null;
    app_version_seen_at?: string | null;
  } | null;

  if (meta?.app_version) {
    return {
      app_version: meta.app_version,
      app_version_seen_at: meta.app_version_seen_at ?? null,
    };
  }

  const branch = branchById.get(backup.branch_id);
  return {
    app_version: branch?.app_version ?? null,
    app_version_seen_at: branch?.app_version_seen_at ?? null,
  };
}

export function buildBranchVersionMap(branches: Branch[]): Map<number, BranchVersionFields> {
  return new Map(
    branches.map((b) => [
      b.id,
      { app_version: b.app_version ?? null, app_version_seen_at: b.app_version_seen_at ?? null },
    ])
  );
}
