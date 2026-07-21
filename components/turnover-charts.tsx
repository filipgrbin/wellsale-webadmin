"use client";

import { useEffect, useMemo, useState } from "react";
import useSWR from "swr";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { getBackups, getLicenses, getBranches, type Branch } from "@/lib/api";
import {
  type ChartGranularity,
  type RangePreset,
  branchDataKey,
  bucketsToRechartsData,
  buildChartBuckets,
  buildHourlyChartBucketsFromSales,
  formatCurrency,
  getEffectiveDateRange,
  parseClosureRecords,
  pragueDate,
  rangeDayCount,
  sumRecords,
  filterRecordsInRange,
  extractCloseDate,
} from "@/lib/turnover-utils";
import { fetchHourlySalesForRange, HOURLY_INSIGHTS_MAX_DAYS } from "@/lib/turnover-hourly";
import {
  buildPeriodInsights,
  mergeProductCounts,
  perProductFromMetadata,
} from "@/lib/turnover-insights";
import { TurnoverInsightsPanel } from "@/components/turnover-insights-panel";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ChartContainer, ChartTooltip, type ChartConfig } from "@/components/ui/chart";
import { TrendingUp, CalendarDays, CalendarRange, Store, ChevronDown, Banknote, QrCode } from "lucide-react";
import { cn } from "@/lib/utils";

const EMERALD_DARK = "#059669";

interface TurnoverChartsProps {
  licenseKey?: string;
}

function StackedBranchTooltip({
  active,
  payload,
  label,
  labels,
}: {
  active?: boolean;
  payload?: Array<{ dataKey?: string; value?: number; color?: string; payload?: Record<string, number> }>;
  label?: string;
  labels: Record<string, string>;
}) {
  if (!active || !payload?.length) return null;
  const items = payload.filter((p) => Number(p.value) > 0);
  if (!items.length) return null;
  const total = items.reduce((s, p) => s + Number(p.value ?? 0), 0);
  const row = payload[0]?.payload;
  const cash = Number(row?.cash ?? 0);
  const qr = Number(row?.qr ?? 0);
  return (
    <div className="border-border/50 bg-background min-w-[10rem] rounded-lg border px-3 py-2 text-xs shadow-xl">
      <p className="font-medium mb-1.5">{label}</p>
      <div className="space-y-1">
        {items.map((p) => (
          <div key={p.dataKey} className="flex items-center justify-between gap-4">
            <span className="flex items-center gap-1.5">
              <span
                className="h-2 w-2 rounded-sm shrink-0"
                style={{ backgroundColor: p.color }}
              />
              {labels[p.dataKey ?? ""] ?? p.dataKey}
            </span>
            <span className="font-medium tabular-nums">{formatCurrency(Number(p.value))}</span>
          </div>
        ))}
      </div>
      {(cash > 0 || qr > 0) && (
        <p className="mt-1.5 pt-1.5 border-t border-border text-muted-foreground">
          Hotovost {formatCurrency(cash)} · QR {formatCurrency(qr)}
        </p>
      )}
      {items.length > 1 && (
        <p className="mt-1 font-medium">
          Celkem {formatCurrency(total)}
        </p>
      )}
    </div>
  );
}

function SimpleTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ dataKey?: string; value?: number; payload?: Record<string, number> }>;
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  const row = payload[0]?.payload;
  const cash = Number(row?.cash ?? 0);
  const qr = Number(row?.qr ?? 0);
  const total = Number(row?.total ?? row?.revenue ?? payload[0]?.value ?? 0);
  return (
    <div className="border-border/50 bg-background rounded-lg border px-3 py-2 text-xs shadow-xl">
      <p className="font-medium mb-0.5">{label}</p>
      <p className="text-emerald-600 font-semibold">{formatCurrency(total)}</p>
      {(cash > 0 || qr > 0) && (
        <p className="text-muted-foreground mt-1">
          Hotovost {formatCurrency(cash)} · QR {formatCurrency(qr)}
        </p>
      )}
    </div>
  );
}

