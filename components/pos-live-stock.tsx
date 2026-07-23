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
import { formatDisplayDateTime, pragueDate } from "@/lib/turnover-utils";

interface PosLiveStockProps {
  licenseKey: string;
}

export function PosLiveStock({ licenseKey }: PosLiveStockProps) {
  const [allBranches, setAllBranches] = useState(true);
  const [selectedBranchIds, setSelectedBranchIds] = useState<Set<number>>(new Set());
  const [movements, setMovements] = useState<PosStockMovement[]>([]);
  const [nextSince, setNextSince] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [truncated, setTruncated] = useState(false);
  const [search, setSearch] = useState("");
  const nextSinceRef = useRef<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

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
    if (activeBranchIds && activeBranchIds.length === 1) {
      return { branchId: activeBranchIds[0] };
    }
    return { licenseKey };
  }, [licenseKey, activeBranchIds]);

  const loadSnapshot = useCallback(async () => {
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
    void loadSnapshot();
  }, [loadSnapshot]);

  // Poll for new / updated movements
  useEffect(() => {
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

  const todayKey = pragueDate(new Date());
  const todayMovements = useMemo(() => {
    const q = search.trim().toLowerCase();
    return filteredMovements
      .filter((m) => {
        const at = String(m.created_at || "");
        // Prague calendar day match (YYYY-MM-DD prefix or pragueDate parse)
        const day =
          /^\d{4}-\d{2}-\d{2}/.test(at) ? at.slice(0, 10) : pragueDate(new Date(at));
        return day === todayKey;
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
  }, [filteredMovements, todayKey, search, branchMeta]);

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

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Warehouse className="h-6 w-6" />
            Sklad
          </h2>
          <p className="text-muted-foreground">
            Aktuální stav skladu na prodejnách

          </p>
        </div>
        <div className="flex flex-wrap gap-2">
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
                    id="stock-all-branches"
                    checked={allBranches}
                    onCheckedChange={(c) => {
                      setAllBranches(c === true);
                      if (c) setSelectedBranchIds(new Set());
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
          <CardTitle className="text-base">Pohyby za dnešek ({todayKey})</CardTitle>
          <CardDescription>
            Jednotlivé skladové pohyby — stejný filtr prodejen jako výše. ID pohybu a vazba na
            transakci.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!allBranches && selectedBranchIds.size === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">
              Vyberte alespoň jednu prodejnu
            </p>
          ) : loading && movements.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center flex items-center justify-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              Načítám…
            </p>
          ) : todayMovements.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">
              Dnes zatím žádné pohyby ve vybraném rozsahu.
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
                    {todayMovements.map((m) => {
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
                {todayMovements.length}{" "}
                {todayMovements.length === 1 ? "pohyb" : "pohybů"} dnes
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
