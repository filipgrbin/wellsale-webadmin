"use client";

import { useState } from "react";
import type { SubadminSession } from "@/lib/subadmin-session";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { SubadminBranches } from "@/components/subadmin-branches";
import { SubadminBackups } from "@/components/subadmin-backups";
import { SubadminStats } from "@/components/subadmin-stats";
import { BranchFaults } from "@/components/branch-faults";
import { SubadminSignatureVerifier } from "@/components/subadmin-signature-verifier";
import { Building2, Database, KeyRound, LayoutDashboard, LogOut, User } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { updateLicense } from "@/lib/api";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface SubadminDashboardProps {
  session: SubadminSession;
  onLogout: () => void;
}

export function SubadminDashboard({ session, onLogout }: SubadminDashboardProps) {
  const [activeTab, setActiveTab] = useState("overview");
  const [codeOpen, setCodeOpen] = useState(false);
  const [newCode, setNewCode] = useState("");
  const [savingCode, setSavingCode] = useState(false);
  const [codeError, setCodeError] = useState<string | null>(null);

  const handleSaveCode = async () => {
    setSavingCode(true);
    setCodeError(null);
    try {
      await updateLicense(session.licenseKey, { login_code: newCode.trim() });
      setCodeOpen(false);
    } catch (e) {
      setCodeError(e instanceof Error ? e.message : "Chyba při ukládání kódu");
    } finally {
      setSavingCode(false);
    }
  };

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
                <DropdownMenuItem
                  onClick={() => {
                    setNewCode(session.loginCode || "");
                    setCodeError(null);
                    setCodeOpen(true);
                  }}
                >
                  <KeyRound className="mr-2 h-4 w-4" />
                  Změnit přihlašovací kód
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

            {/* Souhrn všech nahlášených problémů napříč pobočkami */}
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
        </Tabs>

        <div className="mt-10 pt-6 border-t border-border">
          <SubadminSignatureVerifier />
        </div>
      </main>

      <Dialog open={codeOpen} onOpenChange={setCodeOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Změnit přihlašovací kód</DialogTitle>
            <DialogDescription>
              Kód, kterým se přihlašujete do tohoto panelu (spolu s licenčním klíčem).
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-2 py-4">
            <Label>Nový kód</Label>
            <Input
              value={newCode}
              onChange={(e) => setNewCode(e.target.value)}
              className="font-mono"
              autoComplete="off"
            />
            {codeError && <p className="text-sm text-destructive">{codeError}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCodeOpen(false)}>
              Zrušit
            </Button>
            <Button onClick={handleSaveCode} disabled={savingCode || !newCode.trim()}>
              {savingCode ? "Ukládám..." : "Uložit"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
