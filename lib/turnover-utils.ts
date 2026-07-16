import type { Backup } from "@/lib/api";

export interface UzaverkaMeta {
  close_id?: number;
  tx_count?: number;
  close_date?: string;
  total_revenue?: number;
  real_zisk?: number;
}

export interface DayAggregate {
  revenue: number;
  profit: number;
  profitBranches: Set<number>;
  tx: number;
  branches: Set<number>;
}

export interface ClosureRecord {
  branchId: number;
  branchCode: string;
  branchName: string;
  closeDate: string;
  uploadedAt: string;
  revenue: number;
  profit: number | null;
  txCount: number;
}

export interface BranchInfo {
  id: number;
  code: string;
  name: string;
}

export type RangePreset = "today" | "week" | "month" | "custom";
export type ChartGranularity = "hour" | "day" | "month";

export interface ChartBucket {
  key: string;
  label: string;
  byBranch: Map<number, number>;
  total: number;
}

/** Distinct branch colors for stacked bars (emerald-first palette). */
export const BRANCH_PALETTE = [
  "#059669",
  "#047857",
  "#10b981",
  "#0d9488",
  "#14b8a6",
  "#065f46",
  "#34d399",
  "#2dd4bf",
  "#064e3b",
  "#5eead4",
  "#6ee7b7",
  "#047857",
];

const EMERALD_DARK = "#059669";

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("cs-CZ", {
    style: "currency",
    currency: "CZK",
    maximumFractionDigits: 0,
  }).format(amount);
}

export function pragueDate(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Prague",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

/** Normalize to YYYY-MM-DD (Prague local date for ISO timestamps). */
export function normalizeCloseDate(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const s = String(raw).trim();
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const d = new Date(s);
  if (!Number.isNaN(d.getTime())) return pragueDate(d);
  return null;
}

/** Extract business close date from uzaverka backup metadata / filename / upload time. */
export function extractCloseDate(backup: Backup): string | null {
  const meta = backup.metadata_json as UzaverkaMeta & { date?: string; datum?: string } | null;
  const fromMeta =
    normalizeCloseDate(meta?.close_date) ??
    normalizeCloseDate(meta?.date) ??
    normalizeCloseDate(meta?.datum);
  if (fromMeta) return fromMeta;

  const fromName = backup.file_name.match(/(\d{4}-\d{2}-\d{2})/);
  if (fromName) return fromName[1];

  if (backup.uploaded_at) return pragueDate(new Date(backup.uploaded_at));
  return null;
}

export function pragueHourFromIso(iso: string): number {
  const h = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Prague",
    hour: "numeric",
    hour12: false,
  }).format(new Date(iso));
  const n = Number(h);
  return n === 24 ? 0 : n;
}

/** Hour (0–23) in Europe/Prague from POS / SQLite timestamps. */
export function pragueHourFromTimestamp(ts: string): number {
  const s = String(ts).trim();
  if (!s) return 0;

  if (/^\d+$/.test(s)) {
    const n = Number(s);
    const ms = n > 1e12 ? n : n * 1000;
    return pragueHourFromIso(new Date(ms).toISOString());
  }

  const local = s.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/);
  if (local && !s.endsWith("Z") && !/[+-]\d{2}:?\d{2}$/.test(s)) {
    return Number(local[4]);
  }

  return pragueHourFromIso(s);
}

export function lastNDays(n: number): string[] {
  const out: string[] = [];
  const now = Date.now();
  for (let i = 0; i < n; i++) out.push(pragueDate(new Date(now - i * 86_400_000)));
  return out;
}

export function dayLabel(dateStr: string): { dow: string; dm: string } {
  const d = new Date(dateStr + "T12:00:00");
  return {
    dow: new Intl.DateTimeFormat("cs-CZ", { weekday: "short" }).format(d),
    dm: new Intl.DateTimeFormat("cs-CZ", { day: "numeric", month: "numeric" }).format(d),
  };
}

export function weekStartKey(dateStr: string): string {
  const d = new Date(dateStr + "T12:00:00");
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return pragueDate(d);
}

