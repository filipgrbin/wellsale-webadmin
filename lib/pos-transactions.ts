import {
  getPosTransactions,
  type PosTransaction,
  type PosTxItem,
  type PosTransactionsQuery,
} from "@/lib/api";
import {
  classifyPaymentKind,
  datesInRange,
  dayLabel,
  formatCurrency,
  monthLabel,
  monthsInRange,
  normalizeCloseDate,
  type ChartBucket,
  type ChartGranularity,
  type ClosureRecord,
  type HourlySalePoint,
  type RangePreset,
  getEffectiveDateRange,
} from "@/lib/turnover-utils";
import type { ProductRank } from "@/lib/turnover-insights";
import { mergeProductCounts } from "@/lib/turnover-insights";

export const POS_PAGE_LIMIT = 1000;
/** Safety cap when paging a large range. */
export const POS_MAX_PAGES = 40;

export function txKey(tx: PosTransaction): string {
  return `${tx.branch_id}:${tx.local_id}`;
}

export function getTxItems(tx: PosTransaction): PosTxItem[] {
  if (Array.isArray(tx.items)) return tx.items;
  if (typeof tx.items_json === "string") {
    try {
      const parsed = JSON.parse(tx.items_json);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  if (Array.isArray(tx.items_json)) return tx.items_json;
  return [];
}

export function itemName(item: PosTxItem): string {
  const name = String(
    item.name_snapshot || item.product_name || item.name || ""
  ).trim();
  if (name) return name;
  if (item.product_id != null) return `Produkt #${item.product_id}`;
  return "Neznámý produkt";
}

export function itemQty(item: PosTxItem): number {
  const n = Number(item.qty ?? item.quantity ?? 0);
  return Number.isFinite(n) ? n : 0;
}

/** Wall-clock local TEXT bounds for a calendar day (POS created_at). */
export function dayWallClockBounds(day: string): { from: string; to: string } {
  return {
    from: `${day} 00:00:00`,
    to: `${day} 23:59:59`,
  };
}

/** Always use absolute from/to windows (never relative hours) for chart presets. */
export function rangeToWallClock(
  preset: RangePreset,
  customFrom: string,
  customTo: string
): { from: string; to: string; dayFrom: string; dayTo: string } {
  const { from: dayFrom, to: dayTo } = getEffectiveDateRange(preset, customFrom, customTo);
  return {
    dayFrom,
    dayTo,
    from: `${dayFrom} 00:00:00`,
    to: `${dayTo} 23:59:59`,
  };
}

export function txCreatedDay(tx: PosTransaction): string | null {
  return normalizeCloseDate(tx.created_at);
}

export function sortTxNewestFirst(a: PosTransaction, b: PosTransaction): number {
  const ca = String(a.created_at || "");
  const cb = String(b.created_at || "");
  if (ca !== cb) return cb.localeCompare(ca);
  return (b.local_id || 0) - (a.local_id || 0);
}

/** Merge by branch_id+local_id; newer updated_at wins. */
export function mergeTransactions(
  existing: PosTransaction[],
  incoming: PosTransaction[]
): PosTransaction[] {
  const map = new Map<string, PosTransaction>();
  for (const tx of existing) map.set(txKey(tx), tx);
  for (const tx of incoming) {
    const k = txKey(tx);
    const prev = map.get(k);
    if (!prev) {
      map.set(k, tx);
      continue;
    }
    const pu = prev.updated_at ? Date.parse(prev.updated_at) : 0;
    const nu = tx.updated_at ? Date.parse(tx.updated_at) : 0;
    if (!Number.isFinite(pu) || (Number.isFinite(nu) && nu >= pu)) {
      map.set(k, tx);
    }
  }
  return [...map.values()].filter((t) => !t.deleted_at).sort(sortTxNewestFirst);
}

export function filterTxByBranches(
  txs: PosTransaction[],
  branchIds: number[] | null
): PosTransaction[] {
  if (!branchIds || branchIds.length === 0) return txs;
  const set = new Set(branchIds);
  return txs.filter((t) => set.has(t.branch_id));
}

export function sumTxRevenue(txs: PosTransaction[]): {
  revenue: number;
  cash: number;
  qr: number;
  txCount: number;
  branches: Set<number>;
} {
  let revenue = 0;
  let cash = 0;
  let qr = 0;
  const branches = new Set<number>();
  for (const tx of txs) {
    if (tx.deleted_at) continue;
    const total = Number(tx.total) || 0;
    revenue += total;
    branches.add(tx.branch_id);
    const kind = classifyPaymentKind(tx.payment_method);
    if (kind === "qr") qr += total;
    else cash += total; // cash + other → hotovost column
  }
  return { revenue, cash, qr, txCount: txs.filter((t) => !t.deleted_at).length, branches };
}

export function productsFromPosTransactions(txs: PosTransaction[]): ProductRank[] {
  const totals: Record<string, number> = {};
  for (const tx of txs) {
    if (tx.deleted_at) continue;
    for (const item of getTxItems(tx)) {
      const name = itemName(item);
      const qty = itemQty(item);
      if (!name || !Number.isFinite(qty) || qty === 0) continue;
      totals[name] = (totals[name] || 0) + qty;
    }
  }
  return mergeProductCounts(totals);
}

export function toHourlySalePoints(txs: PosTransaction[]): HourlySalePoint[] {
  return txs
    .filter((t) => !t.deleted_at && t.created_at)
    .map((t) => ({
      branchId: t.branch_id,
      timestamp: t.created_at,
      revenue: Number(t.total) || 0,
      payKind: classifyPaymentKind(t.payment_method),
    }));
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

function addTxToBucket(bucket: ChartBucket, tx: PosTransaction) {
  const total = Number(tx.total) || 0;
  const kind = classifyPaymentKind(tx.payment_method);
  const cash = kind === "qr" ? 0 : total;
  const qr = kind === "qr" ? total : 0;
  bucket.byBranch.set(tx.branch_id, (bucket.byBranch.get(tx.branch_id) ?? 0) + total);
  bucket.byBranchCash.set(
    tx.branch_id,
    (bucket.byBranchCash.get(tx.branch_id) ?? 0) + cash
  );
  bucket.byBranchQr.set(tx.branch_id, (bucket.byBranchQr.get(tx.branch_id) ?? 0) + qr);
  bucket.total += total;
  bucket.cash += cash;
  bucket.qr += qr;
}

/** Build chart buckets from live POS rows (day / month). Hour uses buildHourlyChartBucketsFromSales. */
export function buildPosChartBuckets(
  txs: PosTransaction[],
  granularity: ChartGranularity,
  dayFrom: string,
  dayTo: string
): ChartBucket[] {
  if (granularity === "month") {
    const months = monthsInRange(dayFrom, dayTo);
    const buckets = new Map<string, ChartBucket>();
    for (const ym of months) buckets.set(ym, emptyBucket(ym, monthLabel(ym)));
    for (const tx of txs) {
      if (tx.deleted_at) continue;
      const d = txCreatedDay(tx);
      if (!d || d < dayFrom || d > dayTo) continue;
      const ym = d.slice(0, 7);
      const bucket = buckets.get(ym);
      if (bucket) addTxToBucket(bucket, tx);
    }
    return months.map((ym) => buckets.get(ym)!);
  }

  // daily (hour handled elsewhere)
  const days = datesInRange(dayFrom, dayTo);
  const buckets = new Map<string, ChartBucket>();
  for (const d of days) {
    const { dm } = dayLabel(d);
    buckets.set(d, emptyBucket(d, dm));
  }
  for (const tx of txs) {
    if (tx.deleted_at) continue;
    const d = txCreatedDay(tx);
    if (!d || d < dayFrom || d > dayTo) continue;
    const bucket = buckets.get(d);
    if (bucket) addTxToBucket(bucket, tx);
  }
  return days.map((d) => buckets.get(d)!);
}

export function formatPaymentLabel(method: string | null | undefined): string {
  const kind = classifyPaymentKind(method);
  if (kind === "cash") return "Hotovost";
  if (kind === "qr") return "QR";
  return method?.trim() || "Jiné";
}

/** Aggregate POS txs into ClosureRecord-shaped rows (one per branch × day) for insights. */
export function posTxsToDayRecords(txs: PosTransaction[]): ClosureRecord[] {
  const map = new Map<string, ClosureRecord>();
  for (const tx of txs) {
    if (tx.deleted_at) continue;
    const day = txCreatedDay(tx);
    if (!day) continue;
    const key = `${tx.branch_id}|${day}`;
    const total = Number(tx.total) || 0;
    const kind = classifyPaymentKind(tx.payment_method);
    const cur = map.get(key);
    if (!cur) {
      map.set(key, {
        branchId: tx.branch_id,
        branchCode: `#${tx.branch_id}`,
        branchName: `Pobočka ${tx.branch_id}`,
        closeDate: day,
        uploadedAt: tx.updated_at || tx.created_at,
        revenue: total,
        cash: kind === "qr" ? 0 : total,
        qr: kind === "qr" ? total : 0,
        profit: null,
        txCount: 1,
      });
    } else {
      cur.revenue += total;
      cur.txCount += 1;
      if (kind === "qr") cur.qr += total;
      else cur.cash += total;
    }
  }
  return [...map.values()];
}

export function formatTxTime(createdAt: string): string {
  const s = String(createdAt || "").trim();
  // "2026-07-21 14:32:01" or ISO
  const m = s.match(/(\d{2}):(\d{2})/);
  if (m) return `${m[1]}:${m[2]}`;
  try {
    return new Intl.DateTimeFormat("cs-CZ", {
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "Europe/Prague",
    }).format(new Date(s));
  } catch {
    return s.slice(11, 16) || s;
  }
}

export function itemsSummary(tx: PosTransaction, max = 3): string {
  const items = getTxItems(tx);
  if (!items.length) return "—";
  const parts = items.slice(0, max).map((i) => {
    const q = itemQty(i);
    const n = itemName(i);
    return q !== 1 ? `${n} ×${q}` : n;
  });
  const more = items.length > max ? ` +${items.length - max}` : "";
  return parts.join(", ") + more;
}

export { formatCurrency };

/**
 * Fetch all transactions in a wall-clock window, paging when hit POS_PAGE_LIMIT.
 * Uses descending created_at: next page narrows `to` to oldest seen created_at.
 */
export async function fetchAllPosTransactions(
  scope: { licenseKey?: string; branchId?: number },
  from: string,
  to: string,
  opts?: { maxPages?: number; signal?: AbortSignal }
): Promise<{ transactions: PosTransaction[]; nextSince: string | null; truncated: boolean }> {
  const maxPages = opts?.maxPages ?? POS_MAX_PAGES;
  let pageTo = to;
  let all: PosTransaction[] = [];
  let nextSince: string | null = null;
  let truncated = false;

  for (let page = 0; page < maxPages; page++) {
    const query: PosTransactionsQuery = {
      ...scope,
      from,
      to: pageTo,
      limit: POS_PAGE_LIMIT,
    };
    const res = await getPosTransactions(query);
    if (opts?.signal?.aborted) break;
    nextSince = res.nextSince || nextSince;
    const batch = res.transactions || [];
    if (batch.length === 0) break;

    all = mergeTransactions(all, batch);

    if (batch.length < POS_PAGE_LIMIT) break;

    // Oldest in this page (API returns DESC) — exclude it on next page
    const oldest = batch[batch.length - 1];
    const oldestAt = String(oldest?.created_at || "").trim();
    if (!oldestAt || oldestAt <= from) {
      truncated = true;
      break;
    }
    pageTo = tickDownWallClock(oldestAt);
    if (pageTo < from) {
      truncated = true;
      break;
    }
    if (page === maxPages - 1) truncated = true;
  }

  return {
    transactions: all.filter((t) => !t.deleted_at).sort(sortTxNewestFirst),
    nextSince,
    truncated,
  };
}

/** Decrement last second of a wall-clock / ISO-ish timestamp string. */
function tickDownWallClock(s: string): string {
  // Prefer "YYYY-MM-DD HH:MM:SS"
  const m = s.match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}):(\d{2}):(\d{2})/);
  if (m) {
    const d = new Date(`${m[1]}T${m[2]}:${m[3]}:${m[4]}`);
    if (!Number.isNaN(d.getTime())) {
      d.setSeconds(d.getSeconds() - 1);
      const pad = (n: number) => String(n).padStart(2, "0");
      return `${m[1]} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
    }
  }
  const t = Date.parse(s);
  if (Number.isFinite(t)) {
    return new Date(t - 1000).toISOString();
  }
  return s;
}

/** One page of older transactions before `beforeCreatedAt` (exclusive-ish via to=). */
export async function fetchOlderPosTransactions(
  scope: { licenseKey?: string; branchId?: number },
  dayFrom: string,
  beforeCreatedAt: string,
  limit = 50
): Promise<PosTransaction[]> {
  const { from } = dayWallClockBounds(dayFrom);
  const to = tickDownWallClock(beforeCreatedAt);
  if (to < from) return [];
  const res = await getPosTransactions({
    ...scope,
    from,
    to,
    limit,
  });
  return (res.transactions || []).filter((t) => !t.deleted_at);
}
