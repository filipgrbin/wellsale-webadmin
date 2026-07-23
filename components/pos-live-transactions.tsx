"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import useSWR from "swr";
import {
  getBranches,
  getLicenses,
  getPosTransactions,
  type Branch,
  type PosTransaction,
} from "@/lib/api";
import {
  fetchAllPosTransactions,
  fetchOlderPosTransactions,
  filterTxByBranches,
  formatCurrency,
  formatPaymentLabel,
  formatTxTime,
  itemsSummary,
  mergeTransactions,
  rangeToWallClock,
  sortTxNewestFirst,
  sumTxRevenue,
  txKey,
} from "@/lib/pos-transactions";
import { pragueDate, type RangePreset, formatDisplayDate, formatDisplayDateRange } from "@/lib/turnover-utils";
import { summarizeCapability } from "@/lib/app-capabilities";
import { AppCapabilityNotice } from "@/components/app-capability-notice";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import {
  ChevronDown,
  ChevronUp,
  Loader2,
  Receipt,
  Store,
  TrendingUp,
} from "lucide-react";
import { cn } from "@/lib/utils";

const PREVIEW_COUNT = 5;
const POLL_MS = 60_000;

const PRESET_LABEL: Record<RangePreset, string> = {
  today: "Dnes",
  week: "Poslední týden",
  month: "Poslední měsíc",
  custom: "Vlastní období",
};

export interface PosRangeValue {
  preset: RangePreset;
  customFrom: string;
  customTo: string;
}

interface PosLiveTransactionsProps {
  /** Subadmin: locked license. Mainadmin: optional; must select if omitted. */
  licenseKey?: string;
  /** When false, show license picker (mainadmin). */
  lockLicense?: boolean;
  /** Controlled period (shared with chart below). */
  range?: PosRangeValue;
  onRangeChange?: (next: PosRangeValue) => void;
}

