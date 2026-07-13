"use client";

import { useMemo, useState } from "react";
import useSWR from "swr";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { getBackups, getLicenses, getBranches } from "@/lib/api";
import {
  aggregateByWeek,
  aggregateUzaverkyBackups,
  dayLabel,
  formatCurrency,
  lastNDays,
  pragueDate,
  weekLabel,
  weekStartKey,
} from "@/lib/turnover-utils";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  ChartLegend,
  ChartLegendContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { TrendingUp, CalendarDays, CalendarRange, Store } from "lucide-react";

// Same dark green as elsewhere in the app (emerald-600)
const EMERALD_DARK = "#059669";

const chartConfig = {
  revenue: { label: "Tržby", color: EMERALD_DARK },
  profit: { label: "Zisk", color: EMERALD_DARK },
} satisfies ChartConfig;

interface TurnoverChartsProps {
  /** When set, scopes data to one license (subadmin). Omit for admin-wide view. */
  licenseKey?: string;
}

export function TurnoverCharts({ licenseKey: fixedLicenseKey }: TurnoverChartsProps) {
  const isSubadmin = Boolean(fixedLicenseKey);
  const [licenseFilter, setLicenseFilter] = useState<string>("all");
  const [chartTab, setChartTab] = useState<"daily" | "weekly">("daily");

  const effectiveLicense =
    fixedLicenseKey ?? (licenseFilter !== "all" ? licenseFilter : undefined);

  const { data: backupsData, isLoading } = useSWR(
    ["turnover-charts", effectiveLicense ?? "all"],
    () =>
      getBackups({
        kind: "uzaverka",
        limit: 500,
        ...(effectiveLicense ? { licenseKey: effectiveLicense } : {}),
      })
  );

  const { data: licensesData } = useSWR(isSubadmin ? null : "licenses", getLicenses);
  const { data: branchesData } = useSWR(
    isSubadmin ? ["turnover-branches", fixedLicenseKey] : "all-branches",
    () => getBranches(fixedLicenseKey)
  );

  const activeBranchCount = (branchesData?.branches ?? []).filter((b) => !b.archived_at).length;

  const byDate = useMemo(() => {
    const backups = backupsData?.backups ?? [];
    const filter = effectiveLicense ? { licenseKey: effectiveLicense } : undefined;
    return aggregateUzaverkyBackups(backups, filter);
  }, [backupsData, effectiveLicense]);

  const byWeek = useMemo(() => aggregateByWeek(byDate), [byDate]);

  const dailyDays = useMemo(() => [...lastNDays(14)].reverse(), []);
  const weeklyKeys = useMemo(() => {
    const keys = new Set<string>();
    for (const d of byDate.keys()) keys.add(weekStartKey(d));
    for (const d of lastNDays(56)) keys.add(weekStartKey(d));
    return [...keys].sort().slice(-8);
  }, [byDate]);

  const dailyChartData = useMemo(
    () =>
      dailyDays.map((date) => {
        const v = byDate.get(date);
        const { dm } = dayLabel(date);
        return {
          date,
          label: dm,
          revenue: v?.revenue ?? 0,
          profit: v?.profitBranches.size ? v.profit : 0,
        };
      }),
    [dailyDays, byDate]
  );

  const weeklyChartData = useMemo(
    () =>
      weeklyKeys.map((wk) => {
        const v = byWeek.get(wk);
        return {
          week: wk,
          label: weekLabel(wk),
          revenue: v?.revenue ?? 0,
          profit: v?.profitBranches.size ? v.profit : 0,
        };
      }),
    [weeklyKeys, byWeek]
  );

  const today = dailyDays[dailyDays.length - 1] ?? pragueDate(new Date());
  const todayAgg = byDate.get(today) ?? {
    revenue: 0,
    profit: 0,
    profitBranches: new Set<number>(),
    tx: 0,
    branches: new Set<number>(),
  };

  const weekTotal = useMemo(() => {
    let revenue = 0;
    let profit = 0;
    let profitKnown = false;
    for (const d of lastNDays(7)) {
      const v = byDate.get(d);
      if (!v) continue;
      revenue += v.revenue;
      if (v.profitBranches.size > 0) {
        profit += v.profit;
        profitKnown = true;
      }
    }
    return { revenue, profit, profitKnown };
  }, [byDate]);

  const monthPrefix = pragueDate(new Date()).slice(0, 7);
  const monthTotal = useMemo(() => {
    let revenue = 0;
    let profit = 0;
    let profitKnown = false;
    for (const [d, v] of byDate) {
      if (!d.startsWith(monthPrefix)) continue;
      revenue += v.revenue;
      if (v.profitBranches.size > 0) {
        profit += v.profit;
        profitKnown = true;
      }
    }
    return { revenue, profit, profitKnown };
  }, [byDate, monthPrefix]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <TrendingUp className="h-5 w-5" />
            Analýza tržeb z uzávěrek
          </h3>
          <p className="text-sm text-muted-foreground">
            {isSubadmin
              ? "Denní a týdenní přehled tržeb z vašich prodejen"
              : "Agregace z denních uzávěrek napříč pobočkami"}
          </p>
        </div>
        {!isSubadmin && (
          <Select value={licenseFilter} onValueChange={setLicenseFilter}>
            <SelectTrigger className="w-full sm:w-[280px]">
              <SelectValue placeholder="Filtr licence" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Všechny licence</SelectItem>
              {(licensesData?.licenses ?? []).map((l) => (
                <SelectItem key={l.license_key} value={l.license_key}>
                  {l.owner_name} ({l.license_key.slice(0, 8)}…)
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Dnes</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(todayAgg.revenue)}</div>
            <p className="text-xs text-emerald-500 mt-1">
              zisk {todayAgg.profitBranches.size > 0 ? formatCurrency(todayAgg.profit) : "—"}
            </p>
            <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
              <Store className="h-3 w-3" />
              {todayAgg.branches.size}
              {activeBranchCount > 0 ? `/${activeBranchCount}` : ""} poboček · {todayAgg.tx} transakcí
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-1">
              <CalendarDays className="h-3.5 w-3.5" />
              Posledních 7 dní
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(weekTotal.revenue)}</div>
            <p className="text-xs text-emerald-500 mt-1">
              zisk {weekTotal.profitKnown ? formatCurrency(weekTotal.profit) : "—"}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-1">
              <CalendarRange className="h-3.5 w-3.5" />
              Tento měsíc
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(monthTotal.revenue)}</div>
            <p className="text-xs text-emerald-500 mt-1">
              zisk {monthTotal.profitKnown ? formatCurrency(monthTotal.profit) : "—"}
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Grafy tržeb</CardTitle>
          <CardDescription>
            {isLoading ? "Načítání dat…" : "Denní a týdenní přehled z uzávěrek"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs value={chartTab} onValueChange={(v) => setChartTab(v as "daily" | "weekly")}>
            <TabsList className="mb-4">
              <TabsTrigger value="daily">Denní (14 dní)</TabsTrigger>
              <TabsTrigger value="weekly">Týdenní (8 týdnů)</TabsTrigger>
            </TabsList>
            <TabsContent value="daily">
              <ChartContainer config={chartConfig} className="h-[300px] w-full">
                <BarChart data={dailyChartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid vertical={false} />
                  <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={11} />
                  <YAxis
                    tickLine={false}
                    axisLine={false}
                    fontSize={11}
                    tickFormatter={(v) => `${Math.round(v / 1000)}k`}
                  />
                  <ChartTooltip
                    content={
                      <ChartTooltipContent
                        formatter={(value, name) => [
                          formatCurrency(Number(value)),
                          name === "revenue" ? "Tržby" : "Zisk",
                        ]}
                      />
                    }
                  />
                  <ChartLegend content={<ChartLegendContent />} />
                  <Bar dataKey="revenue" fill={EMERALD_DARK} radius={[4, 4, 0, 0]} />
                  <Bar dataKey="profit" fill={EMERALD_DARK} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ChartContainer>
            </TabsContent>
            <TabsContent value="weekly">
              <ChartContainer config={chartConfig} className="h-[300px] w-full">
                <BarChart data={weeklyChartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid vertical={false} />
                  <XAxis
                    dataKey="label"
                    tickLine={false}
                    axisLine={false}
                    fontSize={10}
                    interval={0}
                    angle={-20}
                    textAnchor="end"
                    height={50}
                  />
                  <YAxis
                    tickLine={false}
                    axisLine={false}
                    fontSize={11}
                    tickFormatter={(v) => `${Math.round(v / 1000)}k`}
                  />
                  <ChartTooltip
                    content={
                      <ChartTooltipContent
                        formatter={(value, name) => [
                          formatCurrency(Number(value)),
                          name === "revenue" ? "Tržby" : "Zisk",
                        ]}
                      />
                    }
                  />
                  <ChartLegend content={<ChartLegendContent />} />
                  <Bar dataKey="revenue" fill={EMERALD_DARK} radius={[4, 4, 0, 0]} />
                  <Bar dataKey="profit" fill={EMERALD_DARK} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ChartContainer>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}

/** @deprecated Use TurnoverCharts instead */
export function AdminTurnoverCharts() {
  return <TurnoverCharts />;
}