export function TurnoverCharts({ licenseKey: fixedLicenseKey }: TurnoverChartsProps) {
  const isSubadmin = Boolean(fixedLicenseKey);
  const today = pragueDate(new Date());

  const [licenseFilter, setLicenseFilter] = useState<string>("all");
  const [rangePreset, setRangePreset] = useState<RangePreset>("week");
  const [customFrom, setCustomFrom] = useState(today);
  const [customTo, setCustomTo] = useState(today);
  const [granularity, setGranularity] = useState<ChartGranularity>("day");
  const [allBranches, setAllBranches] = useState(true);
  const [selectedBranchIds, setSelectedBranchIds] = useState<Set<number>>(new Set());

  const effectiveLicense =
    fixedLicenseKey ?? (licenseFilter !== "all" ? licenseFilter : undefined);

  const { from, to } = getEffectiveDateRange(rangePreset, customFrom, customTo);
  const dayCount = rangeDayCount(from, to);
  const canUseHourly = dayCount <= 1;

  useEffect(() => {
    if (rangePreset === "today" && canUseHourly) {
      setGranularity("hour");
    } else if (rangePreset === "month") {
      setGranularity("month");
    } else if (rangePreset === "week") {
      setGranularity("day");
    }
  }, [rangePreset, canUseHourly]);

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

  const availableBranches = useMemo(() => {
    const list = (branchesData?.branches ?? []).filter((b) => !b.archived_at);
    if (effectiveLicense) {
      return list.filter((b) => b.license_key === effectiveLicense);
    }
    return list;
  }, [branchesData, effectiveLicense]);

  const branchMeta = useMemo(() => {
    const m = new Map<number, { id: number; code: string; name: string }>();
    for (const b of availableBranches) {
      m.set(b.id, { id: b.id, code: b.code, name: b.name });
    }
    for (const bk of backupsData?.backups ?? []) {
      if (!m.has(bk.branch_id)) {
        m.set(bk.branch_id, {
          id: bk.branch_id,
          code: bk.branch_code || `#${bk.branch_id}`,
          name: bk.branch_name || `Pobočka ${bk.branch_id}`,
        });
      }
    }
    return m;
  }, [availableBranches, backupsData]);

  const activeBranchIds = useMemo((): number[] | null => {
    if (allBranches) return null;
    return [...selectedBranchIds];
  }, [allBranches, selectedBranchIds]);

  const allRecords = useMemo(
    () =>
      parseClosureRecords(backupsData?.backups ?? [], {
        licenseKey: effectiveLicense,
        branchIds: activeBranchIds,
      }),
    [backupsData, effectiveLicense, activeBranchIds]
  );

  const rangeRecords = useMemo(
    () => filterRecordsInRange(allRecords, from, to),
    [allRecords, from, to]
  );

  const rangeSummary = useMemo(() => sumRecords(rangeRecords), [rangeRecords]);

  const needsHourlySales = granularity === "hour" && canUseHourly;

  const needsInsightHours = dayCount >= 1 && dayCount <= HOURLY_INSIGHTS_MAX_DAYS;

  const { data: insightIntraday, isLoading: insightHourlyLoading, error: hourlyError } = useSWR(
    needsInsightHours && backupsData
      ? [
          "turnover-insight-hours",
          effectiveLicense ?? "all",
          from,
          to,
          activeBranchIds ? [...activeBranchIds].sort((a, b) => a - b).join(",") : "all",
        ]
      : null,
    () =>
      fetchHourlySalesForRange(backupsData!.backups, from, to, {
        licenseKey: effectiveLicense,
        branchIds: activeBranchIds,
      }),
    { revalidateOnFocus: false }
  );

  const insightHourlySales = insightIntraday?.sales;
  // Keep chart-compatible alias for single-day hour view
  const hourlySales = needsHourlySales ? insightHourlySales : undefined;

  const periodProducts = useMemo(() => {
    const fromDecrypt = insightIntraday?.products;
    if (fromDecrypt && Object.keys(fromDecrypt).length > 0) {
      return mergeProductCounts(fromDecrypt);
    }
    // Fallback: metadata perProduct if POS included it
    const backups = backupsData?.backups ?? [];
    const maps: Array<Record<string, number> | null> = [];
    const branchFilter =
      activeBranchIds && activeBranchIds.length > 0 ? new Set(activeBranchIds) : null;
    for (const b of backups) {
      if (b.kind !== "uzaverka" && b.kind !== "close") continue;
      if (effectiveLicense && b.license_key !== effectiveLicense) continue;
      if (branchFilter && !branchFilter.has(b.branch_id)) continue;
      const closeDate = extractCloseDate(b);
      if (!closeDate || closeDate < from || closeDate > to) continue;
      maps.push(perProductFromMetadata(b.metadata_json));
    }
    return mergeProductCounts(...maps);
  }, [insightIntraday, backupsData, effectiveLicense, activeBranchIds, from, to]);

  const insightHoursLoading = needsInsightHours && insightHourlyLoading;

  const periodInsights = useMemo(
    () =>
      buildPeriodInsights({
        records: rangeRecords,
        hourlySales: insightHourlySales,
        products: periodProducts,
      }),
    [rangeRecords, insightHourlySales, periodProducts]
  );

  const buckets = useMemo(() => {
    if (granularity === "hour") {
      return buildHourlyChartBucketsFromSales(hourlySales ?? [], from, to);
    }
    return buildChartBuckets(allRecords, granularity, from, to);
  }, [allRecords, granularity, from, to, hourlySales]);

  const chartLoading = isLoading || (needsHourlySales && insightHourlyLoading);
  const hourlyReady = !needsHourlySales || (insightHourlySales !== undefined && !insightHourlyLoading);

  const stacked = allBranches;

  const chartOutput = useMemo(
    () => bucketsToRechartsData(buckets, branchMeta, stacked),
    [buckets, branchMeta, stacked]
  );

  const chartConfig = useMemo(() => {
    const cfg: ChartConfig = { revenue: { label: "Tržby", color: EMERALD_DARK } };
    for (const [key, label] of Object.entries(chartOutput.labels)) {
      cfg[key] = { label, color: chartOutput.colors[key] };
    }
    return cfg;
  }, [chartOutput]);

  const toggleBranch = (id: number) => {
    setSelectedBranchIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const branchPickerLabel = allBranches
    ? "Všechny prodejny"
    : selectedBranchIds.size === 0
      ? "Všechny prodejny"
      : `${selectedBranchIds.size} prodejen`;

  const presetLabel: Record<RangePreset, string> = {
    today: "Dnes",
    week: "Tento týden",
    month: "Tento měsíc",
    custom: "Vlastní rozsah",
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <TrendingUp className="h-5 w-5" />
            Analýza tržeb z uzávěrek
          </h3>
          <p className="text-sm text-muted-foreground">
            {isSubadmin
              ? "Intradenní, denní a měsíční přehled s výběrem prodejen"
              : "Agregace z uzávěrek napříč pobočkami a licencemi"}
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
          {!isSubadmin && (
            <Select value={licenseFilter} onValueChange={setLicenseFilter}>
              <SelectTrigger className="w-full sm:w-[220px]">
                <SelectValue placeholder="Licence" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Všechny licence</SelectItem>
                {(licensesData?.licenses ?? []).map((l) => (
                  <SelectItem key={l.license_key} value={l.license_key}>
                    {l.owner_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" className="w-full sm:w-auto justify-between gap-2">
                <Store className="h-4 w-4 shrink-0" />
                {branchPickerLabel}
                <ChevronDown className="h-4 w-4 opacity-50" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-72 p-3" align="end">
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="all-branches"
                    checked={allBranches}
                    onCheckedChange={(c) => {
                      setAllBranches(c === true);
                      if (c) setSelectedBranchIds(new Set());
                    }}
                  />
                  <Label htmlFor="all-branches" className="cursor-pointer font-medium">
                    Všechny prodejny (skládaný graf)
                  </Label>
                </div>
                {!allBranches && (
                  <div className="max-h-48 overflow-y-auto space-y-2 border-t border-border pt-2">
                    {availableBranches.map((b: Branch) => (
                      <div key={b.id} className="flex items-center gap-2">
                        <Checkbox
                          id={`branch-${b.id}`}
                          checked={selectedBranchIds.has(b.id)}
                          onCheckedChange={() => toggleBranch(b.id)}
                        />
                        <Label htmlFor={`branch-${b.id}`} className="cursor-pointer text-sm">
                          <span className="font-medium">{b.code}</span>
                          <span className="text-muted-foreground"> — {b.name}</span>
                        </Label>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </PopoverContent>
          </Popover>
        </div>
      </div>

      {/* Range presets */}
      <div className="flex flex-wrap gap-2">
        {(["today", "week", "month", "custom"] as RangePreset[]).map((p) => (
          <Button
            key={p}
            variant={rangePreset === p ? "default" : "outline"}
            size="sm"
            onClick={() => setRangePreset(p)}
          >
            {presetLabel[p]}
          </Button>
        ))}
      </div>

      {rangePreset === "custom" && (
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <Label htmlFor="from-date" className="text-xs">
              Od
            </Label>
            <Input
              id="from-date"
              type="date"
              value={customFrom}
              max={customTo}
              onChange={(e) => setCustomFrom(e.target.value)}
              className="w-[160px]"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="to-date" className="text-xs">
              Do
            </Label>
            <Input
              id="to-date"
              type="date"
              value={customTo}
              min={customFrom}
              max={today}
              onChange={(e) => setCustomTo(e.target.value)}
              className="w-[160px]"
            />
          </div>
        </div>
      )}

      {/* Summary for selected range */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {presetLabel[rangePreset]} — tržby
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(rangeSummary.revenue)}</div>
            <p className="text-xs text-emerald-500 mt-1">
              zisk {rangeSummary.profitKnown ? formatCurrency(rangeSummary.profit) : "—"}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-1">
              <Banknote className="h-3.5 w-3.5" />
              Hotovost
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold tabular-nums">{formatCurrency(rangeSummary.cash)}</div>
            <p className="text-xs text-muted-foreground mt-1">
              {rangeSummary.revenue > 0
                ? `${((rangeSummary.cash / rangeSummary.revenue) * 100).toFixed(0)} % tržeb`
                : "—"}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-1">
              <QrCode className="h-3.5 w-3.5" />
              QR platby
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold tabular-nums">{formatCurrency(rangeSummary.qr)}</div>
            <p className="text-xs text-muted-foreground mt-1">
              {rangeSummary.revenue > 0
                ? `${((rangeSummary.qr / rangeSummary.revenue) * 100).toFixed(0)} % tržeb`
                : "—"}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-1">
              <Store className="h-3.5 w-3.5" />
              Pobočky v rozsahu
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{rangeSummary.branches.size}</div>
            <p className="text-xs text-muted-foreground mt-1">
              {rangeSummary.tx} transakcí celkem
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-1">
              <CalendarRange className="h-3.5 w-3.5" />
              Období
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-lg font-bold">
              {from === to ? from : `${from} — ${to}`}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {dayCount} {dayCount === 1 ? "den" : dayCount < 5 ? "dny" : "dní"}
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <CalendarDays className="h-4 w-4" />
            Graf tržeb
          </CardTitle>
          <CardDescription>
            {chartLoading
              ? granularity === "hour"
                ? "Načítání transakcí z uzávěrek…"
                : "Načítání dat…"
              : granularity === "hour"
                ? "Tržby podle času jednotlivých prodejů z .wsbak"
                : allBranches && chartOutput.stacked
                  ? "Skládaný sloupec = prodejny v daném období (najeď pro kód a částku)"
                  : "Tržby z uzávěrek ve zvoleném rozsahu"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs
            value={granularity}
            onValueChange={(v) => setGranularity(v as ChartGranularity)}
          >
            <TabsList className="mb-4">
              <TabsTrigger value="hour" disabled={!canUseHourly}>
                Intradenní
              </TabsTrigger>
              <TabsTrigger value="day">Denní</TabsTrigger>
              <TabsTrigger value="month">Měsíční</TabsTrigger>
            </TabsList>

            {(["hour", "day", "month"] as ChartGranularity[]).map((g) => (
              <TabsContent key={g} value={g}>
                {!allBranches && selectedBranchIds.size === 0 ? (
                  <p className="text-sm text-muted-foreground py-12 text-center">
                    Vyberte alespoň jednu prodejnu v seznamu výše
                  </p>
                ) : chartLoading || !hourlyReady ? (
                  <p className="text-sm text-muted-foreground py-12 text-center">
                    {hourlyError
                      ? "Nepodařilo se načíst transakce z uzávěrky"
                      : "Načítání transakcí z uzávěrky…"}
                  </p>
                ) : chartOutput.rows.every(
                    (r) => Number(r.total) === 0 && Number(r.revenue ?? 0) === 0
                  ) ? (
                  <p className="text-sm text-muted-foreground py-12 text-center">
                    {granularity === "hour"
                      ? "Pro intradenní graf chybí uzávěrka s transakcemi pro tento den"
                      : "V tomto období nejsou žádné uzávěrky"}
                  </p>
                ) : (
                  <ChartContainer config={chartConfig} className="h-[320px] w-full">
                    <BarChart
                      data={chartOutput.rows}
                      margin={{ top: 8, right: 8, left: 0, bottom: g === "month" ? 40 : 0 }}
                    >
                      <CartesianGrid vertical={false} />
                      <XAxis
                        dataKey="label"
                        tickLine={false}
                        axisLine={false}
                        fontSize={11}
                        interval={g === "hour" ? 1 : g === "day" && chartOutput.rows.length > 20 ? 2 : 0}
                        angle={g === "month" ? -25 : 0}
                        textAnchor={g === "month" ? "end" : "middle"}
                        height={g === "month" ? 50 : 30}
                      />
                      <YAxis
                        tickLine={false}
                        axisLine={false}
                        fontSize={11}
                        tickFormatter={(v) => `${Math.round(Number(v) / 1000)}k`}
                      />
                      <ChartTooltip
                        content={
                          chartOutput.stacked ? (
                            <StackedBranchTooltip labels={chartOutput.labels} />
                          ) : (
                            <SimpleTooltip />
                          )
                        }
                      />
                      {chartOutput.stacked ? (
                        chartOutput.branchIds.map((id) => (
                          <Bar
                            key={branchDataKey(id)}
                            dataKey={branchDataKey(id)}
                            stackId="branches"
                            fill={chartOutput.colors[branchDataKey(id)]}
                            radius={0}
                          />
                        ))
                      ) : (
                        <Bar
                          dataKey="revenue"
                          fill={chartOutput.colors.revenue ?? EMERALD_DARK}
                          radius={[4, 4, 0, 0]}
                        />
                      )}
                    </BarChart>
                  </ChartContainer>
                )}

                {chartOutput.stacked && chartOutput.branchIds.length > 0 && (
                  <div className="mt-4 flex flex-wrap gap-3">
                    {chartOutput.branchIds.map((id) => {
                      const key = branchDataKey(id);
                      return (
                        <div key={id} className="flex items-center gap-1.5 text-xs">
                          <span
                            className="h-2.5 w-2.5 rounded-sm"
                            style={{ backgroundColor: chartOutput.colors[key] }}
                          />
                          <span className="font-medium">{chartOutput.labels[key]}</span>
                          <span className="text-muted-foreground truncate max-w-[120px]">
                            {branchMeta.get(id)?.name}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </TabsContent>
            ))}
          </Tabs>

          {!canUseHourly && (
            <p className={cn("text-xs text-muted-foreground mt-2")}>
              Intradenní přehled je dostupný jen pro rozsah jednoho dne (např. „Dnes“ nebo vlastní od–do stejný den).
            </p>
          )}
        </CardContent>
      </Card>

      <TurnoverInsightsPanel
        insights={periodInsights}
        hourlyLoading={insightHoursLoading}
        productLimit={30}
        description={
          dayCount > HOURLY_INSIGHTS_MAX_DAYS
            ? `Nejlepší/nejtišší den z období ${from === to ? from : `${from} – ${to}`}. Produkty a hodiny jen do ${HOURLY_INSIGHTS_MAX_DAYS} dní (dešifrování uzávěrek).`
            : `Metriky z období ${from === to ? from : `${from} – ${to}`} · produkty z transakcí v uzávěrkách`
        }
      />
    </div>
  );
}

export function AdminTurnoverCharts() {
  return <TurnoverCharts />;
}
