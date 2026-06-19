"use client";

import { useState } from "react";
import useSWR, { mutate } from "swr";
import { getMachines, deleteMachine, getBranches, updateMachine, type Machine } from "@/lib/api";
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
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  MoreHorizontal,
  Trash2,
  RefreshCw,
  Search,
  Monitor,
  Copy,
  Edit,
  Fingerprint,
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
  // HWID lives on the branch, so map each machine's branch_id -> branch hwid.
  // Include archived branches so machines on them still resolve.
  const { data: branchesData } = useSWR(
    ["machines-branches", licenseKey],
    () => getBranches(licenseKey, true)
  );
  const [search, setSearch] = useState("");
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editForm, setEditForm] = useState({ install_id: "", hostname: "", branch_id: "" });
  const [selectedMachine, setSelectedMachine] = useState<Machine | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const machines = data?.machines || [];
  const branches = branchesData?.branches || [];
  const branchHwidById = new Map(
    branches.map((b) => [String(b.id), b.hwid] as const)
  );
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

  const openEdit = (machine: Machine) => {
    setSelectedMachine(machine);
    setEditForm({
      install_id: machine.install_id || "",
      hostname: machine.hostname || "",
      branch_id: machine.branch_id != null ? String(machine.branch_id) : "",
    });
    setEditOpen(true);
  };

  const handleUpdate = async () => {
    if (!selectedMachine) return;
    setIsSubmitting(true);
    try {
      await updateMachine(selectedMachine.id, {
        install_id: editForm.install_id,
        hostname: editForm.hostname,
        branch_id: editForm.branch_id ? Number(editForm.branch_id) : null,
      });
      mutate(["machines", licenseKey]);
      setEditOpen(false);
    } catch (e) {
      alert(e instanceof Error ? e.message : "Chyba při úpravě stroje");
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
              <TableHead>
                <span className="flex items-center gap-1.5">
                  <Fingerprint className="h-4 w-4" />
                  HWID
                </span>
              </TableHead>
              <TableHead>IP adresa</TableHead>
              <TableHead>Poslední aktivita</TableHead>
              <TableHead className="w-[50px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={showLicenseColumn ? 9 : 8} className="text-center py-8">
                  <RefreshCw className="h-6 w-6 animate-spin mx-auto text-muted-foreground" />
                </TableCell>
              </TableRow>
            ) : filteredMachines.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={showLicenseColumn ? 9 : 8}
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
                  <TableCell>
                    {(() => {
                      const hwid =
                        machine.branch_id != null
                          ? branchHwidById.get(String(machine.branch_id))
                          : null;
                      return hwid ? (
                        <div className="flex items-center gap-2">
                          <code
                            className="font-mono text-xs bg-secondary px-2 py-1 rounded truncate max-w-[120px]"
                            title={hwid}
                          >
                            {hwid}
                          </code>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6"
                            onClick={() => copyToClipboard(hwid)}
                          >
                            <Copy className="h-3 w-3" />
                          </Button>
                        </div>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      );
                    })()}
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
                        <DropdownMenuItem onClick={() => openEdit(machine)}>
                          <Edit className="mr-2 h-4 w-4" />
                          Upravit
                        </DropdownMenuItem>
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

      {/* Edit Dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Upravit stroj</DialogTitle>
            <DialogDescription>ID: {selectedMachine?.id}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label>Install ID</Label>
              <Input
                value={editForm.install_id}
                onChange={(e) => setEditForm({ ...editForm, install_id: e.target.value })}
                className="font-mono text-xs"
              />
            </div>
            <div className="grid gap-2">
              <Label>Hostname</Label>
              <Input
                value={editForm.hostname}
                onChange={(e) => setEditForm({ ...editForm, hostname: e.target.value })}
              />
            </div>
            <div className="grid gap-2">
              <Label>Pobočka</Label>
              <Select
                value={editForm.branch_id || "none"}
                onValueChange={(v) =>
                  setEditForm({ ...editForm, branch_id: v === "none" ? "" : v })
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Bez pobočky" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">— Bez pobočky —</SelectItem>
                  {branches.map((b) => (
                    <SelectItem key={b.id} value={String(b.id)}>
                      {b.name} ({b.code}) · #{b.id}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)}>
              Zrušit
            </Button>
            <Button onClick={handleUpdate} disabled={isSubmitting}>
              {isSubmitting ? "Ukládám..." : "Uložit"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
