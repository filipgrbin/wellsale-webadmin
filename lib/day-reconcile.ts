import {
  getBackups,
  getPosTransactions,
  type Backup,
  type PosTransaction,
} from "@/lib/api";
import {
  fetchAllPosTransactions,
  sumTxRevenue,
} from "@/lib/pos-transactions";
import {
  classifyPaymentKind,
  extractCloseDate,
  formatCurrency,
  lastNDays,
  pragueDate,
} from "@/lib/turnover-utils";

/** Absolute Kč tolerance for "ok". */
export const REVENUE_OK_ABS = 1;
/** Relative tolerance (0.001 = 0.1 %). */
export const REVENUE_OK_REL = 0.001;
/** Soft warning band above ok (absolute Kč). */
export const REVENUE_WARN_ABS = 100;

export type DayMatchStatus =
  | "ok"
  | "warning"
  | "error"
  | "open"
  | "no_live"
  | "unavailable";

export interface DaySideTotals {
  revenue: number;
  txCount: number;
  cash: number;
  qr: number;
}

export interface DayCompareResult {
  status: DayMatchStatus;
  closeDate: string;
  branchId: number;
  backupId?: number;
  branchCode?: string;
  branchName?: string;
  uzaverka: DaySideTotals | null;
  live: DaySideTotals;
  /** live.revenue − uzaverka.revenue (null if no uzaverka). */
  revenueDelta: number | null;
  txDelta: number | null;
  label: string;
  hint: string;
}

export function readUzaverkaTotals(meta: unknown): DaySideTotals | null {
  if (!meta || typeof meta !== "object") return null;
  const m = meta as Record<string, unknown>;
  const revenue = Number(m.total_revenue);
  const cash = Number(m.cash_total) || 0;
  const qr = Number(m.qr_total) || 0;
  const txCount = Number(m.tx_count) || 0;
  if (!Number.isFinite(revenue) && cash + qr === 0 && txCount === 0) return null;
  return {
    revenue: Number.isFinite(revenue) ? revenue : cash + qr,
    txCount,
    cash,
    qr,
  };
}

export function liveTotalsFromTxs(txs: PosTransaction[]): DaySideTotals {
  const sum = sumTxRevenue(txs);
  return {
    revenue: sum.revenue,
    txCount: sum.txCount,
    cash: sum.cash,
    qr: sum.qr,
  };
}

function revenueWithinOk(delta: number, baseline: number): boolean {
  const abs = Math.abs(delta);
  if (abs <= REVENUE_OK_ABS) return true;
  if (baseline > 0 && abs / baseline <= REVENUE_OK_REL) return true;
  return false;
}

export function compareDayTotals(opts: {
  closeDate: string;
  branchId: number;
  uzaverka: DaySideTotals | null;
  live: DaySideTotals;
  backupId?: number;
  branchCode?: string;
  branchName?: string;
}): DayCompareResult {
  const { closeDate, branchId, uzaverka, live } = opts;
  const base = {
    closeDate,
    branchId,
    backupId: opts.backupId,
    branchCode: opts.branchCode,
    branchName: opts.branchName,
    uzaverka,
    live,
  };

  if (!uzaverka) {
    return {
      ...base,
      status: "open",
      revenueDelta: null,
      txDelta: null,
      label: "Otevřený den",
      hint: "Jen live data — uzávěrka ještě není. Věř live.",
    };
  }

  if (live.txCount === 0 && live.revenue === 0) {
    return {
      ...base,
      status: "no_live",
      revenueDelta: -uzaverka.revenue,
      txDelta: -uzaverka.txCount,
      label: "Bez live",
      hint: "Uzávěrka je, ale cloud nemá transakce. Dočasně věř uzávěrce; na pokladně sync/reconcile.",
    };
  }

  const revenueDelta = live.revenue - uzaverka.revenue;
  const txDelta = live.txCount - uzaverka.txCount;
  const abs = Math.abs(revenueDelta);

  if (revenueWithinOk(revenueDelta, uzaverka.revenue)) {
    return {
      ...base,
      status: "ok",
      revenueDelta,
      txDelta,
      label: "OK",
      hint: "Live a uzávěrka sedí.",
    };
  }

  if (abs <= REVENUE_WARN_ABS) {
    return {
      ...base,
      status: "warning",
      revenueDelta,
      txDelta,
      label: `Δ ${formatDeltaKč(revenueDelta)}`,
      hint:
        revenueDelta < 0
          ? "Live < uzávěrka — na pokladně znovu sync / reconcile."
          : "Live > uzávěrka — zkontroluj TX po uzávěrce / duplicity.",
    };
  }

  return {
    ...base,
    status: "error",
    revenueDelta,
    txDelta,
    label: `Δ ${formatDeltaKč(revenueDelta)}`,
    hint:
      revenueDelta < 0
        ? "Live výrazně pod uzávěrkou — chybí TX na cloudu."
        : "Live výrazně nad uzávěrkou — ověř close_date a duplicity.",
  };
}

