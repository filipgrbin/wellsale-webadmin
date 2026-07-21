"use client";

import { useState } from "react";
import useSWR from "swr";
import { getBranches, getBackupsStats, getMachines } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Building2, Database, Monitor, HardDrive } from "lucide-react";
import {
  PosLiveTransactions,
  type PosRangeValue,
} from "@/components/pos-live-transactions";
import { TurnoverCharts } from "@/components/turnover-charts";
import { DayReconcilePanel } from "@/components/day-reconcile-panel";
import { pragueDate } from "@/lib/turnover-utils";

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

export function SubadminStats({ licenseKey }: SubadminStatsProps) {
  const today = pragueDate(new Date());
  const [range, setRange] = useState<PosRangeValue>({
    preset: "today",
    customFrom: today,
    customTo: today,
  });

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

  const activeBranches = branchesData?.branches?.filter(b => !b.archived_at).length || 0;
  const totalBranches = branchesData?.branches?.length || 0;
  const totalBackups = backupsData?.totals?.total_count || 0;
  const totalSize = backupsData?.totals?.total_bytes || 0;
  const totalMachines = machinesData?.machines?.length || 0;

  return (
    <div className="space-y-6">
      <PosLiveTransactions
        licenseKey={licenseKey}
        lockLicense
        range={range}
        onRangeChange={setRange}
      />

      <TurnoverCharts
        licenseKey={licenseKey}
        rangePreset={range.preset}
        customFrom={range.customFrom}
        customTo={range.customTo}
        onRangeChange={(next) =>
          setRange({
            preset: next.preset,
            customFrom: next.customFrom,
            customTo: next.customTo,
          })
        }
        hideRangeControls
      />

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

      <DayReconcilePanel licenseKey={licenseKey} days={7} variant="operator" />
    </div>
  );
}
