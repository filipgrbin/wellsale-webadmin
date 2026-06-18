"use client";

import { useState } from "react";
import useSWR from "swr";
import { getLicenses, getBranches, getMachines, type License, type Branch } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  ArrowLeft,
  Key,
  Building2,
  Monitor,
  CheckCircle2,
  XCircle,
  Clock,
  Copy,
  Mail,
  User,
  Calendar,
  MapPin,
} from "lucide-react";
import { formatDistanceToNow, format } from "date-fns";
import { cs } from "date-fns/locale";
import { BranchesTable } from "./branches-table";
import { MachinesTable } from "./machines-table";

function formatDate(date: string | null) {
  if (!date) return "—";
  return formatDistanceToNow(new Date(date), { addSuffix: true, locale: cs });
}

function formatFullDate(date: string | null) {
  if (!date) return "—";
  return format(new Date(date), "d. MMMM yyyy", { locale: cs });
}

interface LicenseDetailProps {
  license: License;
  onBack: () => void;
}

export function LicenseDetail({ license, onBack }: LicenseDetailProps) {
  const [activeTab, setActiveTab] = useState("branches");

  const { data: branchesData } = useSWR(
    ["branches", license.license_key, false],
    () => getBranches(license.license_key)
  );
  const { data: machinesData } = useSWR(
    ["machines", license.license_key],
    () => getMachines(license.license_key)
  );

  const branches = branchesData?.branches || [];
  const machines = machinesData?.machines || [];

  const isExpired =
    license.license_type === "temporary" &&
    license.valid_until &&
    new Date(license.valid_until) < new Date();

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={onBack}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h2 className="text-2xl font-bold tracking-tight">Detail licence</h2>
            {license.revoked ? (
              <Badge variant="destructive" className="gap-1">
                <XCircle className="h-3 w-3" />
                Revokována
              </Badge>
            ) : isExpired ? (
              <Badge variant="secondary" className="gap-1 bg-warning/20 text-warning">
                <Clock className="h-3 w-3" />
                Expirovaná
              </Badge>
            ) : (
              <Badge className="gap-1 bg-success/20 text-success border-success/30">
                <CheckCircle2 className="h-3 w-3" />
                Aktivní
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-2 mt-1">
            <code className="font-mono text-sm text-muted-foreground">
              {license.license_key}
            </code>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={() => copyToClipboard(license.license_key)}
            >
              <Copy className="h-3 w-3" />
            </Button>
          </div>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        <Card className="md:col-span-2 bg-card border-border">
          <CardHeader>
            <CardTitle className="text-lg">Informace o licenci</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded bg-primary/10 flex items-center justify-center shrink-0">
                  <User className="h-4 w-4 text-primary" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Vlastník</p>
                  <p className="font-medium">{license.owner_name || "—"}</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded bg-primary/10 flex items-center justify-center shrink-0">
                  <Mail className="h-4 w-4 text-primary" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Email</p>
                  <p className="font-medium">{license.owner_email || "—"}</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded bg-primary/10 flex items-center justify-center shrink-0">
                  <Key className="h-4 w-4 text-primary" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Typ licence</p>
                  <p className="font-medium">
                    {license.license_type === "permanent" ? "Permanentní" : "Dočasná"}
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded bg-primary/10 flex items-center justify-center shrink-0">
                  <Calendar className="h-4 w-4 text-primary" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Platnost do</p>
                  <p className="font-medium">
                    {license.license_type === "permanent"
                      ? "Neomezená"
                      : formatFullDate(license.valid_until)}
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded bg-primary/10 flex items-center justify-center shrink-0">
                  <Monitor className="h-4 w-4 text-primary" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Max. strojů</p>
                  <p className="font-medium">{license.max_machines}</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded bg-primary/10 flex items-center justify-center shrink-0">
                  <MapPin className="h-4 w-4 text-primary" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Poslední IP</p>
                  <p className="font-mono text-sm">{license.last_seen_ip || "—"}</p>
                </div>
              </div>
            </div>
            {license.notes && (
              <div className="pt-4 border-t border-border">
                <p className="text-sm text-muted-foreground mb-1">Poznámky</p>
                <p className="text-sm">{license.notes}</p>
              </div>
            )}
            {license.revoked && license.revoked_reason && (
              <div className="pt-4 border-t border-border">
                <p className="text-sm text-muted-foreground mb-1">Důvod revokace</p>
                <p className="text-sm text-destructive">{license.revoked_reason}</p>
              </div>
            )}
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card className="bg-card border-border">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Aktivita
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <p className="text-sm text-muted-foreground">Vytvořeno</p>
                <p className="text-sm font-medium">{formatDate(license.created_at)}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Poslední aktivita</p>
                <p className="text-sm font-medium">{formatDate(license.last_seen_at)}</p>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-card border-border">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Statistiky
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4">
                <div className="text-center p-3 rounded-lg bg-secondary">
                  <Building2 className="h-5 w-5 mx-auto text-chart-2 mb-1" />
                  <p className="text-2xl font-bold">{branches.length}</p>
                  <p className="text-xs text-muted-foreground">poboček</p>
                </div>
                <div className="text-center p-3 rounded-lg bg-secondary">
                  <Monitor className="h-5 w-5 mx-auto text-chart-3 mb-1" />
                  <p className="text-2xl font-bold">{machines.length}</p>
                  <p className="text-xs text-muted-foreground">strojů</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      <Card className="bg-card border-border">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <CardHeader className="pb-0">
            <TabsList className="bg-secondary">
              <TabsTrigger value="branches" className="gap-2">
                <Building2 className="h-4 w-4" />
                Pobočky ({branches.length})
              </TabsTrigger>
              <TabsTrigger value="machines" className="gap-2">
                <Monitor className="h-4 w-4" />
                Stroje ({machines.length})
              </TabsTrigger>
            </TabsList>
          </CardHeader>
          <CardContent className="pt-6">
            <TabsContent value="branches" className="m-0">
              <BranchesTable licenseKey={license.license_key} showLicenseColumn={false} />
            </TabsContent>
            <TabsContent value="machines" className="m-0">
              <MachinesTable licenseKey={license.license_key} showLicenseColumn={false} />
            </TabsContent>
          </CardContent>
        </Tabs>
      </Card>
    </div>
  );
}