export function formatDeltaKč(delta: number): string {
  const sign = delta > 0 ? "+" : "";
  return `${sign}${formatCurrency(delta)}`;
}

export function dayBranchKey(branchId: number, closeDate: string): string {
  return `${branchId}|${closeDate}`;
}

/** Latest uzaverka backup per branch × close_date. */
export function indexLatestUzaverky(backups: Backup[]): Map<string, Backup> {
  const map = new Map<string, Backup>();
  for (const b of backups) {
    if (b.kind !== "uzaverka" && b.kind !== "close") continue;
    const closeDate = extractCloseDate(b);
    if (!closeDate) continue;
    const key = dayBranchKey(b.branch_id, closeDate);
    const ex = map.get(key);
    if (!ex || new Date(b.uploaded_at).getTime() > new Date(ex.uploaded_at).getTime()) {
      map.set(key, b);
    }
  }
  return map;
}

export function aggregateLiveByBranchDay(
  txs: PosTransaction[]
): Map<string, DaySideTotals> {
  const buckets = new Map<string, PosTransaction[]>();
  for (const tx of txs) {
    if (tx.deleted_at) continue;
    const day = String(tx.created_at || "").slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) continue;
    const key = dayBranchKey(tx.branch_id, day);
    const list = buckets.get(key) ?? [];
    list.push(tx);
    buckets.set(key, list);
  }
  const out = new Map<string, DaySideTotals>();
  for (const [key, list] of buckets) {
    out.set(key, liveTotalsFromTxs(list));
  }
  return out;
}

export interface ReconcileReport {
  from: string;
  to: string;
  results: DayCompareResult[];
  errorCount: number;
  warningCount: number;
  noLiveCount: number;
  okCount: number;
}

/**
 * Compare last N calendar days: uzaverka metadata vs live POS totals for a license.
 */
export async function buildReconcileReport(opts: {
  licenseKey: string;
  days?: number;
}): Promise<ReconcileReport> {
  const days = opts.days ?? 7;
  const dayList = lastNDays(days); // newest first
  const to = dayList[0] || pragueDate(new Date());
  const from = dayList[dayList.length - 1] || to;

  const [backupsRes, livePaged] = await Promise.all([
    getBackups({
      licenseKey: opts.licenseKey,
      kind: "uzaverka",
      from,
      to,
      limit: 500,
    }),
    fetchAllPosTransactions(
      { licenseKey: opts.licenseKey },
      `${from} 00:00:00`,
      `${to} 23:59:59`,
      { maxPages: 20 }
    ),
  ]);

  const uzaIndex = indexLatestUzaverky(backupsRes.backups ?? []);
  const liveIndex = aggregateLiveByBranchDay(livePaged.transactions);

  const keys = new Set<string>([...uzaIndex.keys(), ...liveIndex.keys()]);
  const results: DayCompareResult[] = [];

  for (const key of keys) {
    const [branchIdStr, closeDate] = key.split("|");
    const branchId = Number(branchIdStr);
    const backup = uzaIndex.get(key);
    const uzaverka = backup ? readUzaverkaTotals(backup.metadata_json) : null;
    const live = liveIndex.get(key) ?? {
      revenue: 0,
      txCount: 0,
      cash: 0,
      qr: 0,
    };

    // Skip pure open days with zero live (noise)
    if (!uzaverka && live.txCount === 0 && live.revenue === 0) continue;

    results.push(
      compareDayTotals({
        closeDate,
        branchId,
        uzaverka,
        live,
        backupId: backup?.id,
        branchCode: backup?.branch_code,
        branchName: backup?.branch_name,
      })
    );
  }

  results.sort((a, b) => {
    const byDate = b.closeDate.localeCompare(a.closeDate);
    if (byDate !== 0) return byDate;
    return a.branchId - b.branchId;
  });

  return {
    from,
    to,
    results,
    errorCount: results.filter((r) => r.status === "error").length,
    warningCount: results.filter((r) => r.status === "warning").length,
    noLiveCount: results.filter((r) => r.status === "no_live").length,
    okCount: results.filter((r) => r.status === "ok").length,
  };
}

