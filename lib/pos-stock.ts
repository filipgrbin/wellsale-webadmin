import {
  getPosStockMovements,
  type PosStockMovement,
  type PosTransactionsQuery,
} from "@/lib/api";
import { pragueDate } from "@/lib/turnover-utils";

export const POS_STOCK_PAGE_LIMIT = 1000;
export const POS_STOCK_MAX_PAGES = 30;
export const POS_STOCK_POLL_MS = 60_000;

export function movementKey(m: PosStockMovement): string {
  return `${m.branch_id}:${m.local_id}`;
}

export function productStockKey(branchId: number, productId: number | null | undefined, name: string): string {
  if (productId != null && Number.isFinite(productId)) return `${branchId}:id:${productId}`;
  return `${branchId}:name:${name.trim().toLowerCase() || "?"}`;
}

export function sortMovementsNewestFirst(a: PosStockMovement, b: PosStockMovement): number {
  const ca = String(a.created_at || "");
  const cb = String(b.created_at || "");
  if (ca !== cb) return cb.localeCompare(ca);
  return (b.local_id || 0) - (a.local_id || 0);
}

export function mergeMovements(
  existing: PosStockMovement[],
  incoming: PosStockMovement[]
): PosStockMovement[] {
  const map = new Map<string, PosStockMovement>();
  for (const m of existing) map.set(movementKey(m), m);
  for (const m of incoming) {
    const k = movementKey(m);
    const prev = map.get(k);
    if (!prev) {
      map.set(k, m);
      continue;
    }
    const pu = prev.updated_at ? Date.parse(prev.updated_at) : 0;
    const nu = m.updated_at ? Date.parse(m.updated_at) : 0;
    if (!Number.isFinite(pu) || (Number.isFinite(nu) && nu >= pu)) {
      map.set(k, m);
    }
  }
  return [...map.values()].filter((m) => !m.deleted_at).sort(sortMovementsNewestFirst);
}

export interface ProductStockLevel {
  key: string;
  branchId: number;
  productId: number | null;
  productName: string;
  /** Current qty from latest stock_after; null if unknown. */
  stock: number | null;
  lastDelta: number;
  lastKind: string | null;
  lastAt: string;
  movementCount: number;
}

/**
 * Build current stock levels: newest movement per product×branch wins (stock_after).
 * Movements must be newest-first for efficient first-seen = current.
 */
export function buildCurrentStockLevels(movements: PosStockMovement[]): ProductStockLevel[] {
  const byProduct = new Map<string, ProductStockLevel>();
  const sorted = [...movements].filter((m) => !m.deleted_at).sort(sortMovementsNewestFirst);

  for (const m of sorted) {
    const name = String(m.product_name || "").trim() || "Neznámý produkt";
    const pid = m.product_id != null && Number.isFinite(Number(m.product_id))
      ? Number(m.product_id)
      : null;
    const key = productStockKey(m.branch_id, pid, name);
    const existing = byProduct.get(key);
    if (!existing) {
      byProduct.set(key, {
        key,
        branchId: m.branch_id,
        productId: pid,
        productName: name,
        stock: m.stock_after != null && Number.isFinite(Number(m.stock_after))
          ? Number(m.stock_after)
          : null,
        lastDelta: Number(m.delta) || 0,
        lastKind: m.kind ?? null,
        lastAt: m.created_at,
        movementCount: 1,
      });
    } else {
      existing.movementCount += 1;
      // Prefer a non-null stock_after if the newest lacked it
      if (
        existing.stock == null &&
        m.stock_after != null &&
        Number.isFinite(Number(m.stock_after))
      ) {
        existing.stock = Number(m.stock_after);
      }
      if (!existing.productName && name) existing.productName = name;
    }
  }

  return [...byProduct.values()].sort((a, b) => {
    const byName = a.productName.localeCompare(b.productName, "cs");
    if (byName !== 0) return byName;
    return a.branchId - b.branchId;
  });
}

function tickDownWallClock(s: string): string {
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
  if (Number.isFinite(t)) return new Date(t - 1000).toISOString();
  return s;
}

/** Wide window for building a stock snapshot (not just “today”). */
export function stockSnapshotWindow(): { from: string; to: string } {
  const today = pragueDate(new Date());
  // ~18 months back — enough history to catch last stock_after per product
  const start = new Date(`${today}T12:00:00`);
  start.setMonth(start.getMonth() - 18);
  const fromDay = pragueDate(start);
  return {
    from: `${fromDay} 00:00:00`,
    to: `${today} 23:59:59`,
  };
}

/**
 * Page through stock movements (DESC) and merge.
 * Newest-first means early pages already give current stock_after for active products.
 */
export async function fetchAllStockMovements(
  scope: { licenseKey?: string; branchId?: number },
  opts?: { maxPages?: number }
): Promise<{ movements: PosStockMovement[]; nextSince: string | null; truncated: boolean }> {
  const { from, to } = stockSnapshotWindow();
  const maxPages = opts?.maxPages ?? POS_STOCK_MAX_PAGES;
  let pageTo = to;
  let all: PosStockMovement[] = [];
  let nextSince: string | null = null;
  let truncated = false;

  for (let page = 0; page < maxPages; page++) {
    const query: PosTransactionsQuery = {
      ...scope,
      from,
      to: pageTo,
      limit: POS_STOCK_PAGE_LIMIT,
    };
    const res = await getPosStockMovements(query);
    nextSince = res.nextSince || nextSince;
    const batch = (res.movements || []).filter((m) => !m.deleted_at);
    if (batch.length === 0) break;

    all = mergeMovements(all, batch);

    if (batch.length < POS_STOCK_PAGE_LIMIT) break;

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
    movements: all.sort(sortMovementsNewestFirst),
    nextSince,
    truncated,
  };
}

export function formatStockKind(kind: string | null | undefined): string {
  const k = String(kind || "").toLowerCase();
  if (!k) return "—";
  if (k.includes("sale") || k.includes("prodej") || k === "out") return "Prodej";
  if (k.includes("recv") || k.includes("prijem") || k.includes("in") || k.includes("delivery"))
    return "Příjem";
  if (k.includes("adjust") || k.includes("inventar") || k.includes("count")) return "Úprava";
  if (k.includes("waste") || k.includes("vyrazen") || k.includes("return")) return "Úbytek";
  return kind || "—";
}
