"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { type License, type Branch } from "@/lib/api";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { DashboardStats } from "@/components/dashboard-stats";
import { LicensesTable } from "@/components/licenses-table";
import { BranchesTable } from "@/components/branches-table";
import { AdminBranchDetail } from "@/components/admin-branch-detail";
import { MachinesTable } from "@/components/machines-table";
import { LicenseDetail } from "@/components/license-detail";
import { AdminBackupsTable } from "@/components/admin-backups-table";
import { AdminTurnoverCharts } from "@/components/turnover-charts";
import { AdminNotifications } from "@/components/admin-notifications";
import { Key, Building2, Monitor, LayoutDashboard, Database, LogOut, Bell } from "lucide-react";

export default function AdminDashboard() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState("overview");
  const [selectedLicense, setSelectedLicense] = useState<License | null>(null);
  const [selectedBranch, setSelectedBranch] = useState<Branch | null>(null);

  const handleSelectLicense = (license: License) => {
    setSelectedLicense(license);
  };

  const handleBack = () => {
    setSelectedLicense(null);
  };

  const handleLogout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
  };

  if (selectedLicense) {
    return (
      <div className="min-h-screen bg-background">
        <header className="border-b border-border bg-card">
          <div className="container mx-auto px-4 py-4">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded bg-primary flex items-center justify-center">
                <Key className="h-4 w-4 text-primary-foreground" />
              </div>
              <div>
                <h1 className="text-lg font-semibold">Admin Panel WellSale</h1>
                <p className="text-xs text-muted-foreground">License Management</p>
              </div>
            </div>
          </div>
        </header>
        <main className="container mx-auto px-4 py-6">
          <LicenseDetail license={selectedLicense} onBack={handleBack} />
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded bg-primary flex items-center justify-center">
                <Key className="h-4 w-4 text-primary-foreground" />
              </div>
              <div>
                <h1 className="text-lg font-semibold">Admin Panel WellSale</h1>
                <p className="text-xs text-muted-foreground">License Management</p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <a
                href="/"
                className="text-xs text-muted-foreground hover:text-primary transition-colors"
              >
                Subadmin Panel
              </a>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">Admin Dashboard</span>
                <div className="w-2 h-2 rounded-full bg-success animate-pulse" />
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleLogout}
                className="gap-2"
              >
                <LogOut className="h-4 w-4" />
                Odhlásit
              </Button>
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="bg-card border border-border">
            <TabsTrigger value="overview" className="gap-2">
              <LayoutDashboard className="h-4 w-4" />
              Přehled
            </TabsTrigger>
            <TabsTrigger value="licenses" className="gap-2">
              <Key className="h-4 w-4" />
              Licence
            </TabsTrigger>
            <TabsTrigger value="branches" className="gap-2">
              <Building2 className="h-4 w-4" />
              Pobočky
            </TabsTrigger>
            <TabsTrigger value="machines" className="gap-2">
              <Monitor className="h-4 w-4" />
              Stroje
            </TabsTrigger>
            <TabsTrigger value="backups" className="gap-2">
              <Database className="h-4 w-4" />
              Zalohy
            </TabsTrigger>
            <TabsTrigger value="notifications" className="gap-2">
              <Bell className="h-4 w-4" />
              Oznámení
            </TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-6 m-0">
            <DashboardStats />
            <AdminTurnoverCharts />
            <div className="space-y-4">
              <h3 className="text-lg font-semibold">Licence</h3>
              <LicensesTable onSelectLicense={handleSelectLicense} />
            </div>
          </TabsContent>

          <TabsContent value="licenses" className="m-0">
            <div className="space-y-4">
              <div>
                <h2 className="text-2xl font-bold tracking-tight">Licence</h2>
                <p className="text-muted-foreground">
                  Správa všech licenčních klíčů v systému
                </p>
              </div>
              <LicensesTable onSelectLicense={handleSelectLicense} />
            </div>
          </TabsContent>

          <TabsContent value="branches" className="m-0">
            {selectedBranch ? (
              <AdminBranchDetail branch={selectedBranch} onBack={() => setSelectedBranch(null)} />
            ) : (
              <div className="space-y-4">
                <div>
                  <h2 className="text-2xl font-bold tracking-tight">Pobočky</h2>
                  <p className="text-muted-foreground">
                    Správa poboček napříč všemi licencemi
                  </p>
                </div>
                <BranchesTable onSelectBranch={setSelectedBranch} />
              </div>
            )}
          </TabsContent>

          <TabsContent value="machines" className="m-0">
            <div className="space-y-4">
              <div>
                <h2 className="text-2xl font-bold tracking-tight">Stroje</h2>
                <p className="text-muted-foreground">
                  Přehled všech registrovaných instalací
                </p>
              </div>
              <MachinesTable />
            </div>
          </TabsContent>

          <TabsContent value="backups" className="m-0">
            <div className="space-y-4">
              <div>
                <h2 className="text-2xl font-bold tracking-tight">Zalohy</h2>
                <p className="text-muted-foreground">
                  Prehled a sprava vsech zaloh v systemu
                </p>
              </div>
              <AdminBackupsTable />
            </div>
          </TabsContent>

          <TabsContent value="notifications" className="m-0">
            <AdminNotifications />
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
