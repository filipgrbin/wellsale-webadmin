import type { ClosureRecord, HourlySalePoint } from "@/lib/turnover-utils";
import { dayLabel, formatCurrency, pragueHourFromTimestamp } from "@/lib/turnover-utils";

export interface PeakSlot {
  key: string;
  label: string;
  revenue: number;
  txCount: number;
}

export interface ProductRank {
  name: string;
  quantity: number;
}

export interface PeriodInsights {
  bestDay: PeakSlot | null;
  quietestDay: PeakSlot | null;
  bestHour: PeakSlot | null;
  quietestHour: PeakSlot | null;
  avgTicket: number | null;
  totalRevenue: number;
  totalTx: number;
  activeDays: number;
  products: ProductRank[];
}

function formatHourLabel(hour: number): string {
  const h = ((hour % 24) + 24) % 24;
  return `${String(h).padStart(2, "0")}:00–${String((h + 1) % 24).padStart(2, "0")}:00`;
}

function formatDayLabel(dateStr: string): string {
  const { dow, dm } = dayLabel(dateStr);
  return `${dow} ${dm} (${dateStr})`;
}

/** Aggregate closure records by calendar day (sum across branches). */
export function aggregateRevenueByDay(records: ClosureRecord[]): PeakSlot[] {
  const map = new Map<string, { revenue: number; txCount: number }>();
  for (const r of records) {
    const cur = map.get(r.closeDate) ?? { revenue: 0, txCount: 0 };
    cur.revenue += r.revenue;
    cur.txCount += r.txCount;
    map.set(r.closeDate, cur);
  }
  return [...map.entries()]
    .map(([key, v]) => ({
      key,
      label: formatDayLabel(key),
      revenue: v.revenue,
      txCount: v.txCount,
    }))
    .sort((a, b) => a.key.localeCompare(b.key));
}

/** Aggregate sale points by clock hour (0–23). */
export function aggregateRevenueByHour(sales: HourlySalePoint[]): PeakSlot[] {
  const hours = Array.from({ length: 24 }, (_, h) => ({
    key: `h${h}`,
    label: formatHourLabel(h),
    revenue: 0,
    txCount: 0,
  }));
  for (const sale of sales) {
    const h = pragueHourFromTimestamp(sale.timestamp);
    const slot = hours[h];
    if (!slot) continue;
    slot.revenue += sale.revenue;
    slot.txCount += 1;
  }
  return hours;
}

function pickBestQuietest(slots: PeakSlot[], onlyWithActivity: boolean): {
  best: PeakSlot | null;
  quietest: PeakSlot | null;
} {
  const candidates = onlyWithActivity
    ? slots.filter((s) => s.revenue > 0 || s.txCount > 0)
    : slots;
  if (candidates.length === 0) return { best: null, quietest: null };

  let best = candidates[0];
  let quietest = candidates[0];
  for (const s of candidates) {
    if (s.revenue > best.revenue) best = s;
    else if (s.revenue === best.revenue && s.txCount > best.txCount) best = s;
    if (s.revenue < quietest.revenue) quietest = s;
    else if (s.revenue === quietest.revenue && s.txCount < quietest.txCount) quietest = s;
  }
  return { best, quietest };
}

export function mergeProductCounts(
  ...sources: Array<Record<string, number> | null | undefined>
): ProductRank[] {
  const totals: Record<string, number> = {};
  for (const src of sources) {
    if (!src) continue;
    for (const [name, qty] of Object.entries(src)) {
      const n = Number(qty);
      if (!name.trim() || !Number.isFinite(n) || n === 0) continue;
      totals[name] = (totals[name] || 0) + n;
    }
  }
  return Object.entries(totals)
    .map(([name, quantity]) => ({ name, quantity }))
    .sort((a, b) => b.quantity - a.quantity || a.name.localeCompare(b.name, "cs"));
}

export function productsFromLineItems(
  items: Array<{ nazev?: string; name?: string; mnozstvi?: number; quantity?: number }>
): ProductRank[] {
  const totals: Record<string, number> = {};
  for (const item of items) {
    const name = String(item.nazev || item.name || "").trim();
    const qty = Number(item.mnozstvi ?? item.quantity ?? 0);
    if (!name || !Number.isFinite(qty) || qty === 0) continue;
    totals[name] = (totals[name] || 0) + qty;
  }
  return Object.entries(totals)
    .map(([name, quantity]) => ({ name, quantity }))
    .sort((a, b) => b.quantity - a.quantity || a.name.localeCompare(b.name, "cs"));
}

/** Build insights for the selected turnover period. */
export function buildPeriodInsights(opts: {
  records: ClosureRecord[];
  hourlySales?: HourlySalePoint[] | null;
  products?: ProductRank[];
}): PeriodInsights {
  const { records, hourlySales, products = [] } = opts;
  const days = aggregateRevenueByDay(records);
  const { best: bestDay, quietest: quietestDay } = pickBestQuietest(days, true);

  const hours = hourlySales?.length ? aggregateRevenueByHour(hourlySales) : [];
  const { best: bestHour, quietest: quietestHour } = pickBestQuietest(hours, true);

  let totalRevenue = 0;
  let totalTx = 0;
  for (const r of records) {
    totalRevenue += r.revenue;
    totalTx += r.txCount;
  }

  return {
    bestDay,
    quietestDay,
    bestHour,
    quietestHour,
    avgTicket: totalTx > 0 ? totalRevenue / totalTx : null,
    totalRevenue,
    totalTx,
    activeDays: days.filter((d) => d.revenue > 0 || d.txCount > 0).length,
    products,
  };
}

/** Insights for a single decrypted uzaverka (one business day). */
export function buildUzaverkaInsights(opts: {
  sales: Array<{ datum?: string; celkem?: number }>;
  products: ProductRank[];
  totalRevenue: number;
  totalTx: number;
}): PeriodInsights {
  const sales: HourlySalePoint[] = opts.sales
    .filter((s) => s.datum?.trim())
    .map((s) => ({
      branchId: 0,
      timestamp: String(s.datum),
      revenue: Number(s.celkem) || 0,
    }));

  const hours = aggregateRevenueByHour(sales);
  const { best: bestHour, quietest: quietestHour } = pickBestQuietest(hours, true);

  return {
    bestDay: null,
    quietestDay: null,
    bestHour,
    quietestHour,
    avgTicket: opts.totalTx > 0 ? opts.totalRevenue / opts.totalTx : null,
    totalRevenue: opts.totalRevenue,
    totalTx: opts.totalTx,
    activeDays: 1,
    products: opts.products,
  };
}

export function formatInsightRevenue(amount: number): string {
  return formatCurrency(amount);
}

/** Read perProduct map from backup metadata_json if POS included it. */
export function perProductFromMetadata(meta: unknown): Record<string, number> | null {
  if (!meta || typeof meta !== "object") return null;
  const record = meta as Record<string, unknown>;
  const direct = record.perProduct ?? record.per_product;
  if (direct && typeof direct === "object" && !Array.isArray(direct)) {
    return direct as Record<string, number>;
  }
  const payload = record.payload_json;
  if (payload && typeof payload === "object" && !Array.isArray(payload)) {
    const nested = (payload as Record<string, unknown>).perProduct
      ?? (payload as Record<string, unknown>).per_product;
    if (nested && typeof nested === "object" && !Array.isArray(nested)) {
      return nested as Record<string, number>;
    }
  }
  return null;
}
