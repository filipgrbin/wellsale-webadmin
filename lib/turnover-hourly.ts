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

export interface IntradayFetchResult {
  sales: HourlySalePoint[];
  /** Product name → quantity sold, from transaction_items (+ products lookup). */
  products: Record<string, number>;
}

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
): Promise<IntradayFetchResult> {
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

  return {
    sales: (result.sales ?? []) as HourlySalePoint[],
    products:
      result.products && typeof result.products === "object" && !Array.isArray(result.products)
        ? (result.products as Record<string, number>)
        : {},
  };
}

/** Load sale timestamps from uzaverka .wsbak for intraday chart (single day). */
export async function fetchHourlySalesForChart(
  backups: Backup[],
  day: string,
  opts?: { licenseKey?: string; branchIds?: number[] | null }
): Promise<HourlySalePoint[]> {
  const { sales } = await fetchHourlySalesForRange(backups, day, day, opts);
  return sales;
}

/** Load sale timestamps + products for a date range (insights / charts). */
export async function fetchHourlySalesForRange(
  backups: Backup[],
  from: string,
  to: string,
  opts?: { licenseKey?: string; branchIds?: number[] | null }
): Promise<IntradayFetchResult> {
  if (rangeDayCount(from, to) > HOURLY_INSIGHTS_MAX_DAYS) {
    return { sales: [], products: {} };
  }

  const dayBackups = pickBackupsForRange(backups, from, to, opts);
  if (dayBackups.length === 0) return { sales: [], products: {} };

  return postIntraday(
    dayBackups.map((b) => b.id),
    from,
    to
  );
}
