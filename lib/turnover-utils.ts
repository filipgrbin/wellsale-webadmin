import type { Backup } from "@/lib/api";
import {
  posStampDate,
  posStampInDayRange,
  pragueHourFromTimestamp,
} from "@/lib/transaction-timestamp";

export interface UzaverkaMeta {
  close_id?: number;
  tx_count?: number;
  close_date?: string;
  total_revenue?: number;
  real_zisk?: number;
  cash_total?: number;
  qr_total?: number;
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
  cash: number;
  qr: number;
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
  byBranchCash: Map<number, number>;
  byBranchQr: Map<number, number>;
  total: number;
  cash: number;
  qr: number;
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

/** Normalize to YYYY-MM-DD. Prefers canonical POS stamp date part. */
export function normalizeCloseDate(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const s = String(raw).trim();
  if (!s) return null;
  const fromPos = posStampDate(s);
  if (fromPos) return fromPos;
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

/** @see pragueHourFromTimestamp in transaction-timestamp.ts */
export { pragueHourFromTimestamp } from "@/lib/transaction-timestamp";

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
  /** cash | qr | other */
  payKind?: "cash" | "qr" | "other";
}

export function classifyPaymentKind(platbaTyp: string | null | undefined): "cash" | "qr" | "other" {
  const t = String(platbaTyp || "").toLowerCase();
  if (!t) return "other";
  if (t.includes("hotov") || t.includes("cash") || t === "h") return "cash";
  if (
    t.includes("qr") ||
    t.includes("kart") ||
    t.includes("card") ||
    t.includes("bezhot") ||
    t.includes("transfer")
  ) {
    return "qr";
  }
  return "other";
}

export function saleMatchesDateRange(
  timestamp: string,
  from: string,
  to: string,
  fallbackDate?: string
): boolean {
  if (posStampInDayRange(timestamp, from, to)) return true;
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
      byBranchCash: new Map(),
      byBranchQr: new Map(),
      total: 0,
      cash: 0,
      qr: 0,
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
    const kind = sale.payKind ?? "other";
    if (kind === "qr") {
      bucket.qr += sale.revenue;
      bucket.byBranchQr.set(
        sale.branchId,
        (bucket.byBranchQr.get(sale.branchId) ?? 0) + sale.revenue
      );
    } else {
      // cash + other → darker shade so the column stays filled
      bucket.cash += sale.revenue;
      bucket.byBranchCash.set(
        sale.branchId,
        (bucket.byBranchCash.get(sale.branchId) ?? 0) + sale.revenue
      );
    }
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
    const cash = Number(meta?.cash_total) || 0;
    const qr = Number(meta?.qr_total) || 0;
    const revenue = Number(meta?.total_revenue) || cash + qr || 0;
    return {
      branchId: b.branch_id,
      branchCode: b.branch_code || `#${b.branch_id}`,
      branchName: b.branch_name || `Pobočka ${b.branch_id}`,
      closeDate,
      uploadedAt: b.uploaded_at,
      revenue,
      cash,
      qr,
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
  cash: number;
  qr: number;
  profit: number;
  profitKnown: boolean;
  tx: number;
  branches: Set<number>;
} {
  let revenue = 0;
  let cash = 0;
  let qr = 0;
  let profit = 0;
  let profitKnown = false;
  let tx = 0;
  const branches = new Set<number>();
  for (const r of records) {
    revenue += r.revenue;
    let c = r.cash;
    let q = r.qr;
    if (c + q === 0 && r.revenue > 0) c = r.revenue;
    cash += c;
    qr += q;
    tx += r.txCount;
    branches.add(r.branchId);
    if (r.profit != null) {
      profit += r.profit;
      profitKnown = true;
    }
  }
  return { revenue, cash, qr, profit, profitKnown, tx, branches };
}

function emptyBucket(key: string, label: string): ChartBucket {
  return {
    key,
    label,
    byBranch: new Map(),
    byBranchCash: new Map(),
    byBranchQr: new Map(),
    total: 0,
    cash: 0,
    qr: 0,
  };
}

function addRecordToBucket(bucket: ChartBucket, r: ClosureRecord) {
  let cash = r.cash;
  let qr = r.qr;
  // If POS metadata has no payment split, keep the column filled (all as cash shade).
  if (cash + qr === 0 && r.revenue > 0) cash = r.revenue;
  bucket.byBranch.set(r.branchId, (bucket.byBranch.get(r.branchId) ?? 0) + r.revenue);
  bucket.byBranchCash.set(r.branchId, (bucket.byBranchCash.get(r.branchId) ?? 0) + cash);
  bucket.byBranchQr.set(r.branchId, (bucket.byBranchQr.get(r.branchId) ?? 0) + qr);
  bucket.total += r.revenue;
  bucket.cash += cash;
  bucket.qr += qr;
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
      buckets.set(ym, emptyBucket(ym, monthLabel(ym)));
    }
    for (const r of filtered) {
      const ym = r.closeDate.slice(0, 7);
      const bucket = buckets.get(ym);
      if (!bucket) continue;
      addRecordToBucket(bucket, r);
    }
    return months.map((ym) => buckets.get(ym)!);
  }

  // daily
  const days = datesInRange(from, to);
  const buckets = new Map<string, ChartBucket>();
  for (const d of days) {
    const { dm } = dayLabel(d);
    buckets.set(d, emptyBucket(d, dm));
  }
  for (const r of filtered) {
    const bucket = buckets.get(r.closeDate);
    if (!bucket) continue;
    addRecordToBucket(bucket, r);
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
  // Color distinction is only between stores — never cash vs QR.
  const multiBranch = stacked && branchIds.length > 1;

  const colors: Record<string, string> = {};
  const labels: Record<string, string> = {};

  if (multiBranch) {
    branchIds.forEach((id, i) => {
      const base = BRANCH_PALETTE[i % BRANCH_PALETTE.length];
      const info = branchMeta.get(id);
      const code = info?.code || `#${id}`;
      labels[branchDataKey(id)] = code;
      colors[branchDataKey(id)] = base;
    });
  } else {
    colors.revenue = EMERALD_DARK;
    labels.revenue = "Tržby";
    // Single store still gets its palette color when known
    if (branchIds.length === 1) {
      const id = branchIds[0];
      const info = branchMeta.get(id);
      colors.revenue = BRANCH_PALETTE[0];
      labels.revenue = info?.code || "Tržby";
    }
  }

  const rows = buckets.map((bucket) => {
    const row: Record<string, string | number> = {
      key: bucket.key,
      label: bucket.label,
      total: bucket.total,
      cash: bucket.cash,
      qr: bucket.qr,
      revenue: bucket.total,
    };
    if (multiBranch) {
      for (const id of branchIds) {
        row[branchDataKey(id)] = bucket.byBranch.get(id) ?? 0;
      }
    }
    return row;
  });

  return {
    rows,
    branchIds,
    stacked: multiBranch,
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
