"use client";

import { useState } from "react";
import type { SubadminSession } from "@/lib/subadmin-session";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { SubadminBranches } from "@/components/subadmin-branches";
import { SubadminBackups } from "@/components/subadmin-backups";
import { SubadminStats } from "@/components/subadmin-stats";
import { PosLiveStock } from "@/components/pos-live-stock";
import { BranchFaults } from "@/components/branch-faults";
import { Building2, Database, KeyRound, LayoutDashboard, LogOut, User, Warehouse } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ThemeToggle } from "@/components/theme-toggle";

interface SubadminDashboardProps {
  session: SubadminSession;
  onLogout: () => void;
}

export function SubadminDashboard({
  session,
  onLogout,
}: SubadminDashboardProps) {
  const [activeTab, setActiveTab] = useState("overview");

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded bg-primary flex items-center justify-center">
                <Building2 className="h-4 w-4 text-primary-foreground" />
              </div>
              <div>
                <h1 className="text-lg font-semibold">WellSale Webadministrace</h1>
                <p className="text-xs text-muted-foreground">Správa poboček</p>
              </div>
            </div>

            <div className="flex items-center gap-1">
              <ThemeToggle />
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" className="gap-2">
                    <User className="h-4 w-4" />
                    <span className="hidden sm:inline">{session.ownerName}</span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuLabel>
                    <div className="flex flex-col space-y-1">
                      <p className="text-sm font-medium">{session.ownerName}</p>
                      <p className="text-xs text-muted-foreground">{session.ownerEmail}</p>
                    </div>
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem className="text-xs font-mono text-muted-foreground">
                    {session.licenseKey}
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={onLogout} className="text-destructive">
                    <LogOut className="mr-2 h-4 w-4" />
                    Odhlasit se
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="bg-card border border-border">
            <TabsTrigger value="overview" className="gap-2">
              <LayoutDashboard className="h-4 w-4" />
              Prehled
            </TabsTrigger>
            <TabsTrigger value="branches" className="gap-2">
              <Building2 className="h-4 w-4" />
              Pobocky
            </TabsTrigger>
            <TabsTrigger value="backups" className="gap-2">
              <Database className="h-4 w-4" />
              Zalohy
            </TabsTrigger>
            <TabsTrigger value="stock" className="gap-2">
              <Warehouse className="h-4 w-4" />
              Sklad
            </TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-6 m-0">
            <div className="flex items-center gap-3 rounded-lg border border-border bg-card p-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded bg-primary/10">
                <KeyRound className="h-5 w-5 text-primary" />
              </div>
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground">Spravovaná licence</p>
                <p className="font-mono font-semibold truncate">{session.licenseKey}</p>
                <p className="text-xs text-muted-foreground truncate">{session.ownerName}</p>
              </div>
            </div>
            <SubadminStats licenseKey={session.licenseKey} />

            <BranchFaults
              licenseKey={session.licenseKey}
              title="Nahlášené problémy (všechny pobočky)"
            />
          </TabsContent>

          <TabsContent value="branches" className="m-0">
            <div className="space-y-4">
              <div>
                <h2 className="text-2xl font-bold tracking-tight">Pobocky</h2>
                <p className="text-muted-foreground">
                  Sprava vasich pobocek
                </p>
              </div>
              <SubadminBranches licenseKey={session.licenseKey} />
            </div>
          </TabsContent>

          <TabsContent value="backups" className="m-0">
            <div className="space-y-4">
              <div>
                <h2 className="text-2xl font-bold tracking-tight">Zalohy</h2>
                <p className="text-muted-foreground">
                  Prehled a sprava zaloh vasich pobocek
                </p>
              </div>
              <SubadminBackups licenseKey={session.licenseKey} />
            </div>
          </TabsContent>

          <TabsContent value="stock" className="m-0">
            <PosLiveStock licenseKey={session.licenseKey} />
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