export function weekLabel(weekStart: string): string {
  const start = new Date(weekStart + "T12:00:00");
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  const fmt = new Intl.DateTimeFormat("cs-CZ", { day: "numeric", month: "numeric" });
  return `${fmt.format(start)} – ${fmt.format(end)}`;
}

export function monthLabel(ym: string): string {
  const [y, m] = ym.split("-");
  const d = new Date(Number(y), Number(m) - 1, 1);
  return new Intl.DateTimeFormat("cs-CZ", { month: "long", year: "numeric" }).format(d);
}

export function getEffectiveDateRange(
  preset: RangePreset,
  customFrom: string,
  customTo: string
): { from: string; to: string } {
  const today = pragueDate(new Date());
  switch (preset) {
    case "today":
      return { from: today, to: today };
    case "week":
      return { from: weekStartKey(today), to: today };
    case "month":
      return { from: `${today.slice(0, 7)}-01`, to: today };
    case "custom":
      return {
        from: customFrom || today,
        to: customTo || customFrom || today,
      };
  }
}

export function datesInRange(from: string, to: string): string[] {
  const out: string[] = [];
  const start = new Date(from + "T12:00:00");
  const end = new Date(to + "T12:00:00");
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    out.push(pragueDate(d));
  }
  return out;
}

export function monthsInRange(from: string, to: string): string[] {
  const out: string[] = [];
  const [fy, fm] = from.split("-").map(Number);
  const [ty, tm] = to.split("-").map(Number);
  let y = fy;
  let m = fm;
  while (y < ty || (y === ty && m <= tm)) {
    out.push(`${y}-${String(m).padStart(2, "0")}`);
    m++;
    if (m > 12) {
      m = 1;
      y++;
    }
  }
  return out;
}

export function rangeDayCount(from: string, to: string): number {
  return datesInRange(from, to).length;
}

export interface HourlySalePoint {
  branchId: number;
  timestamp: string;
  revenue: number;
}

export function saleMatchesDateRange(
  timestamp: string,
  from: string,
  to: string,
  fallbackDate?: string
): boolean {
  const d = normalizeCloseDate(timestamp);
  if (d) return d >= from && d <= to;
  if (fallbackDate) return fallbackDate >= from && fallbackDate <= to;
  return false;
}

/** Latest uzaverka backup per branch for a specific business day. */
export function pickLatestUzaverkaBackupsForDay(
  backups: Backup[],
  closeDate: string,
  opts?: { licenseKey?: string; branchIds?: number[] | null }
): Backup[] {
  if (opts?.branchIds != null && opts.branchIds.length === 0) return [];

  const branchFilter =
    opts?.branchIds && opts.branchIds.length > 0 ? new Set(opts.branchIds) : null;
  const latest = new Map<number, Backup>();

  for (const b of backups) {
    if (b.kind !== "uzaverka" && b.kind !== "close") continue;
    if (opts?.licenseKey && b.license_key !== opts.licenseKey) continue;
    if (branchFilter && !branchFilter.has(b.branch_id)) continue;

    const cd = extractCloseDate(b);
    if (cd !== closeDate) continue;

    const ex = latest.get(b.branch_id);
    if (!ex || new Date(b.uploaded_at).getTime() > new Date(ex.uploaded_at).getTime()) {
      latest.set(b.branch_id, b);
    }
  }

  return [...latest.values()];
}

export function buildHourlyChartBucketsFromSales(
  sales: HourlySalePoint[],
  from: string,
  to: string
): ChartBucket[] {
  const hours = Array.from({ length: 24 }, (_, i) => i);
  const buckets = new Map<number, ChartBucket>();
  for (const h of hours) {
    buckets.set(h, {
      key: `h${h}`,
      label: `${String(h).padStart(2, "0")}:00`,
      byBranch: new Map(),
      total: 0,
    });
  }
  for (const sale of sales) {
    if (!saleMatchesDateRange(sale.timestamp, from, to)) continue;
    const h = pragueHourFromTimestamp(sale.timestamp);
    const bucket = buckets.get(h);
    if (!bucket) continue;
    bucket.byBranch.set(
      sale.branchId,
      (bucket.byBranch.get(sale.branchId) ?? 0) + sale.revenue
    );
    bucket.total += sale.revenue;
  }
  return hours.map((h) => buckets.get(h)!);
}

