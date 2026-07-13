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

/** Monday of the week containing dateStr (Prague local date). */
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

export function aggregateUzaverkyBackups(
  backups: Backup[],
  filter?: { licenseKey?: string; branchId?: number }
): Map<string, DayAggregate> {
  const latest = new Map<string, Backup>();

  for (const b of backups) {
    if (b.kind !== "uzaverka" && b.kind !== "close") continue;
    if (filter?.licenseKey && b.license_key !== filter.licenseKey) continue;
    if (filter?.branchId != null && b.branch_id !== filter.branchId) continue;

    const meta = b.metadata_json as UzaverkaMeta | null;
    if (!meta?.close_date) continue;

    const key = `${b.branch_id}|${meta.close_date}`;
    const ex = latest.get(key);
    if (!ex || new Date(b.uploaded_at).getTime() > new Date(ex.uploaded_at).getTime()) {
      latest.set(key, b);
    }
  }

  const byDate = new Map<string, DayAggregate>();
  for (const b of latest.values()) {
    const meta = b.metadata_json as UzaverkaMeta;
    const d = meta.close_date as string;
    const cur =
      byDate.get(d) ??
      { revenue: 0, profit: 0, profitBranches: new Set<number>(), tx: 0, branches: new Set<number>() };
    cur.revenue += Number(meta.total_revenue) || 0;
    cur.tx += Number(meta.tx_count) || 0;
    const rz = meta.real_zisk == null ? NaN : Number(meta.real_zisk);
    if (Number.isFinite(rz)) {
      cur.profit += rz;
      cur.profitBranches.add(b.branch_id);
    }
    cur.branches.add(b.branch_id);
    byDate.set(d, cur);
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
