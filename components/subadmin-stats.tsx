"use client";

import { useMemo } from "react";
import useSWR from "swr";
import { getBranches, getBackupsStats, getMachines, getBackups, type Backup } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Building2, Database, Monitor, HardDrive, TrendingUp, Receipt, Store } from "lucide-react";

interface SubadminStatsProps {
  licenseKey: string;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
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

// Shape of metadata_json on an `uzaverka` (daily closure) backup
interface UzaverkaMeta {
  close_id?: number;
  tx_count?: number;
  close_date?: string;
  total_revenue?: number;
}

export function SubadminStats({ licenseKey }: SubadminStatsProps) {
  const { data: branchesData } = useSWR(
    ["subadmin-branches", licenseKey],
    () => getBranches(licenseKey)
  );

  const { data: backupsData } = useSWR(
    ["subadmin-backups-stats", licenseKey],
    () => getBackupsStats({ licenseKey })
  );

  const { data: machinesData } = useSWR(
    ["subadmin-machines", licenseKey],
    () => getMachines(licenseKey)
  );

  // Today's turnover — only `uzaverka` (daily closure) backups count; `manual`
  // backups are just full DB snapshots, not closures, so they're ignored.
  const { data: turnoverBackups } = useSWR(
    ["subadmin-turnover-today", licenseKey],
    () => getBackups({ licenseKey, kind: "uzaverka", limit: 200 })
  );

  // "Today" in the shops' timezone (closure dates are local Czech dates).
  const today = useMemo(
    () =>
      new Intl.DateTimeFormat("en-CA", {
        timeZone: "Europe/Prague",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(new Date()),
    []
  );

  const todayTurnover = useMemo(() => {
    const backups = turnoverBackups?.backups ?? [];
    // Keep only the most recent closure per branch dated today (treats uzaverka
    // as the cumulative end-of-day Z-report, avoiding double-counting re-closes).
    const latestPerBranch = new Map<number, Backup>();
    for (const b of backups) {
      if (b.kind !== "uzaverka") continue;
      const meta = b.metadata_json as UzaverkaMeta | null;
      if (!meta || meta.close_date !== today) continue;
      const existing = latestPerBranch.get(b.branch_id);
      if (
        !existing ||
        new Date(b.uploaded_at).getTime() > new Date(existing.uploaded_at).getTime()
      ) {
        latestPerBranch.set(b.branch_id, b);
      }
    }
    let revenue = 0;
    let transactions = 0;
    for (const b of latestPerBranch.values()) {
      const meta = b.metadata_json as UzaverkaMeta;
      revenue += Number(meta.total_revenue) || 0;
      transactions += Number(meta.tx_count) || 0;
    }
    return { revenue, transactions, branches: latestPerBranch.size };
  }, [turnoverBackups, today]);

  const activeBranches = branchesData?.branches?.filter(b => !b.archived_at).length || 0;
  const totalBranches = branchesData?.branches?.length || 0;
  const totalBackups = backupsData?.totals?.total_count || 0;
  const totalSize = backupsData?.totals?.total_bytes || 0;
  const totalMachines = machinesData?.machines?.length || 0;

  return (
    <div className="space-y-6">
      {/* Today's turnover */}
      <Card className="border-border bg-card">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Dnešní tržba</CardTitle>
          <TrendingUp className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-4xl font-bold tracking-tight">
            {formatCurrency(todayTurnover.revenue)}
          </div>
          <p className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground">
            <Store className="h-3.5 w-3.5" />
            Z {todayTurnover.branches} {prodejnyLabel(todayTurnover.branches)}
          </p>
          <div className="mt-4 flex items-center gap-2 text-sm">
            <Receipt className="h-4 w-4 text-muted-foreground" />
            <span className="font-medium">{todayTurnover.transactions}</span>
            <span className="text-muted-foreground">
              {transakceLabel(todayTurnover.transactions)} dnes
            </span>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card className="border-border bg-card">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pobocky</CardTitle>
            <Building2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{activeBranches}</div>
            <p className="text-xs text-muted-foreground">
              {totalBranches > activeBranches && `+${totalBranches - activeBranches} archivovanych`}
              {totalBranches === activeBranches && "aktivnich"}
            </p>
          </CardContent>
        </Card>

        <Card className="border-border bg-card">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Zalohy</CardTitle>
            <Database className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalBackups}</div>
            <p className="text-xs text-muted-foreground">celkem zaloh</p>
          </CardContent>
        </Card>

        <Card className="border-border bg-card">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Uloziste</CardTitle>
            <HardDrive className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatBytes(totalSize)}</div>
            <p className="text-xs text-muted-foreground">vyuzito</p>
          </CardContent>
        </Card>

        <Card className="border-border bg-card">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Stroje</CardTitle>
            <Monitor className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalMachines}</div>
            <p className="text-xs text-muted-foreground">registrovanych</p>
          </CardContent>
        </Card>
      </div>

      {/* Recent Backups */}
      {backupsData?.recent && backupsData.recent.length > 0 && (
        <Card className="border-border bg-card">
          <CardHeader>
            <CardTitle className="text-lg">Posledni zalohy</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {backupsData.recent.slice(0, 5).map((backup) => (
                <div
                  key={backup.id}
                  className="flex items-center justify-between py-2 border-b border-border last:border-0"
                >
                  <div className="flex items-center gap-3">
                    <Database className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <p className="text-sm font-medium">{backup.file_name}</p>
                      <p className="text-xs text-muted-foreground">
                        {backup.kind} &bull; {formatBytes(backup.size_bytes)}
                      </p>
                    </div>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {new Date(backup.uploaded_at).toLocaleDateString("cs-CZ")}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Backups by Kind */}
      {backupsData?.byKind && backupsData.byKind.length > 0 && (
        <Card className="border-border bg-card">
          <CardHeader>
            <CardTitle className="text-lg">Zalohy podle typu</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {backupsData.byKind.map((item) => (
                <div
                  key={item.kind}
                  className="flex items-center justify-between"
                >
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-primary" />
                    <span className="text-sm">{item.kind}</span>
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {item.count} ({formatBytes(item.bytes)})
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