/** Latest uzaverka per branch + close_date. branchIds: null = all, [] = none */
export function parseClosureRecords(
  backups: Backup[],
  opts?: { licenseKey?: string; branchIds?: number[] | null }
): ClosureRecord[] {
  if (opts?.branchIds != null && opts.branchIds.length === 0) return [];

  const branchFilter =
    opts?.branchIds && opts.branchIds.length > 0 ? new Set(opts.branchIds) : null;
  const latest = new Map<string, Backup>();

  for (const b of backups) {
    if (b.kind !== "uzaverka" && b.kind !== "close") continue;
    if (opts?.licenseKey && b.license_key !== opts.licenseKey) continue;
    if (branchFilter && !branchFilter.has(b.branch_id)) continue;

    const meta = b.metadata_json as UzaverkaMeta | null;
    const closeDate = extractCloseDate(b);
    if (!closeDate) continue;

    const key = `${b.branch_id}|${closeDate}`;
    const ex = latest.get(key);
    if (!ex || new Date(b.uploaded_at).getTime() > new Date(ex.uploaded_at).getTime()) {
      latest.set(key, b);
    }
  }

  return [...latest.values()].map((b) => {
    const meta = b.metadata_json as UzaverkaMeta;
    const closeDate = extractCloseDate(b)!;
    const rz = meta?.real_zisk == null ? null : Number(meta.real_zisk);
    return {
      branchId: b.branch_id,
      branchCode: b.branch_code || `#${b.branch_id}`,
      branchName: b.branch_name || `Pobočka ${b.branch_id}`,
      closeDate,
      uploadedAt: b.uploaded_at,
      revenue: Number(meta?.total_revenue) || 0,
      profit: Number.isFinite(rz) ? rz : null,
      txCount: Number(meta?.tx_count) || 0,
    };
  });
}

export function filterRecordsInRange(
  records: ClosureRecord[],
  from: string,
  to: string
): ClosureRecord[] {
  return records.filter((r) => r.closeDate >= from && r.closeDate <= to);
}

export function sumRecords(records: ClosureRecord[]): {
  revenue: number;
  profit: number;
  profitKnown: boolean;
  tx: number;
  branches: Set<number>;
} {
  let revenue = 0;
  let profit = 0;
  let profitKnown = false;
  let tx = 0;
  const branches = new Set<number>();
  for (const r of records) {
    revenue += r.revenue;
    tx += r.txCount;
    branches.add(r.branchId);
    if (r.profit != null) {
      profit += r.profit;
      profitKnown = true;
    }
  }
  return { revenue, profit, profitKnown, tx, branches };
}

export function buildChartBuckets(
  records: ClosureRecord[],
  granularity: ChartGranularity,
  from: string,
  to: string
): ChartBucket[] {
  const filtered = filterRecordsInRange(records, from, to);

  if (granularity === "hour") {
    // Intradenní graf používá transakce z .wsbak — viz buildHourlyChartBucketsFromSales.
    return buildHourlyChartBucketsFromSales([], from, to);
  }

  if (granularity === "month") {
    const months = monthsInRange(from, to);
    const buckets = new Map<string, ChartBucket>();
    for (const ym of months) {
      buckets.set(ym, {
        key: ym,
        label: monthLabel(ym),
        byBranch: new Map(),
        total: 0,
      });
    }
    for (const r of filtered) {
      const ym = r.closeDate.slice(0, 7);
      const bucket = buckets.get(ym);
      if (!bucket) continue;
      bucket.byBranch.set(r.branchId, (bucket.byBranch.get(r.branchId) ?? 0) + r.revenue);
      bucket.total += r.revenue;
    }
    return months.map((ym) => buckets.get(ym)!);
  }

  // daily
  const days = datesInRange(from, to);
  const buckets = new Map<string, ChartBucket>();
  for (const d of days) {
    const { dm } = dayLabel(d);
    buckets.set(d, { key: d, label: dm, byBranch: new Map(), total: 0 });
  }
  for (const r of filtered) {
    const bucket = buckets.get(r.closeDate);
    if (!bucket) continue;
    bucket.byBranch.set(r.branchId, (bucket.byBranch.get(r.branchId) ?? 0) + r.revenue);
    bucket.total += r.revenue;
  }
  return days.map((d) => buckets.get(d)!);
}

