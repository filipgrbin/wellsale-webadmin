"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import useSWR from "swr";
import {
  getBranches,
  getPosStockMovements,
  type Branch,
  type PosStockMovement,
} from "@/lib/api";
import {
  POS_STOCK_POLL_MS,
  buildCurrentStockLevels,
  fetchAllStockMovements,
  formatStockKind,
  mergeMovements,
  type ProductStockLevel,
} from "@/lib/pos-stock";
import { summarizeCapability } from "@/lib/app-capabilities";
import { AppCapabilityNotice } from "@/components/app-capability-notice";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  ChevronDown,
  Loader2,
  Package,
  RefreshCw,
  Search,
  Store,
  Warehouse,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  formatDisplayDate,
  formatDisplayDateRange,
  formatDisplayDateTime,
  getEffectiveDateRange,
  pragueDate,
  type RangePreset,
} from "@/lib/turnover-utils";

const PRESET_LABEL: Record<RangePreset, string> = {
  today: "Dnes",
  week: "Poslední týden",
  month: "Poslední měsíc",
  custom: "Vlastní období",
};

interface PosLiveStockProps {
  licenseKey: string;
}

function movementDayKey(createdAt: string): string {
  const at = String(createdAt || "");
  if (/^\d{4}-\d{2}-\d{2}/.test(at)) return at.slice(0, 10);
  const t = Date.parse(at);
  if (Number.isFinite(t)) return pragueDate(new Date(t));
  return "";
}