/** Compare a single backup row against live for that branch × close_date. */
export async function compareBackupWithLive(backup: Backup): Promise<DayCompareResult> {
  const closeDate = extractCloseDate(backup);
  if (!closeDate) {
    return {
      status: "unavailable",
      closeDate: "",
      branchId: backup.branch_id,
      backupId: backup.id,
      uzaverka: null,
      live: { revenue: 0, txCount: 0, cash: 0, qr: 0 },
      revenueDelta: null,
      txDelta: null,
      label: "—",
      hint: "Chybí datum uzávěrky",
    };
  }

  const uzaverka = readUzaverkaTotals(backup.metadata_json);
  let live: DaySideTotals = { revenue: 0, txCount: 0, cash: 0, qr: 0 };
  try {
    const res = await getPosTransactions({
      branchId: backup.branch_id,
      day: closeDate,
      limit: 1000,
    });
    live = liveTotalsFromTxs(res.transactions || []);
  } catch {
    return {
      status: "unavailable",
      closeDate,
      branchId: backup.branch_id,
      backupId: backup.id,
      branchCode: backup.branch_code,
      branchName: backup.branch_name,
      uzaverka,
      live,
      revenueDelta: null,
      txDelta: null,
      label: "?",
      hint: "Live API nedostupné",
    };
  }

  return compareDayTotals({
    closeDate,
    branchId: backup.branch_id,
    uzaverka,
    live,
    backupId: backup.id,
    branchCode: backup.branch_code,
    branchName: backup.branch_name,
  });
}

/** Batch-compare many uzaverka backups (shared live window). */
export async function compareBackupsWithLive(
  backups: Backup[],
  opts?: { licenseKey?: string }
): Promise<Map<number, DayCompareResult>> {
  const uzaverky = backups.filter((b) => b.kind === "uzaverka" || b.kind === "close");
  const out = new Map<number, DayCompareResult>();
  if (uzaverky.length === 0) return out;

  let dates = uzaverky
    .map((b) => extractCloseDate(b))
    .filter((d): d is string => Boolean(d))
    .sort();
  if (dates.length === 0) return out;

  const from = dates[0];
  const to = dates[dates.length - 1];
  const licenseKey = opts?.licenseKey || uzaverky[0].license_key;

  let liveIndex = new Map<string, DaySideTotals>();
  try {
    const livePaged = await fetchAllPosTransactions(
      { licenseKey },
      `${from} 00:00:00`,
      `${to} 23:59:59`,
      { maxPages: 15 }
    );
    liveIndex = aggregateLiveByBranchDay(livePaged.transactions);
  } catch {
    for (const b of uzaverky) {
      out.set(b.id, {
        status: "unavailable",
        closeDate: extractCloseDate(b) || "",
        branchId: b.branch_id,
        backupId: b.id,
        uzaverka: readUzaverkaTotals(b.metadata_json),
        live: { revenue: 0, txCount: 0, cash: 0, qr: 0 },
        revenueDelta: null,
        txDelta: null,
        label: "?",
        hint: "Live API nedostupné",
      });
    }
    return out;
  }

  for (const b of uzaverky) {
    const closeDate = extractCloseDate(b);
    if (!closeDate) continue;
    const key = dayBranchKey(b.branch_id, closeDate);
    const live = liveIndex.get(key) ?? { revenue: 0, txCount: 0, cash: 0, qr: 0 };
    out.set(
      b.id,
      compareDayTotals({
        closeDate,
        branchId: b.branch_id,
        uzaverka: readUzaverkaTotals(b.metadata_json),
        live,
        backupId: b.id,
        branchCode: b.branch_code,
        branchName: b.branch_name,
      })
    );
  }

  return out;
}

/** UI copy: roles of the two sources. */
export const DATA_SOURCE_ROLES_BLURB =
  "Dnes a grafy = live transakce z pokladen. Uzávěrka = oficiální uzavření dne (archiv). Nesčítají se — kontroluje se shoda.";

export function paymentSplitFromTxs(txs: PosTransaction[]): { cash: number; qr: number } {
  let cash = 0;
  let qr = 0;
  for (const tx of txs) {
    if (tx.deleted_at) continue;
    const total = Number(tx.total) || 0;
    if (classifyPaymentKind(tx.payment_method) === "qr") qr += total;
    else cash += total;
  }
  return { cash, qr };
}
