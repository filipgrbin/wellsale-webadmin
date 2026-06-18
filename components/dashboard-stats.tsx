"use client";

import useSWR from "swr";
import { getLicenses, getBranches, getMachines } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Key, Building2, Monitor, CheckCircle2, XCircle, Clock } from "lucide-react";

export function DashboardStats() {
  const { data: licensesData } = useSWR("licenses", getLicenses);
  const { data: branchesData } = useSWR("all-branches", () => getBranches());
  const { data: machinesData } = useSWR("all-machines", () => getMachines());

  const licenses = licensesData?.licenses || [];
  const branches = branchesData?.branches || [];
  const machines = machinesData?.machines || [];

  const activeLicenses = licenses.filter((l) => {
    if (l.revoked) return false;
    if (l.license_type === "temporary" && l.valid_until) {
      return new Date(l.valid_until) > new Date();
    }
    return true;
  });

  const revokedLicenses = licenses.filter((l) => l.revoked);
  const expiredLicenses = licenses.filter(
    (l) =>
      !l.revoked &&
      l.license_type === "temporary" &&
      l.valid_until &&
      new Date(l.valid_until) < new Date()
  );

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      <Card className="bg-card border-border">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Celkem licencí
          </CardTitle>
          <Key className="h-4 w-4 text-primary" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{licenses.length}</div>
          <div className="flex items-center gap-4 mt-1">
            <span className="text-xs text-success flex items-center gap-1">
              <CheckCircle2 className="h-3 w-3" />
              {activeLicenses.length} aktivních
            </span>
          </div>
        </CardContent>
      </Card>

      <Card className="bg-card border-border">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Stav licencí
          </CardTitle>
          <div className="flex gap-1">
            <XCircle className="h-4 w-4 text-destructive" />
            <Clock className="h-4 w-4 text-warning" />
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4">
            <div>
              <div className="text-2xl font-bold text-destructive">{revokedLicenses.length}</div>
              <p className="text-xs text-muted-foreground">revokovaných</p>
            </div>
            <div className="h-8 w-px bg-border" />
            <div>
              <div className="text-2xl font-bold text-warning">{expiredLicenses.length}</div>
              <p className="text-xs text-muted-foreground">expirovaných</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="bg-card border-border">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Pobočky
          </CardTitle>
          <Building2 className="h-4 w-4 text-chart-2" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{branches.length}</div>
          <p className="text-xs text-muted-foreground mt-1">
            aktivních poboček
          </p>
        </CardContent>
      </Card>

      <Card className="bg-card border-border">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Aktivní stroje
          </CardTitle>
          <Monitor className="h-4 w-4 text-chart-3" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{machines.length}</div>
          <p className="text-xs text-muted-foreground mt-1">
            registrovaných instalací
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
