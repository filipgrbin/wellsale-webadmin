"use client";

import useSWR from "swr";
import { buildReconcileReport } from "@/lib/day-reconcile";
import { formatCurrency, formatDisplayDate, formatDisplayDateRange } from "@/lib/turnover-utils";
import { DayReconcileBadge } from "@/components/day-reconcile-badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Scale, Loader2 } from "lucide-react";

interface DayReconcilePanelProps {
  licenseKey: string;
  /** When set, only this branch (mainadmin branch detail). */
  branchId?: number;
  days?: number;
  /** Softer copy for subadmin; mainadmin gets diagnostic wording. */
  variant?: "operator" | "admin";
}

export function DayReconcilePanel({
  licenseKey,
  branchId,
  days = 7,
  variant = "admin",
}: DayReconcilePanelProps) {
  const { data, error, isLoading } = useSWR(
    ["day-reconcile-report", licenseKey, branchId ?? "all", days],
    () => buildReconcileReport({ licenseKey, days, branchId }),
    { revalidateOnFocus: false, dedupingInterval: 60_000 }
  );

  const problemRows =
    data?.results.filter(
      (r) => r.status === "error" || r.status === "warning" || r.status === "no_live"
    ) ?? [];

  const title =
    variant === "operator"
      ? `Kontrola uzávěrek · posledních ${days} dní`
      : `Shoda prodejů × uzávěrek · ${days} dní`;

  const description =
    variant === "operator"
      ? "Technická kontrola na spodku stránky — běžný provoz řešte v transakcích výše."
      : "Porovnání součů prodejů s nahranými uzávěrkami (pro diagnostiku).";

  return (
    <Card className="border-border bg-card">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Scale className="h-4 w-4" />
          {title}
        </CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading && (
          <p className="text-sm text-muted-foreground flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" />
            Kontroluji shodu…
          </p>
        )}

        {error && (
          <p className="text-sm text-destructive">
            {error instanceof Error ? error.message : "Kontrola selhala"}
          </p>
        )}

        {data && !isLoading && (
          <>
            <div className="flex flex-wrap gap-2 text-xs">
              <Badge variant="outline" className="border-emerald-500/40 text-emerald-700 dark:text-emerald-400">
                OK {data.okCount}
              </Badge>
              <Badge variant="outline" className="border-amber-500/40 text-amber-800 dark:text-amber-400">
                Varování {data.warningCount}
              </Badge>
              <Badge variant="outline" className="border-red-500/40 text-red-700 dark:text-red-400">
                Neshoda {data.errorCount}
              </Badge>
              <Badge variant="outline" className="border-sky-500/40 text-sky-800 dark:text-sky-400">
                Chybí prodeje {data.noLiveCount}
              </Badge>
            </div>

            {problemRows.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Žádné neshody v období {formatDisplayDateRange(data.from, data.to)}.
              </p>
            ) : (
              <div className="overflow-x-auto rounded-lg border border-border">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted/40 text-left text-xs text-muted-foreground">
                      <th className="px-3 py-2 font-medium">Datum</th>
                      {!branchId && (
                        <th className="px-3 py-2 font-medium">Prodejna</th>
                      )}
                      <th className="px-3 py-2 font-medium text-right">Prodeje</th>
                      <th className="px-3 py-2 font-medium text-right">Uzávěrka</th>
                      <th className="px-3 py-2 font-medium">Stav</th>
                    </tr>
                  </thead>
                  <tbody>
                    {problemRows.map((r) => (
                      <tr
                        key={`${r.branchId}-${r.closeDate}`}
                        className="border-b border-border last:border-0"
                      >
                        <td className="px-3 py-2 tabular-nums">
                          {formatDisplayDate(r.closeDate)}
                        </td>
                        {!branchId && (
                          <td className="px-3 py-2">
                            <span className="font-medium">{r.branchCode || `#${r.branchId}`}</span>
                            {r.branchName && (
                              <span className="text-muted-foreground"> · {r.branchName}</span>
                            )}
                          </td>
                        )}
                        <td className="px-3 py-2 text-right tabular-nums">
                          {formatCurrency(r.live.revenue)}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {r.uzaverka ? formatCurrency(r.uzaverka.revenue) : "—"}
                        </td>
                        <td className="px-3 py-2">
                          <div className="flex flex-col gap-0.5 items-start">
                            <DayReconcileBadge result={r} />
                            {r.hint && (
                              <span className="text-[10px] text-muted-foreground max-w-[220px]">
                                {r.hint}
                              </span>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
