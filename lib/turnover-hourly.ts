import type { Backup } from "@/lib/api";
import {
  pickLatestUzaverkaBackupsForDay,
  type HourlySalePoint,
} from "@/lib/turnover-utils";

const ADMIN_KEY = process.env.NEXT_PUBLIC_ADMIN_KEY || "SUPER_SECRET_ADMIN_NKEY";

function isDecryptableBackup(fileName: string): boolean {
  return fileName.endsWith(".wsbak") || fileName.endsWith(".db");
}

/** Load sale timestamps from uzaverka .wsbak for intraday chart (single batch API call). */
export async function fetchHourlySalesForChart(
  backups: Backup[],
  day: string,
  opts?: { licenseKey?: string; branchIds?: number[] | null }
): Promise<HourlySalePoint[]> {
  const dayBackups = pickLatestUzaverkaBackupsForDay(backups, day, opts).filter((b) =>
    isDecryptableBackup(b.file_name)
  );

  if (dayBackups.length === 0) return [];

  const response = await fetch("/api/admin/backups/intraday", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-admin-key": ADMIN_KEY,
    },
    body: JSON.stringify({
      backupIds: dayBackups.map((b) => b.id),
      day,
    }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({ error: "Intraday fetch failed" }));
    throw new Error(err.error || "Intraday fetch failed");
  }

  const result = await response.json();
  if (!result.ok) {
    throw new Error(result.error || "Intraday fetch failed");
  }

  return (result.sales ?? []) as HourlySalePoint[];
}