export function PosLiveTransactions({
  licenseKey: fixedLicenseKey,
  lockLicense = Boolean(fixedLicenseKey),
  range: controlledRange,
  onRangeChange,
}: PosLiveTransactionsProps) {
  const today = pragueDate(new Date());
  const [licenseFilter, setLicenseFilter] = useState<string>(fixedLicenseKey || "");
  const [internalRange, setInternalRange] = useState<PosRangeValue>({
    preset: "today",
    customFrom: today,
    customTo: today,
  });
  const [allBranches, setAllBranches] = useState(true);
  const [selectedBranchIds, setSelectedBranchIds] = useState<Set<number>>(new Set());
  const [expanded, setExpanded] = useState(false);
  const [txs, setTxs] = useState<PosTransaction[]>([]);
  const [nextSince, setNextSince] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasMoreOlder, setHasMoreOlder] = useState(true);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const nextSinceRef = useRef<string | null>(null);

  const range = controlledRange ?? internalRange;
  const setRange = (next: PosRangeValue) => {
    if (onRangeChange) onRangeChange(next);
    if (!controlledRange) setInternalRange(next);
  };

  const { preset: rangePreset, customFrom, customTo } = range;
  const { from: wallFrom, to: wallTo, dayFrom, dayTo } = rangeToWallClock(
    rangePreset,
    customFrom,
    customTo
  );
  const isSingleToday = dayFrom === dayTo && dayFrom === today;

  useEffect(() => {
    nextSinceRef.current = nextSince;
  }, [nextSince]);

  const effectiveLicense = fixedLicenseKey || (licenseFilter || undefined);

  const { data: licensesData } = useSWR(lockLicense ? null : "licenses", getLicenses);
  const { data: branchesData } = useSWR(
    effectiveLicense ? ["pos-live-branches", effectiveLicense] : null,
    () => getBranches(effectiveLicense)
  );

  const availableBranches = useMemo(() => {
    return (branchesData?.branches ?? []).filter((b) => !b.archived_at);
  }, [branchesData]);

  const liveCap = useMemo(
    () => summarizeCapability(availableBranches, "livePosSync"),
    [availableBranches]
  );

  const activeBranchIds = useMemo((): number[] | null => {
    if (allBranches) return null;
    return [...selectedBranchIds];
  }, [allBranches, selectedBranchIds]);

  const scope = useMemo(() => {
    if (!effectiveLicense) return null;
    if (activeBranchIds && activeBranchIds.length === 1) {
      return { branchId: activeBranchIds[0] };
    }
    return { licenseKey: effectiveLicense };
  }, [effectiveLicense, activeBranchIds]);

  const visibleTxs = useMemo(() => {
    let list = txs;
    if (activeBranchIds && activeBranchIds.length > 1) {
      list = filterTxByBranches(list, activeBranchIds);
    } else if (activeBranchIds && activeBranchIds.length === 0) {
      list = [];
    }
    return list;
  }, [txs, activeBranchIds]);

  const periodSummary = useMemo(() => sumTxRevenue(visibleTxs), [visibleTxs]);

  const shown = expanded ? visibleTxs : visibleTxs.slice(0, PREVIEW_COUNT);
  const hiddenCount = Math.max(0, visibleTxs.length - PREVIEW_COUNT);

  const branchMeta = useMemo(() => {
    const m = new Map<number, Branch>();
    for (const b of availableBranches) m.set(b.id, b);
    return m;
  }, [availableBranches]);

  const inRangeFilter = useCallback(
    (t: PosTransaction) => {
      const created = String(t.created_at || "");
      return created >= wallFrom && created <= wallTo;
    },
    [wallFrom, wallTo]
  );

  const loadRange = useCallback(async () => {
    if (!scope) return;
    setLoading(true);
    setError(null);
    try {
      if (isSingleToday) {
        const res = await getPosTransactions({
          ...scope,
          day: today,
          limit: 1000,
        });
        let list = (res.transactions || []).filter((t) => !t.deleted_at);
        if (list.length === 0) {
          const paged = await fetchAllPosTransactions(scope, wallFrom, wallTo, { maxPages: 5 });
          list = paged.transactions;
          setNextSince(paged.nextSince);
        } else {
          setNextSince(res.nextSince);
        }
        setTxs(list.sort(sortTxNewestFirst));
        setHasMoreOlder(list.length >= 1000);
      } else {
        const paged = await fetchAllPosTransactions(scope, wallFrom, wallTo, {
          maxPages: 25,
        });
        setTxs(paged.transactions.sort(sortTxNewestFirst));
        setNextSince(paged.nextSince);
        setHasMoreOlder(false);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Nepodařilo se načíst transakce");
      setTxs([]);
    } finally {
      setLoading(false);
    }
  }, [scope, isSingleToday, today, wallFrom, wallTo]);

  useEffect(() => {
    setTxs([]);
    setNextSince(null);
    setExpanded(false);
    setHasMoreOlder(isSingleToday);
    if (scope) void loadRange();
  }, [scope, loadRange, isSingleToday]);

  // Poll only for „dnes“ so new sales appear without refresh
  useEffect(() => {
    if (!scope || !isSingleToday) return;

    const tick = async () => {
      const since = nextSinceRef.current;
      if (!since) return;
      try {
        const res = await getPosTransactions({
          ...scope,
          since,
          limit: 200,
        });
        if (res.nextSince) setNextSince(res.nextSince);
        const incoming = res.transactions || [];
        if (incoming.length === 0) return;
        setTxs((prev) => {
          const merged = mergeTransactions(prev, incoming);
          return merged.filter(inRangeFilter);
        });
      } catch {
        // ignore poll errors
      }
    };

    pollRef.current = setInterval(tick, POLL_MS);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [scope, isSingleToday, inRangeFilter]);

  const loadMoreOlder = async () => {
    if (!scope || !isSingleToday || visibleTxs.length === 0) return;
    setLoadingMore(true);
    try {
      const oldest = visibleTxs[visibleTxs.length - 1];
      const older = await fetchOlderPosTransactions(
        scope,
        today,
        oldest.created_at,
        50
      );
      if (older.length === 0) {
        setHasMoreOlder(false);
      } else {
        setTxs((prev) => mergeTransactions(prev, older));
        if (older.length < 50) setHasMoreOlder(false);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Načtení dalších selhalo");
    } finally {
      setLoadingMore(false);
    }
  };

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
      ? "Vyberte prodejny"
      : `${selectedBranchIds.size} prodejen`;

  const periodHeadline =
    dayFrom === dayTo
      ? dayFrom === today
        ? "Dnešní tržby"
        : `Tržby · ${formatDisplayDate(dayFrom)}`
      : `Tržby · ${formatDisplayDateRange(dayFrom, dayTo)}`;

  const earnedLabel = isSingleToday
    ? "Vyděláno dnes"
    : `Tržby · ${formatDisplayDateRange(dayFrom, dayTo)}`;

  if (!lockLicense && !effectiveLicense) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Receipt className="h-4 w-4" />
            Prodeje
          </CardTitle>
          <CardDescription>Nejdřív vyberte licenci</CardDescription>
        </CardHeader>
        <CardContent>
          <Select value={licenseFilter || undefined} onValueChange={setLicenseFilter}>
            <SelectTrigger className="w-full sm:w-[280px]">
              <SelectValue placeholder="Licence…" />
            </SelectTrigger>
            <SelectContent>
              {(licensesData?.licenses ?? []).map((l) => (
                <SelectItem key={l.license_key} value={l.license_key}>
                  {l.owner_name} ({l.license_key})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <TrendingUp className="h-4 w-4" />
              {periodHeadline}
            </CardTitle>
            <CardDescription>
              Prodeje z pokladen — vyberte období a prodejny
            </CardDescription>
          </div>
          <div className="flex flex-wrap gap-2">
            {!lockLicense && (
              <Select value={licenseFilter || effectiveLicense} onValueChange={setLicenseFilter}>
                <SelectTrigger className="w-[200px]">
                  <SelectValue placeholder="Licence" />
                </SelectTrigger>
                <SelectContent>
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
                <Button variant="outline" size="sm" className="justify-between gap-2">
                  <Store className="h-4 w-4 shrink-0" />
                  {branchPickerLabel}
                  <ChevronDown className="h-4 w-4 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-72 p-3" align="end">
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="pos-all-branches"
                      checked={allBranches}
                      onCheckedChange={(c) => {
                        setAllBranches(c === true);
                        if (c) setSelectedBranchIds(new Set());
                      }}
                    />
                    <Label htmlFor="pos-all-branches" className="cursor-pointer font-medium">
                      Všechny prodejny
                    </Label>
                  </div>
                  {!allBranches && (
                    <div className="max-h-48 overflow-y-auto space-y-2 border-t border-border pt-2">
                      {availableBranches.map((b) => (
                        <div key={b.id} className="flex items-center gap-2">
                          <Checkbox
                            id={`pos-branch-${b.id}`}
                            checked={selectedBranchIds.has(b.id)}
                            onCheckedChange={() => toggleBranch(b.id)}
                          />
                          <Label htmlFor={`pos-branch-${b.id}`} className="cursor-pointer text-sm">
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
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-2">
          {(["today", "week", "month", "custom"] as RangePreset[]).map((p) => (
            <Button
              key={p}
              variant={rangePreset === p ? "default" : "outline"}
              size="sm"
              onClick={() => setRange({ ...range, preset: p })}
            >
              {PRESET_LABEL[p]}
            </Button>
          ))}
        </div>

        {rangePreset === "custom" && (
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1">
              <Label htmlFor="pos-from-date" className="text-xs">
                Od
              </Label>
              <Input
                id="pos-from-date"
                type="date"
                value={customFrom}
                max={customTo}
                onChange={(e) =>
                  setRange({ ...range, customFrom: e.target.value, preset: "custom" })
                }
                className="w-[160px]"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="pos-to-date" className="text-xs">
                Do
              </Label>
              <Input
                id="pos-to-date"
                type="date"
                value={customTo}
                min={customFrom}
                max={today}
                onChange={(e) =>
                  setRange({ ...range, customTo: e.target.value, preset: "custom" })
                }
                className="w-[160px]"
              />
            </div>
          </div>
        )}

        <AppCapabilityNotice notice={liveCap.notice} />

        <div className="flex flex-wrap items-end gap-6">
          <div>
            <p className="text-sm text-muted-foreground">{earnedLabel}</p>
            <p className="text-3xl font-bold tabular-nums text-emerald-600">
              {loading && txs.length === 0 ? "…" : formatCurrency(periodSummary.revenue)}
            </p>
          </div>
          <div className="text-sm text-muted-foreground space-y-0.5">
            <p>
              Hotovost {formatCurrency(periodSummary.cash)} · QR{" "}
              {formatCurrency(periodSummary.qr)}
            </p>
            <p>
              {periodSummary.txCount}{" "}
              {periodSummary.txCount === 1
                ? "transakce"
                : periodSummary.txCount >= 2 && periodSummary.txCount <= 4
                  ? "transakce"
                  : "transakcí"}{" "}
              · {periodSummary.branches.size}{" "}
              {periodSummary.branches.size === 1 ? "prodejna" : "prodejen"}
            </p>
          </div>
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        {!allBranches && selectedBranchIds.size === 0 ? (
          <p className="text-sm text-muted-foreground py-6 text-center">
            Vyberte alespoň jednu prodejnu
          </p>
        ) : loading && txs.length === 0 ? (
          <p className="text-sm text-muted-foreground py-6 text-center flex items-center justify-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" />
            Načítám transakce…
          </p>
        ) : visibleTxs.length === 0 ? (
          <p className="text-sm text-muted-foreground py-6 text-center">
            V tomto období zatím žádné transakce
          </p>
        ) : (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium flex items-center gap-2">
                <Receipt className="h-4 w-4" />
                Transakce
                <Badge variant="secondary" className="tabular-nums">
                  {visibleTxs.length}
                </Badge>
              </p>
              {hiddenCount > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="gap-1"
                  onClick={() => setExpanded((e) => !e)}
                >
                  {expanded ? (
                    <>
                      Sbalit <ChevronUp className="h-4 w-4" />
                    </>
                  ) : (
                    <>
                      Rozbalit (+{hiddenCount}) <ChevronDown className="h-4 w-4" />
                    </>
                  )}
                </Button>
              )}
            </div>

            <ul className="divide-y divide-border rounded-lg border border-border">
              {shown.map((tx) => {
                const branch = branchMeta.get(tx.branch_id);
                return (
                  <li
                    key={txKey(tx)}
                    className={cn(
                      "flex flex-col gap-0.5 sm:flex-row sm:items-center sm:justify-between",
                      "px-3 py-2.5 text-sm"
                    )}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium tabular-nums">
                          {formatTxTime(tx.created_at)}
                        </span>
                        <Badge
                          variant="secondary"
                          className="text-xs sm:text-sm font-semibold px-2.5 py-1 gap-1.5"
                        >
                          <span>{branch?.code || `#${tx.branch_id}`}</span>
                          {branch?.name ? (
                            <span className="font-normal text-muted-foreground">
                              · {branch.name}
                            </span>
                          ) : null}
                        </Badge>
                        <span className="text-xs text-muted-foreground">
                          {formatPaymentLabel(tx.payment_method)}
                        </span>
                      </div>
                      <p
                        className="text-xs text-muted-foreground truncate mt-0.5"
                        title={itemsSummary(tx, 8)}
                      >
                        {itemsSummary(tx)}
                      </p>
                    </div>
                    <div className="font-semibold tabular-nums text-emerald-600 shrink-0">
                      {formatCurrency(Number(tx.total) || 0)}
                    </div>
                  </li>
                );
              })}
            </ul>

            {expanded && isSingleToday && (
              <div className="flex justify-center pt-1">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={loadingMore || !hasMoreOlder}
                  onClick={() => void loadMoreOlder()}
                >
                  {loadingMore ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                      Načítám…
                    </>
                  ) : hasMoreOlder ? (
                    "Načíst další"
                  ) : (
                    "Žádné starší transakce"
                  )}
                </Button>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