export function PosLiveStock({ licenseKey }: PosLiveStockProps) {
  const today = pragueDate(new Date());
  // Default: jedna prodejna (ne „všechny“) — méně matoucí u skladu.
  const [allBranches, setAllBranches] = useState(false);
  const [selectedBranchIds, setSelectedBranchIds] = useState<Set<number>>(new Set());
  const [movements, setMovements] = useState<PosStockMovement[]>([]);
  const [nextSince, setNextSince] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [truncated, setTruncated] = useState(false);
  const [search, setSearch] = useState("");
  const [rangePreset, setRangePreset] = useState<RangePreset>("today");
  const [customFrom, setCustomFrom] = useState(today);
  const [customTo, setCustomTo] = useState(today);
  const nextSinceRef = useRef<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const defaultBranchInitRef = useRef(false);

  useEffect(() => {
    nextSinceRef.current = nextSince;
  }, [nextSince]);

  const { data: branchesData } = useSWR(
    ["pos-stock-branches", licenseKey],
    () => getBranches(licenseKey)
  );

  const availableBranches = useMemo(
    () => (branchesData?.branches ?? []).filter((b) => !b.archived_at),
    [branchesData]
  );

  // Po načtení prodejen zvolit první (pokud uživatel ještě nic nevybral).
  useEffect(() => {
    if (defaultBranchInitRef.current) return;
    if (availableBranches.length === 0) return;
    defaultBranchInitRef.current = true;
    setAllBranches(false);
    setSelectedBranchIds(new Set([availableBranches[0].id]));
  }, [availableBranches]);

  const stockCap = useMemo(
    () => summarizeCapability(availableBranches, "liveStockMovements"),
    [availableBranches]
  );

  const branchMeta = useMemo(() => {
    const m = new Map<number, Branch>();
    for (const b of availableBranches) m.set(b.id, b);
    return m;
  }, [availableBranches]);

  const activeBranchIds = useMemo((): number[] | null => {
    if (allBranches) return null;
    return [...selectedBranchIds];
  }, [allBranches, selectedBranchIds]);

  const scope = useMemo(() => {
    // Než doběhne defaultní výběr první prodejny — nic nenačítej
    if (!allBranches && selectedBranchIds.size === 0) return null;
    if (activeBranchIds && activeBranchIds.length === 1) {
      return { branchId: activeBranchIds[0] };
    }
    return { licenseKey };
  }, [licenseKey, activeBranchIds, allBranches, selectedBranchIds.size]);

  const loadSnapshot = useCallback(async () => {
    if (!scope) return;
    setLoading(true);
    setError(null);
    try {
      const result = await fetchAllStockMovements(scope);
      setMovements(result.movements);
      setNextSince(result.nextSince);
      setTruncated(result.truncated);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Nepodařilo se načíst sklad");
      setMovements([]);
    } finally {
      setLoading(false);
    }
  }, [scope]);

  useEffect(() => {
    setMovements([]);
    setNextSince(null);
    if (scope) void loadSnapshot();
  }, [loadSnapshot, scope]);

  // Poll for new / updated movements
  useEffect(() => {
    if (!scope) return;
    const tick = async () => {
      const since = nextSinceRef.current;
      if (!since) return;
      try {
        const res = await getPosStockMovements({
          ...scope,
          since,
          limit: 500,
        });
        if (res.nextSince) setNextSince(res.nextSince);
        const incoming = res.movements || [];
        if (incoming.length === 0) return;
        setMovements((prev) => mergeMovements(prev, incoming));
      } catch {
        // ignore poll errors
      }
    };

    pollRef.current = setInterval(tick, POS_STOCK_POLL_MS);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [scope]);

  const filteredMovements = useMemo(() => {
    if (!activeBranchIds) return movements;
    if (activeBranchIds.length === 0) return [];
    if (activeBranchIds.length === 1) return movements; // already scoped by API
    const set = new Set(activeBranchIds);
    return movements.filter((m) => set.has(m.branch_id));
  }, [movements, activeBranchIds]);

  const levels: ProductStockLevel[] = useMemo(
    () => buildCurrentStockLevels(filteredMovements),
    [filteredMovements]
  );

  const visibleLevels = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return levels;
    return levels.filter(
      (l) =>
        l.productName.toLowerCase().includes(q) ||
        (l.productId != null && String(l.productId).includes(q)) ||
        (branchMeta.get(l.branchId)?.code || "").toLowerCase().includes(q)
    );
  }, [levels, search, branchMeta]);

  const { from: dayFrom, to: dayTo } = useMemo(
    () => getEffectiveDateRange(rangePreset, customFrom, customTo),
    [rangePreset, customFrom, customTo]
  );

  const rangeMovements = useMemo(() => {
    const q = search.trim().toLowerCase();
    return filteredMovements
      .filter((m) => {
        const day = movementDayKey(String(m.created_at || ""));
        if (!day) return false;
        return day >= dayFrom && day <= dayTo;
      })
      .filter((m) => {
        if (!q) return true;
        const name = String(m.product_name || "").toLowerCase();
        const branch = branchMeta.get(m.branch_id);
        return (
          name.includes(q) ||
          String(m.local_id || "").includes(q) ||
          String(m.transaction_id || "").includes(q) ||
          String(m.product_id || "").includes(q) ||
          (branch?.code || "").toLowerCase().includes(q)
        );
      });
  }, [filteredMovements, dayFrom, dayTo, search, branchMeta]);

  const movementsHeadline =
    dayFrom === dayTo
      ? dayFrom === today
        ? "Pohyby za dnešek"
        : `Pohyby · ${formatDisplayDate(dayFrom)}`
      : `Pohyby · ${formatDisplayDateRange(dayFrom, dayTo)}`;

  const totals = useMemo(() => {
    let known = 0;
    let units = 0;
    let low = 0;
    for (const l of visibleLevels) {
      if (l.stock != null) {
        known += 1;
        units += l.stock;
        if (l.stock <= 0) low += 1;
      }
    }
    return { products: visibleLevels.length, known, units, low };
  }, [visibleLevels]);

  const toggleBranch = (id: number) => {
    setAllBranches(false);
    setSelectedBranchIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const branchPickerLabel = useMemo(() => {
    if (allBranches) return "Všechny prodejny";
    if (selectedBranchIds.size === 0) return "Vyberte prodejny";
    if (selectedBranchIds.size === 1) {
      const id = [...selectedBranchIds][0];
      const b = branchMeta.get(id);
      return b ? `${b.code} — ${b.name}` : `Prodejna #${id}`;
    }
    return `${selectedBranchIds.size} prodejen`;
  }, [allBranches, selectedBranchIds, branchMeta]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Warehouse className="h-6 w-6" />
            Sklad
          </h2>
          <p className="text-muted-foreground">
            Stav skladu a pohyby podle vybrané prodejny
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="justify-between gap-2 max-w-[280px]">
                <Store className="h-4 w-4 shrink-0" />
                <span className="truncate">{branchPickerLabel}</span>
                <ChevronDown className="h-4 w-4 shrink-0 opacity-50" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-72 p-3" align="end">
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="stock-all-branches"
                    checked={allBranches}
                    onCheckedChange={(c) => {
                      if (c === true) {
                        setAllBranches(true);
                        setSelectedBranchIds(new Set());
                        return;
                      }
                      setAllBranches(false);
                      // Při vypnutí „všechny“ nechat aspoň první prodejnu
                      if (selectedBranchIds.size === 0 && availableBranches[0]) {
                        setSelectedBranchIds(new Set([availableBranches[0].id]));
                      }
                    }}
                  />
                  <Label htmlFor="stock-all-branches" className="cursor-pointer font-medium">
                    Všechny prodejny
                  </Label>
                </div>
                {!allBranches && (
                  <div className="max-h-48 overflow-y-auto space-y-2 border-t border-border pt-2">
                    {availableBranches.map((b) => (
                      <div key={b.id} className="flex items-center gap-2">
                        <Checkbox
                          id={`stock-branch-${b.id}`}
                          checked={selectedBranchIds.has(b.id)}
                          onCheckedChange={() => toggleBranch(b.id)}
                        />
                        <Label htmlFor={`stock-branch-${b.id}`} className="cursor-pointer text-sm">
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
          <Button
            variant="outline"
            size="sm"
            onClick={() => void loadSnapshot()}
            disabled={loading}
            className="gap-1.5"
          >
            <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
            Obnovit
          </Button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <AppCapabilityNotice notice={stockCap.notice} className="sm:col-span-3" />
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Produkty</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold tabular-nums">{totals.products}</div>
            <p className="text-xs text-muted-foreground mt-1">s evidovaným pohybem</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Kusů celkem</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold tabular-nums">{totals.units}</div>
            <p className="text-xs text-muted-foreground mt-1">
              ze {totals.known} položek se známým stavem
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Vyprodané / 0</CardTitle>
          </CardHeader>
          <CardContent>
            <div
              className={cn(
                "text-2xl font-bold tabular-nums",
                totals.low > 0 ? "text-amber-600" : undefined
              )}
            >
              {totals.low}
            </div>
            <p className="text-xs text-muted-foreground mt-1">stav ≤ 0</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <Package className="h-4 w-4" />
                Stav skladu podle produktu
              </CardTitle>
              <CardDescription>
                Poslední aktualizace ze skladu · obnovuje se každou minutu
                {truncated ? " · historie zkrácena limitem API" : ""}
              </CardDescription>
            </div>
            <div className="relative w-full sm:w-64">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Hledat produkt…"
                className="pl-9"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {error && <p className="text-sm text-destructive mb-3">{error}</p>}

          {!allBranches && selectedBranchIds.size === 0 ? (
            <p className="text-sm text-muted-foreground py-10 text-center">
              Vyberte alespoň jednu prodejnu
            </p>
          ) : loading && movements.length === 0 ? (
            <p className="text-sm text-muted-foreground py-10 text-center flex items-center justify-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              Načítám skladové pohyby…
            </p>
          ) : visibleLevels.length === 0 ? (
            <p className="text-sm text-muted-foreground py-10 text-center">
              Zatím žádné údaje o skladu. Zkuste to později nebo ověřte, že pokladny běží.
            </p>
          ) : (
            <div className="rounded-lg border border-border overflow-hidden">
              <div className="overflow-x-auto max-h-[520px] overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 sticky top-0 z-10">
                    <tr className="text-left text-xs text-muted-foreground">
                      <th className="px-3 py-2 font-medium">Produkt</th>
                      <th className="px-3 py-2 font-medium">Prodejna</th>
                      <th className="px-3 py-2 font-medium text-right">Stav</th>
                      <th className="px-3 py-2 font-medium">Poslední pohyb</th>
                      <th className="px-3 py-2 font-medium text-right">Δ</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {visibleLevels.map((row) => {
                      const branch = branchMeta.get(row.branchId);
                      const stockUnknown = row.stock == null;
                      const stockLow = row.stock != null && row.stock <= 0;
                      return (
                        <tr key={row.key} className="hover:bg-muted/30">
                          <td className="px-3 py-2.5">
                            <div className="font-medium leading-snug">{row.productName}</div>
                            {row.productId != null && (
                              <div className="text-[11px] text-muted-foreground font-mono">
                                id {row.productId}
                              </div>
                            )}
                          </td>
                          <td className="px-3 py-2.5">
                            <Badge variant="outline" className="font-normal">
                              {branch?.code || `#${row.branchId}`}
                            </Badge>
                          </td>
                          <td className="px-3 py-2.5 text-right">
                            <span
                              className={cn(
                                "text-base font-semibold tabular-nums",
                                stockLow && "text-amber-600",
                                stockUnknown && "text-muted-foreground"
                              )}
                            >
                              {stockUnknown ? "—" : row.stock}
                            </span>
                            <span className="text-xs text-muted-foreground ml-1">ks</span>
                          </td>
                          <td className="px-3 py-2.5 text-muted-foreground">
                            <div>{formatStockKind(row.lastKind)}</div>
                            <div className="text-[11px] font-mono truncate max-w-[140px]">
                              {String(row.lastAt || "").replace("T", " ").slice(0, 19)}
                            </div>
                          </td>
                          <td
                            className={cn(
                              "px-3 py-2.5 text-right tabular-nums font-medium",
                              row.lastDelta > 0 && "text-emerald-600",
                              row.lastDelta < 0 && "text-red-600"
                            )}
                          >
                            {row.lastDelta > 0 ? `+${row.lastDelta}` : row.lastDelta}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div className="px-3 py-2 border-t border-border text-xs text-muted-foreground flex justify-between">
                <span>
                  {visibleLevels.length}{" "}
                  {visibleLevels.length === 1 ? "řádek" : "řádků"}
                </span>
                <span>{filteredMovements.length} pohybů v paměti</span>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">{movementsHeadline}</CardTitle>
          <CardDescription>
            Jednotlivé skladové pohyby — stejný filtr prodejen jako výše. ID pohybu a vazba na
            transakci.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {(["today", "week", "month", "custom"] as RangePreset[]).map((p) => (
              <Button
                key={p}
                variant={rangePreset === p ? "default" : "outline"}
                size="sm"
                onClick={() => setRangePreset(p)}
              >
                {PRESET_LABEL[p]}
              </Button>
            ))}
          </div>

          {rangePreset === "custom" && (
            <div className="flex flex-wrap items-end gap-3">
              <div className="space-y-1">
                <Label htmlFor="stock-mov-from" className="text-xs">
                  Od
                </Label>
                <Input
                  id="stock-mov-from"
                  type="date"
                  value={customFrom}
                  max={customTo}
                  onChange={(e) => {
                    setCustomFrom(e.target.value);
                    setRangePreset("custom");
                  }}
                  className="w-[160px]"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="stock-mov-to" className="text-xs">
                  Do
                </Label>
                <Input
                  id="stock-mov-to"
                  type="date"
                  value={customTo}
                  min={customFrom}
                  max={today}
                  onChange={(e) => {
                    setCustomTo(e.target.value);
                    setRangePreset("custom");
                  }}
                  className="w-[160px]"
                />
              </div>
            </div>
          )}

          {!allBranches && selectedBranchIds.size === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">
              Vyberte alespoň jednu prodejnu
            </p>
          ) : loading && movements.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center flex items-center justify-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              Načítám…
            </p>
          ) : rangeMovements.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">
              V tomto období žádné pohyby ve vybraném rozsahu.
            </p>
          ) : (
            <div className="rounded-lg border border-border overflow-hidden">
              <div className="overflow-x-auto max-h-[420px] overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 sticky top-0 z-10">
                    <tr className="text-left text-xs text-muted-foreground">
                      <th className="px-3 py-2 font-medium">Čas</th>
                      <th className="px-3 py-2 font-medium">Prodejna</th>
                      <th className="px-3 py-2 font-medium">Produkt</th>
                      <th className="px-3 py-2 font-medium">Typ</th>
                      <th className="px-3 py-2 font-medium text-right">Δ</th>
                      <th className="px-3 py-2 font-medium text-right">Stav po</th>
                      <th className="px-3 py-2 font-medium">ID pohybu</th>
                      <th className="px-3 py-2 font-medium">TX id</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {rangeMovements.map((m) => {
                      const branch = branchMeta.get(m.branch_id);
                      return (
                        <tr
                          key={`${m.branch_id}:${m.local_id}`}
                          className="hover:bg-muted/30"
                        >
                          <td className="px-3 py-2 text-xs text-muted-foreground whitespace-nowrap font-mono">
                            {formatDisplayDateTime(m.created_at)}
                          </td>
                          <td className="px-3 py-2">
                            <Badge variant="outline" className="font-normal">
                              {branch?.code || `#${m.branch_id}`}
                            </Badge>
                          </td>
                          <td className="px-3 py-2">
                            <div className="font-medium leading-snug">
                              {m.product_name || "—"}
                            </div>
                            {m.product_id != null && (
                              <div className="text-[11px] text-muted-foreground font-mono">
                                produkt {m.product_id}
                              </div>
                            )}
                          </td>
                          <td className="px-3 py-2 text-muted-foreground">
                            {formatStockKind(m.kind)}
                          </td>
                          <td
                            className={cn(
                              "px-3 py-2 text-right tabular-nums font-medium",
                              m.delta > 0 && "text-emerald-600",
                              m.delta < 0 && "text-red-600"
                            )}
                          >
                            {m.delta > 0 ? `+${m.delta}` : m.delta}
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                            {m.stock_after == null ? "—" : m.stock_after}
                          </td>
                          <td className="px-3 py-2 font-mono text-xs">{m.local_id}</td>
                          <td className="px-3 py-2 font-mono text-xs">
                            {m.transaction_id != null ? m.transaction_id : "—"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div className="px-3 py-2 border-t border-border text-xs text-muted-foreground">
                {rangeMovements.length}{" "}
                {rangeMovements.length === 1 ? "pohyb" : "pohybů"} ·{" "}
                {dayFrom === dayTo
                  ? formatDisplayDate(dayFrom)
                  : formatDisplayDateRange(dayFrom, dayTo)}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