export function branchDataKey(branchId: number): string {
  return `b_${branchId}`;
}

export interface RechartsChartOutput {
  rows: Record<string, string | number>[];
  branchIds: number[];
  stacked: boolean;
  colors: Record<string, string>;
  labels: Record<string, string>;
}

export function bucketsToRechartsData(
  buckets: ChartBucket[],
  branchMeta: Map<number, BranchInfo>,
  stacked: boolean
): RechartsChartOutput {
  const branchIdSet = new Set<number>();
  for (const b of buckets) {
    for (const id of b.byBranch.keys()) branchIdSet.add(id);
  }
  const branchIds = [...branchIdSet].sort((a, c) => a - c);

  const colors: Record<string, string> = {};
  const labels: Record<string, string> = {};

  branchIds.forEach((id, i) => {
    const key = branchDataKey(id);
    const info = branchMeta.get(id);
    labels[key] = info?.code || `#${id}`;
    colors[key] = stacked
      ? BRANCH_PALETTE[i % BRANCH_PALETTE.length]
      : EMERALD_DARK;
  });

  const rows = buckets.map((bucket) => {
    const row: Record<string, string | number> = {
      key: bucket.key,
      label: bucket.label,
      total: bucket.total,
    };
    if (stacked && branchIds.length > 1) {
      for (const id of branchIds) {
        row[branchDataKey(id)] = bucket.byBranch.get(id) ?? 0;
      }
    } else {
      row.revenue = bucket.total;
    }
    return row;
  });

  return {
    rows,
    branchIds,
    stacked: stacked && branchIds.length > 1,
    colors,
    labels,
  };
}

// --- legacy helpers kept for subadmin-turnover ---

export function aggregateUzaverkyBackups(
  backups: Backup[],
  filter?: { licenseKey?: string; branchId?: number }
): Map<string, DayAggregate> {
  const records = parseClosureRecords(backups, {
    licenseKey: filter?.licenseKey,
    branchIds: filter?.branchId != null ? [filter.branchId] : null,
  });
  const byDate = new Map<string, DayAggregate>();
  for (const r of records) {
    const cur =
      byDate.get(r.closeDate) ??
      { revenue: 0, profit: 0, profitBranches: new Set<number>(), tx: 0, branches: new Set<number>() };
    cur.revenue += r.revenue;
    cur.tx += r.txCount;
    if (r.profit != null) {
      cur.profit += r.profit;
      cur.profitBranches.add(r.branchId);
    }
    cur.branches.add(r.branchId);
    byDate.set(r.closeDate, cur);
  }
  return byDate;
}

export function aggregateByWeek(byDate: Map<string, DayAggregate>): Map<string, DayAggregate> {
  const byWeek = new Map<string, DayAggregate>();
  for (const [dateStr, day] of byDate) {
    const wk = weekStartKey(dateStr);
    const cur =
      byWeek.get(wk) ??
      { revenue: 0, profit: 0, profitBranches: new Set<number>(), tx: 0, branches: new Set<number>() };
    cur.revenue += day.revenue;
    cur.profit += day.profit;
    cur.tx += day.tx;
    for (const id of day.branches) cur.branches.add(id);
    for (const id of day.profitBranches) cur.profitBranches.add(id);
    byWeek.set(wk, cur);
  }
  return byWeek;
}
