"use client";

import useSWR from "swr";
import { buildReconcileReport, DATA_SOURCE_ROLES_BLURB } from "@/lib/day-reconcile";
import { formatCurrency } from "@/lib/turnover-utils";
import { summarizeCapability } from "@/lib/app-capabilities";
import { DayReconcileBadge } from "@/components/day-reconcile-badge";
import { AppCapabilityNotice } from "@/components/app-capability-notice";
import { getBranches } from "@/lib/api";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Scale, Loader2 } from "lucide-react";

interface DayReconcilePanelProps {
  licenseKey: string;
  days?: number;
}

export function DayReconcilePanel({ licenseKey, days = 7 }: DayReconcilePanelProps) {
  const { data: branchesData } = useSWR(
    ["day-reconcile-branches", licenseKey],
    () => getBranches(licenseKey)
  );
  const liveCap = summarizeCapability(
    (branchesData?.branches ?? []).filter((b) => !b.archived_at),
    "livePosSync"
  );

  const { data, error, isLoading } = useSWR(
    ["day-reconcile-report", licenseKey, days],
    () => buildReconcileReport({ licenseKey, days }),
    { revalidateOnFocus: false, dedupingInterval: 60_000 }
  );

  const problemRows =
    data?.results.filter((r) =>
      r.status === "error" || r.status === "warning" || r.status === "no_live"
    ) ?? [];

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Scale className="h-4 w-4" />
          Kontrola shody · posledních {days} dní
        </CardTitle>
        <CardDescription>{DATA_SOURCE_ROLES_BLURB}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <AppCapabilityNotice notice={liveCap.notice} />
        {isLoading && (
          <p className="text-sm text-muted-foreground flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" />
            Porovnávám live transakce s uzávěrkami…
          </p>
        )}

        {error && (
          <p className="text-sm text-destructive">
            {error instanceof Error ? error.message : "Kontrola selhala"}
          </p>
        )}

        {data && !isLoading && (
          <>
            <div className="flex flex-wrap gap-2">
              <Badge variant="outline" className="border-emerald-500/40 text-emerald-700">
                OK {data.okCount}
              </Badge>
              <Badge variant="outline" className="border-amber-500/40 text-amber-700">
                Varování {data.warningCount}
              </Badge>
              <Badge variant="outline" className="border-red-500/40 text-red-700">
                Neshody {data.errorCount}
              </Badge>
              <Badge variant="outline" className="border-sky-500/40 text-sky-700">
                Bez live {data.noLiveCount}
              </Badge>
            </div>

            {problemRows.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Žádné neshody mezi live a uzávěrkami v období {data.from} – {data.to}.
              </p>
            ) : (
              <div className="rounded-lg border border-border overflow-hidden">
                <div className="max-h-64 overflow-y-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/50 sticky top-0 text-xs text-muted-foreground text-left">
                      <tr>
                        <th className="px-3 py-2 font-medium">Den</th>
                        <th className="px-3 py-2 font-medium">Prodejna</th>
                        <th className="px-3 py-2 font-medium text-right">Uzávěrka</th>
                        <th className="px-3 py-2 font-medium text-right">Live</th>
                        <th className="px-3 py-2 font-medium">Stav</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {problemRows.map((r) => (
                        <tr key={`${r.branchId}|${r.closeDate}|${r.backupId ?? 0}`}>
                          <td className="px-3 py-2 font-mono text-xs">{r.closeDate}</td>
                          <td className="px-3 py-2">
                            {r.branchCode || r.branchName || `#${r.branchId}`}
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums">
                            {r.uzaverka ? formatCurrency(r.uzaverka.revenue) : "—"}
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums">
                            {formatCurrency(r.live.revenue)}
                          </td>
                          <td className="px-3 py-2">
                            <DayReconcileBadge result={r} />
                            <p className="text-[11px] text-muted-foreground mt-0.5 max-w-[220px]">
                              {r.hint}
                            </p>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
