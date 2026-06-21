"use client";

import { useMemo, useState } from "react";
import useSWR from "swr";
import { getBackups, getBranches, type Backup } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { TrendingUp, Receipt, Store, CalendarDays, CalendarRange } from "lucide-react";

interface SubadminTurnoverProps {
  licenseKey: string;
}

// Shape of metadata_json on an `uzaverka` (daily closure) backup.
interface UzaverkaMeta {
  close_id?: number;
  tx_count?: number;
  close_date?: string;
  total_revenue?: number;
  real_zisk?: number; // obrat - náklady (revenue - costs)
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("cs-CZ", {
    style: "currency",
    currency: "CZK",
    maximumFractionDigits: 0,
  }).format(amount);
}

// Czech grammar: "z 1 prodejny" vs "z 5 prodejen"
function prodejnyLabel(n: number): string {
  return n === 1 ? "prodejny" : "prodejen";
}

// Czech grammar: 1 transakce, 2-4 transakce, 0/5+ transakcí
function transakceLabel(n: number): string {
  return n >= 1 && n <= 4 ? "transakce" : "transakcí";
}

// YYYY-MM-DD for a date in the shops' timezone (closure dates are local Czech dates).
function pragueDate(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Prague",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

// Last N day-strings, today first, in Europe/Prague.
function lastNDays(n: number): string[] {
  const out: string[] = [];
  const now = Date.now();
  for (let i = 0; i < n; i++) out.push(pragueDate(new Date(now - i * 86_400_000)));
  return out;
}

function dayLabel(dateStr: string): { dow: string; dm: string } {
  const d = new Date(dateStr + "T12:00:00");
  return {
    dow: new Intl.DateTimeFormat("cs-CZ", { weekday: "short" }).format(d),
    dm: new Intl.DateTimeFormat("cs-CZ", { day: "numeric", month: "numeric" }).format(d),
  };
}

export function SubadminTurnover({ licenseKey }: SubadminTurnoverProps) {
  // Only `uzaverka` (daily closure) backups count — `manual` backups are skipped.
  const { data } = useSWR(
    ["subadmin-turnover", licenseKey],
    () => getBackups({ licenseKey, kind: "uzaverka", limit: 500 })
  );
  // Active branches under the license — denominator for "z N/M prodejen".
  const { data: branchesData } = useSWR(
    ["subadmin-turnover-branches", licenseKey],
    () => getBranches(licenseKey)
  );
  const activeBranchCount = (branchesData?.branches ?? []).filter((b) => !b.archived_at).length;

  const days = useMemo(() => lastNDays(7), []);
  const [selected, setSelected] = useState(days[0]);

  // Aggregate by close_date, using the most recent closure per branch per day
  // (treats uzaverka as the cumulative end-of-day Z-report, no double counting).
  const { byDate, monthTotal, monthProfit, monthProfitKnown } = useMemo(() => {
    const backups = data?.backups ?? [];
    const latest = new Map<string, Backup>();
    for (const b of backups) {
      if (b.kind !== "uzaverka") continue;
      const meta = b.metadata_json as UzaverkaMeta | null;
      if (!meta?.close_date) continue;
      const key = `${b.branch_id}|${meta.close_date}`;
      const ex = latest.get(key);
      if (!ex || new Date(b.uploaded_at).getTime() > new Date(ex.uploaded_at).getTime()) {
        latest.set(key, b);
      }
    }
    const byDate = new Map<
      string,
      { revenue: number; profit: number; profitBranches: Set<number>; tx: number; branches: Set<number> }
    >();
    for (const b of latest.values()) {
      const meta = b.metadata_json as UzaverkaMeta;
      const d = meta.close_date as string;
      const cur =
        byDate.get(d) ??
        { revenue: 0, profit: 0, profitBranches: new Set<number>(), tx: 0, branches: new Set<number>() };
      cur.revenue += Number(meta.total_revenue) || 0;
      cur.tx += Number(meta.tx_count) || 0;
      const rz = Number(meta.real_zisk);
      // Only branches whose closure actually carried real_zisk count toward profit.
      if (Number.isFinite(rz)) {
        cur.profit += rz;
        cur.profitBranches.add(b.branch_id);
      }
      cur.branches.add(b.branch_id);
      byDate.set(d, cur);
    }
    const monthPrefix = pragueDate(new Date()).slice(0, 7); // YYYY-MM
    let monthTotal = 0;
    let monthProfit = 0;
    let monthProfitKnown = false;
    for (const [d, v] of byDate) {
      if (!d.startsWith(monthPrefix)) continue;
      monthTotal += v.revenue;
      if (v.profitBranches.size > 0) {
        monthProfit += v.profit;
        monthProfitKnown = true;
      }
    }
    return { byDate, monthTotal, monthProfit, monthProfitKnown };
  }, [data]);

  const sel =
    byDate.get(selected) ??
    { revenue: 0, profit: 0, profitBranches: new Set<number>(), tx: 0, branches: new Set<number>() };
  const week = useMemo(() => {
    let revenue = 0;
    let profit = 0;
    let profitKnown = false;
    for (const d of days) {
      const v = byDate.get(d);
      if (!v) continue;
      revenue += v.revenue;
      if (v.profitBranches.size > 0) {
        profit += v.profit;
        profitKnown = true;
      }
    }
    return { revenue, profit, profitKnown };
  }, [days, byDate]);

  return (
    <Card className="border-border bg-card">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <TrendingUp className="h-4 w-4" />
          Tržby
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Last 7 days selector */}
        <div className="flex gap-1.5 overflow-x-auto pb-1">
          {days.map((d) => {
            const { dow, dm } = dayLabel(d);
            const active = d === selected;
            const isToday = d === days[0];
            return (
              <Button
                key={d}
                variant={active ? "default" : "outline"}
                size="sm"
                className="flex h-auto shrink-0 flex-col items-center gap-0.5 px-3 py-1.5"
                onClick={() => setSelected(d)}
              >
                <span className="text-[10px] uppercase opacity-70">{isToday ? "Dnes" : dow}</span>
                <span className="text-xs font-medium">{dm}</span>
              </Button>
            );
          })}
        </div>

        {/* Selected day */}
        <div>
          <div className="text-4xl font-bold tracking-tight">{formatCurrency(sel.revenue)}</div>
          <p className="mt-1 text-sm">
            <span className="text-muted-foreground">Reálný zisk: </span>
            <span className="font-semibold text-emerald-500">
              {sel.profitBranches.size > 0 ? formatCurrency(sel.profit) : "—"}
            </span>
            {activeBranchCount > 0 && sel.profitBranches.size < activeBranchCount && (
              <span className="text-muted-foreground">
                {" "}z {sel.profitBranches.size}/{activeBranchCount} prodejen
              </span>
            )}
          </p>
          <p className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground">
            <Store className="h-3.5 w-3.5" />
            Z {sel.branches.size} {prodejnyLabel(sel.branches.size)}
          </p>
          <div className="mt-3 flex items-center gap-2 text-sm">
            <Receipt className="h-4 w-4 text-muted-foreground" />
            <span className="font-medium">{sel.tx}</span>
            <span className="text-muted-foreground">{transakceLabel(sel.tx)}</span>
          </div>
        </div>

        {/* Week & month totals */}
        <div className="grid grid-cols-2 gap-3 border-t border-border pt-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded bg-primary/10">
              <CalendarDays className="h-4 w-4 text-primary" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Posledních 7 dní</p>
              <p className="text-lg font-semibold">{formatCurrency(week.revenue)}</p>
              <p className="text-xs text-emerald-500">
                zisk {week.profitKnown ? formatCurrency(week.profit) : "—"}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded bg-primary/10">
              <CalendarRange className="h-4 w-4 text-primary" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Tento měsíc</p>
              <p className="text-lg font-semibold">{formatCurrency(monthTotal)}</p>
              <p className="text-xs text-emerald-500">
                zisk {monthProfitKnown ? formatCurrency(monthProfit) : "—"}
              </p>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
