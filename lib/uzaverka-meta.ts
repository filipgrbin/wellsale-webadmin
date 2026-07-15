/** CZK denominations used in till counts (coins + bills). */
export const TILL_DENOMINATIONS = [
  1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000,
] as const;

export type TillDenomination = (typeof TILL_DENOMINATIONS)[number];

export interface TillSnapshot {
  total?: number;
  skipped?: boolean;
  counts?: Record<string, number>;
  at?: string;
  actor?: string;
}

export interface TillMeta {
  start?: TillSnapshot;
  end?: TillSnapshot;
}

export interface UzaverkaMetadata {
  close_id?: number;
  close_date?: string;
  total_revenue?: number;
  tx_count?: number;
  cash_total?: number;
  qr_total?: number;
  total_items?: number;
  is_auto?: number;
  real_zisk?: number;
  encrypted?: number;
  app_version?: string;
  till?: TillMeta;
  cashier?: string;
  cashier_name?: string;
  operator?: string;
  operator_name?: string;
  logged_user?: string;
  user_name?: string;
}

export function asUzaverkaMetadata(raw: unknown): UzaverkaMetadata | null {
  if (!raw || typeof raw !== "object") return null;
  return raw as UzaverkaMetadata;
}

export function hasTillData(meta: unknown): boolean {
  const m = asUzaverkaMetadata(meta);
  if (!m?.till) return false;
  return Boolean(m.till.start || m.till.end);
}

export function resolveCashierName(meta: unknown): string | null {
  const parsed = asUzaverkaMetadata(meta);
  if (!parsed) return null;
  const direct =
    parsed.cashier_name ||
    parsed.cashier ||
    parsed.operator_name ||
    parsed.operator ||
    parsed.logged_user ||
    parsed.user_name;
  if (direct && String(direct).trim()) return String(direct).trim();
  const fromTill = parsed.till?.end?.actor || parsed.till?.start?.actor;
  if (fromTill && String(fromTill).trim()) return String(fromTill).trim();
  return null;
}

export function tillCountsTotal(counts: Record<string, number> | undefined): number {
  if (!counts) return 0;
  let sum = 0;
  for (const denom of TILL_DENOMINATIONS) {
    const n = Number(counts[String(denom)] ?? 0);
    if (Number.isFinite(n) && n > 0) sum += denom * n;
  }
  return sum;
}

export function resolveTillTotal(snapshot: TillSnapshot | undefined): number {
  if (!snapshot) return 0;
  if (snapshot.skipped) return 0;
  const explicit = Number(snapshot.total);
  if (Number.isFinite(explicit) && explicit >= 0) return explicit;
  return tillCountsTotal(snapshot.counts);
}

export function mergeUzaverkaMetadata(...sources: unknown[]): UzaverkaMetadata | null {
  let out: UzaverkaMetadata | null = null;
  for (const src of sources) {
    const m = asUzaverkaMetadata(src);
    if (!m) continue;
    out = { ...out, ...m, till: m.till ?? out?.till };
  }
  return out;
}
