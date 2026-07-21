import type { Backup } from "@/lib/api";
import {
  datesInRange,
  pickLatestUzaverkaBackupsForDay,
  rangeDayCount,
  type HourlySalePoint,
} from "@/lib/turnover-utils";

const ADMIN_KEY = process.env.NEXT_PUBLIC_ADMIN_KEY || "SUPER_SECRET_ADMIN_NKEY";

/** Max days to decrypt for hourly insights (keeps load bounded). */
export const HOURLY_INSIGHTS_MAX_DAYS = 14;

function isDecryptableBackup(fileName: string): boolean {
  return fileName.endsWith(".wsbak") || fileName.endsWith(".db");
}

function pickBackupsForRange(
  backups: Backup[],
  from: string,
  to: string,
  opts?: { licenseKey?: string; branchIds?: number[] | null }
): Backup[] {
  const byId = new Map<number, Backup>();
  for (const day of datesInRange(from, to)) {
    for (const b of pickLatestUzaverkaBackupsForDay(backups, day, opts)) {
      if (isDecryptableBackup(b.file_name)) byId.set(b.id, b);
    }
  }
  return [...byId.values()];
}

async function postIntraday(
  backupIds: number[],
  from: string,
  to: string
): Promise<HourlySalePoint[]> {
  const response = await fetch("/api/admin/backups/intraday", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-admin-key": ADMIN_KEY,
    },
    body: JSON.stringify({
      backupIds,
      from,
      to,
      day: from === to ? from : undefined,
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

/** Load sale timestamps from uzaverka .wsbak for intraday chart (single day). */
export async function fetchHourlySalesForChart(
  backups: Backup[],
  day: string,
  opts?: { licenseKey?: string; branchIds?: number[] | null }
): Promise<HourlySalePoint[]> {
  return fetchHourlySalesForRange(backups, day, day, opts);
}

/** Load sale timestamps for a date range (best/quietest hour insights). */
export async function fetchHourlySalesForRange(
  backups: Backup[],
  from: string,
  to: string,
  opts?: { licenseKey?: string; branchIds?: number[] | null }
): Promise<HourlySalePoint[]> {
  if (rangeDayCount(from, to) > HOURLY_INSIGHTS_MAX_DAYS) {
    return [];
  }

  const dayBackups = pickBackupsForRange(backups, from, to, opts);
  if (dayBackups.length === 0) return [];

  return postIntraday(
    dayBackups.map((b) => b.id),
    from,
    to
  );
}
