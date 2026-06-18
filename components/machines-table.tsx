"use client";

import { useState } from "react";
import useSWR, { mutate } from "swr";
import { getMachines, deleteMachine, type Machine } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  MoreHorizontal,
  Trash2,
  RefreshCw,
  Search,
  Monitor,
  Copy,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { cs } from "date-fns/locale";

function formatDate(date: string | null) {
  if (!date) return "—";
  return formatDistanceToNow(new Date(date), { addSuffix: true, locale: cs });
}

interface MachinesTableProps {
  licenseKey?: string;
  showLicenseColumn?: boolean;
}

export function MachinesTable({ licenseKey, showLicenseColumn = true }: MachinesTableProps) {
  const { data, error, isLoading } = useSWR(
    ["machines", licenseKey],
    () => getMachines(licenseKey)
  );
  const [search, setSearch] = useState("");
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [selectedMachine, setSelectedMachine] = useState<Machine | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const machines = data?.machines || [];
  const filteredMachines = machines.filter(
    (m) =>
      m.hostname.toLowerCase().includes(search.toLowerCase()) ||
      m.install_id.toLowerCase().includes(search.toLowerCase()) ||
      m.license_key.toLowerCase().includes(search.toLowerCase())
  );

  const handleDelete = async () => {
    if (!selectedMachine) return;
    setIsSubmitting(true);
    try {
      await deleteMachine(selectedMachine.id);
      mutate(["machines", licenseKey]);
      setDeleteOpen(false);
    } catch (e) {
      alert(e instanceof Error ? e.message : "Chyba při mazání stroje");
    }
    setIsSubmitting(false);
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  if (error) {
    return (
      <div className="flex items-center justify-center p-8 text-destructive">
        Chyba při načítání strojů: {error.message}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Hledat stroje..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Button
          variant="outline"
          size="icon"
          onClick={() => mutate(["machines", licenseKey])}
          disabled={isLoading}
        >
          <RefreshCw className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
        </Button>
      </div>

      <div className="rounded-lg border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>
                <Monitor className="h-4 w-4" />
              </TableHead>
              <TableHead>Hostname</TableHead>
              <TableHead>Install ID</TableHead>
              {showLicenseColumn && <TableHead>Licence</TableHead>}
              <TableHead>Branch ID</TableHead>
              <TableHead>IP adresa</TableHead>
              <TableHead>Poslední aktivita</TableHead>
              <TableHead className="w-[50px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={showLicenseColumn ? 8 : 7} className="text-center py-8">
                  <RefreshCw className="h-6 w-6 animate-spin mx-auto text-muted-foreground" />
                </TableCell>
              </TableRow>
            ) : filteredMachines.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={showLicenseColumn ? 8 : 7}
                  className="text-center py-8 text-muted-foreground"
                >
                  Žádné stroje nenalezeny
                </TableCell>
              </TableRow>
            ) : (
              filteredMachines.map((machine) => (
                <TableRow key={machine.id}>
                  <TableCell>
                    <div className="w-8 h-8 rounded bg-chart-2/10 flex items-center justify-center">
                      <Monitor className="h-4 w-4 text-chart-2" />
                    </div>
                  </TableCell>
                  <TableCell className="font-medium">{machine.hostname || "—"}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <code className="font-mono text-xs bg-secondary px-2 py-1 rounded truncate max-w-[120px]">
                        {machine.install_id}
                      </code>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        onClick={() => copyToClipboard(machine.install_id)}
                      >
                        <Copy className="h-3 w-3" />
                      </Button>
                    </div>
                  </TableCell>
                  {showLicenseColumn && (
                    <TableCell>
                      <code className="font-mono text-xs bg-secondary px-2 py-1 rounded truncate max-w-[140px]">
                        {machine.license_key}
                      </code>
                    </TableCell>
                  )}
                  <TableCell className="text-muted-foreground">
                    {machine.branch_id || "—"}
                  </TableCell>
                  <TableCell className="text-muted-foreground font-mono text-sm">
                    {machine.last_seen_ip || "—"}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {formatDate(machine.last_seen_at)}
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          onClick={() => copyToClipboard(machine.install_id)}
                        >
                          <Copy className="mr-2 h-4 w-4" />
                          Kopírovat Install ID
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => {
                            setSelectedMachine(machine);
                            setDeleteOpen(true);
                          }}
                          className="text-destructive"
                        >
                          <Trash2 className="mr-2 h-4 w-4" />
                          Odebrat stroj
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Delete Dialog */}
      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Odebrat stroj</DialogTitle>
            <DialogDescription>
              Opravdu chcete odebrat stroj &quot;{selectedMachine?.hostname || selectedMachine?.install_id}&quot;?
              Tato akce uvolní licenční slot.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteOpen(false)}>
              Zrušit
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={isSubmitting}
            >
              {isSubmitting ? "Odebírám..." : "Odebrat"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
