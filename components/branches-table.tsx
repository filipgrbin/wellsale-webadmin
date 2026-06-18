"use client";

import { useState } from "react";
import useSWR, { mutate } from "swr";
import {
  getBranches,
  updateBranch,
  deleteBranch,
  getBranchDbKey,
  setBranchHwid,
  clearBranchHwid,
  type Branch,
} from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
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
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Spinner } from "@/components/ui/spinner";
import {
  MoreHorizontal,
  Trash2,
  Edit,
  RefreshCw,
  Search,
  Archive,
  ArchiveRestore,
  Building2,
  Monitor,
  HardDrive,
  Copy,
  Eye,
  EyeOff,
  KeyRound,
  AlertTriangle,
  Fingerprint,
  Eraser,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { cs } from "date-fns/locale";

function formatDate(date: string | null) {
  if (!date) return "—";
  return formatDistanceToNow(new Date(date), { addSuffix: true, locale: cs });
}

interface BranchFormData {
  name: string;
  code: string;
  address: string;
}

const defaultFormData: BranchFormData = {
  name: "",
  code: "",
  address: "",
};

interface BranchesTableProps {
  licenseKey?: string;
  showLicenseColumn?: boolean;
}

export function BranchesTable({ licenseKey, showLicenseColumn = true }: BranchesTableProps) {
  const [includeArchived, setIncludeArchived] = useState(false);
  const { data, error, isLoading } = useSWR(
    ["branches", licenseKey, includeArchived],
    () => getBranches(licenseKey, includeArchived)
  );
  const [search, setSearch] = useState("");
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [dbKeyOpen, setDbKeyOpen] = useState(false);
  const [selectedBranch, setSelectedBranch] = useState<Branch | null>(null);
  const [formData, setFormData] = useState<BranchFormData>(defaultFormData);
  const [hardDelete, setHardDelete] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  // DB Key state
  const [dbKey, setDbKey] = useState<string | null>(null);
  const [dbKeyVisible, setDbKeyVisible] = useState(false);
  const [dbKeyLoading, setDbKeyLoading] = useState(false);

  // HWID state (admin only)
  const [hwidEditOpen, setHwidEditOpen] = useState(false);
  const [hwidClearOpen, setHwidClearOpen] = useState(false);
  const [hwidValue, setHwidValue] = useState("");

  const branches = data?.branches || [];
  const filteredBranches = branches.filter(
    (b) =>
      b.name.toLowerCase().includes(search.toLowerCase()) ||
      b.code.toLowerCase().includes(search.toLowerCase()) ||
      b.license_key.toLowerCase().includes(search.toLowerCase())
  );

  const handleShowDbKey = async (branch: Branch) => {
    setSelectedBranch(branch);
    setDbKey(null);
    setDbKeyVisible(false);
    setDbKeyOpen(true);
    setDbKeyLoading(true);
    
    try {
      const result = await getBranchDbKey(branch.id);
      if (result.ok) {
        setDbKey(result.dbKey);
      }
    } catch (e) {
      console.error("Failed to get DB key:", e);
    } finally {
      setDbKeyLoading(false);
    }
  };

  const handleUpdate = async () => {
    if (!selectedBranch) return;
    setIsSubmitting(true);
    try {
      await updateBranch(selectedBranch.id, {
        name: formData.name,
        code: formData.code,
        address: formData.address,
      });
      mutate(["branches", licenseKey, includeArchived]);
      setEditOpen(false);
    } catch (e) {
      alert(e instanceof Error ? e.message : "Chyba při aktualizaci pobočky");
    }
    setIsSubmitting(false);
  };

  const handleArchive = async (branch: Branch) => {
    try {
      if (branch.archived_at) {
        await updateBranch(branch.id, { archived_at: null });
      } else {
        await deleteBranch(branch.id, false);
      }
      mutate(["branches", licenseKey, includeArchived]);
    } catch (e) {
      alert(e instanceof Error ? e.message : "Chyba při archivaci pobočky");
    }
  };

  const handleDelete = async () => {
    if (!selectedBranch) return;
    setIsSubmitting(true);
    try {
      await deleteBranch(selectedBranch.id, hardDelete);
      mutate(["branches", licenseKey, includeArchived]);
      setDeleteOpen(false);
      setHardDelete(false);
    } catch (e) {
      alert(e instanceof Error ? e.message : "Chyba při mazání pobočky");
    }
    setIsSubmitting(false);
  };

  const openEdit = (branch: Branch) => {
    setSelectedBranch(branch);
    setFormData({
      name: branch.name,
      code: branch.code,
      address: branch.address || "",
    });
    setEditOpen(true);
  };

  const openHwidEdit = (branch: Branch) => {
    setSelectedBranch(branch);
    setHwidValue(branch.hwid || "");
    setHwidEditOpen(true);
  };

  const handleSaveHwid = async () => {
    if (!selectedBranch) return;
    setIsSubmitting(true);
    try {
      const trimmed = hwidValue.trim();
      // Empty input clears the binding; otherwise (re)bind to the given value.
      if (trimmed) {
        await setBranchHwid(selectedBranch.id, trimmed);
      } else {
        await clearBranchHwid(selectedBranch.id);
      }
      mutate(["branches", licenseKey, includeArchived]);
      setHwidEditOpen(false);
    } catch (e) {
      alert(e instanceof Error ? e.message : "Chyba při ukládání HWID");
    }
    setIsSubmitting(false);
  };

  const handleClearHwid = async () => {
    if (!selectedBranch) return;
    setIsSubmitting(true);
    try {
      await clearBranchHwid(selectedBranch.id);
      mutate(["branches", licenseKey, includeArchived]);
      setHwidClearOpen(false);
    } catch (e) {
      alert(e instanceof Error ? e.message : "Chyba při mazání HWID");
    }
    setIsSubmitting(false);
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  if (error) {
    return (
      <div className="flex items-center justify-center p-8 text-destructive">
        Chyba při načítání poboček: {error.message}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-4 flex-1">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Hledat pobočky..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <div className="flex items-center gap-2">
            <Checkbox
              id="archived"
              checked={includeArchived}
              onCheckedChange={(c) => setIncludeArchived(c === true)}
            />
            <Label htmlFor="archived" className="text-sm text-muted-foreground cursor-pointer">
              Zobrazit archivované
            </Label>
          </div>
        </div>
        <Button
          variant="outline"
          size="icon"
          onClick={() => mutate(["branches", licenseKey, includeArchived])}
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
                <Building2 className="h-4 w-4" />
              </TableHead>
              <TableHead>Název</TableHead>
              <TableHead>Kód</TableHead>
              {showLicenseColumn && <TableHead>Licence</TableHead>}
              <TableHead>Adresa</TableHead>
              <TableHead>
                <span className="flex items-center gap-1.5">
                  <Fingerprint className="h-4 w-4" />
                  HWID
                </span>
              </TableHead>
              <TableHead className="text-center">
                <Monitor className="h-4 w-4 mx-auto" />
              </TableHead>
              <TableHead className="text-center">
                <HardDrive className="h-4 w-4 mx-auto" />
              </TableHead>
              <TableHead>Vytvořeno</TableHead>
              <TableHead className="w-[100px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={showLicenseColumn ? 10 : 9} className="text-center py-8">
                  <RefreshCw className="h-6 w-6 animate-spin mx-auto text-muted-foreground" />
                </TableCell>
              </TableRow>
            ) : filteredBranches.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={showLicenseColumn ? 10 : 9}
                  className="text-center py-8 text-muted-foreground"
                >
                  Žádné pobočky nenalezeny
                </TableCell>
              </TableRow>
            ) : (
              filteredBranches.map((branch) => (
                <TableRow
                  key={branch.id}
                  className={branch.archived_at ? "opacity-50" : ""}
                >
                  <TableCell>
                    <div className="w-8 h-8 rounded bg-primary/10 flex items-center justify-center">
                      <Building2 className="h-4 w-4 text-primary" />
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{branch.name}</span>
                      {branch.archived_at && (
                        <Badge variant="secondary">Archivováno</Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    {branch.code ? (
                      <code className="font-mono text-sm bg-secondary px-2 py-1 rounded">
                        {branch.code}
                      </code>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  {showLicenseColumn && (
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <code className="font-mono text-xs bg-secondary px-2 py-1 rounded truncate max-w-[140px]">
                          {branch.license_key}
                        </code>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6"
                          onClick={() => copyToClipboard(branch.license_key)}
                        >
                          <Copy className="h-3 w-3" />
                        </Button>
                      </div>
                    </TableCell>
                  )}
                  <TableCell className="text-muted-foreground max-w-[200px] truncate">
                    {branch.address || "—"}
                  </TableCell>
                  <TableCell>
                    {branch.hwid ? (
                      <div className="flex items-center gap-2">
                        <code
                          className="font-mono text-xs bg-secondary px-2 py-1 rounded truncate max-w-[120px]"
                          title={branch.hwid}
                        >
                          {branch.hwid}
                        </code>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6"
                          onClick={() => copyToClipboard(branch.hwid!)}
                        >
                          <Copy className="h-3 w-3" />
                        </Button>
                      </div>
                    ) : (
                      <Badge variant="outline" className="text-muted-foreground font-normal">
                        nenavázáno
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-center text-muted-foreground">
                    {branch.machines_count ?? 0}
                  </TableCell>
                  <TableCell className="text-center text-muted-foreground">
                    {branch.backups_count ?? 0}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {formatDate(branch.created_at)}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        className="h-8 w-8"
                        onClick={() => handleShowDbKey(branch)}
                        title="Zobrazit DB klíč"
                      >
                        <KeyRound className="h-4 w-4" />
                      </Button>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => openEdit(branch)}>
                            <Edit className="mr-2 h-4 w-4" />
                            Upravit
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleShowDbKey(branch)}>
                            <KeyRound className="mr-2 h-4 w-4" />
                            DB Klíč
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => openHwidEdit(branch)}>
                            <Fingerprint className="mr-2 h-4 w-4" />
                            {branch.hwid ? "Upravit HWID" : "Nastavit HWID"}
                          </DropdownMenuItem>
                          {branch.hwid && (
                            <DropdownMenuItem
                              onClick={() => {
                                setSelectedBranch(branch);
                                setHwidClearOpen(true);
                              }}
                              className="text-destructive"
                            >
                              <Eraser className="mr-2 h-4 w-4" />
                              Vymazat HWID
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuItem onClick={() => handleArchive(branch)}>
                            {branch.archived_at ? (
                              <>
                                <ArchiveRestore className="mr-2 h-4 w-4" />
                                Obnovit
                              </>
                            ) : (
                              <>
                                <Archive className="mr-2 h-4 w-4" />
                                Archivovat
                              </>
                            )}
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            onClick={() => {
                              setSelectedBranch(branch);
                              setDeleteOpen(true);
                            }}
                            className="text-destructive"
                          >
                            <Trash2 className="mr-2 h-4 w-4" />
                            Smazat
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* DB Key Dialog */}
      <Dialog open={dbKeyOpen} onOpenChange={(open) => { setDbKeyOpen(open); if (!open) setDbKeyVisible(false); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <KeyRound className="h-5 w-5" />
              DB Klíč pobočky
            </DialogTitle>
            <DialogDescription>
              {selectedBranch?.name} ({selectedBranch?.code || "bez kódu"})
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            {/* Warning */}
            <div className="flex items-start gap-3 p-4 rounded-lg bg-warning/10 border border-warning/30">
              <AlertTriangle className="h-5 w-5 text-warning shrink-0 mt-0.5" />
              <div className="text-sm">
                <p className="font-semibold text-warning">Důležité upozornění!</p>
                <p className="text-muted-foreground mt-1">
                  Tento klíč je vysoce citlivý a slouží k dešifrování dat pobočky. 
                  <strong className="text-foreground"> Nikdy jej nikomu nesdělujte</strong> a uchovávejte jej v bezpečí.
                </p>
              </div>
            </div>
            
            {/* Key display */}
            <div className="space-y-2">
              <Label>Šifrovací klíč</Label>
              {dbKeyLoading ? (
                <div className="flex items-center justify-center p-4 bg-secondary rounded-lg">
                  <Spinner className="h-5 w-5" />
                </div>
              ) : dbKey ? (
                <div className="flex items-center gap-2">
                  <Input
                    type={dbKeyVisible ? "text" : "password"}
                    value={dbKey}
                    readOnly
                    className="font-mono text-sm"
                  />
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => setDbKeyVisible(!dbKeyVisible)}
                  >
                    {dbKeyVisible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => {
                      copyToClipboard(dbKey);
                    }}
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
              ) : (
                <div className="p-4 bg-secondary rounded-lg text-center text-muted-foreground">
                  Nepodařilo se načíst klíč
                </div>
              )}
            </div>
          </div>
          
          <DialogFooter>
            <Button onClick={() => { setDbKeyOpen(false); setDbKeyVisible(false); }}>
              Zavřít
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Upravit pobočku</DialogTitle>
            <DialogDescription>ID: {selectedBranch?.id}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label>Název pobočky</Label>
              <Input
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              />
            </div>
            <div className="grid gap-2">
              <Label>Kód pobočky</Label>
              <Input
                value={formData.code}
                onChange={(e) =>
                  setFormData({ ...formData, code: e.target.value.toLowerCase() })
                }
              />
            </div>
            <div className="grid gap-2">
              <Label>Adresa</Label>
              <Input
                value={formData.address}
                onChange={(e) => setFormData({ ...formData, address: e.target.value })}
              />
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

      {/* HWID Edit Dialog */}
      <Dialog open={hwidEditOpen} onOpenChange={setHwidEditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Fingerprint className="h-5 w-5" />
              HWID pobočky
            </DialogTitle>
            <DialogDescription>
              {selectedBranch?.name} ({selectedBranch?.code || "bez kódu"})
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label>Hardware ID</Label>
              <Input
                value={hwidValue}
                onChange={(e) => setHwidValue(e.target.value)}
                placeholder="např. b916c80e03c0ef3fa6b17b651b817458"
                className="font-mono text-sm"
                autoComplete="off"
                spellCheck={false}
              />
              <p className="text-xs text-muted-foreground">
                Ponechte prázdné pro vymazání vazby. Po uložení se pobočka naváže na zadaný hardware.
              </p>
            </div>
            {selectedBranch?.hwid_bound_at && (
              <p className="text-xs text-muted-foreground">
                Naposledy navázáno: {formatDate(selectedBranch.hwid_bound_at)}
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setHwidEditOpen(false)}>
              Zrušit
            </Button>
            <Button onClick={handleSaveHwid} disabled={isSubmitting}>
              {isSubmitting ? "Ukládám..." : "Uložit"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* HWID Clear Dialog */}
      <Dialog open={hwidClearOpen} onOpenChange={setHwidClearOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Vymazat HWID</DialogTitle>
            <DialogDescription>
              Opravdu chcete vymazat HWID vazbu pobočky &quot;{selectedBranch?.name}&quot;?
              Pobočka se bude moci znovu navázat na jakýkoli hardware při příští aktivaci.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setHwidClearOpen(false)}>
              Zrušit
            </Button>
            <Button
              variant="destructive"
              onClick={handleClearHwid}
              disabled={isSubmitting}
            >
              {isSubmitting ? "Mažu..." : "Vymazat HWID"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Dialog */}
      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Smazat pobočku</DialogTitle>
            <DialogDescription>
              Opravdu chcete smazat pobočku &quot;{selectedBranch?.name}&quot;?
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <div className="flex items-center gap-2">
              <Checkbox
                id="hard-delete"
                checked={hardDelete}
                onCheckedChange={(c) => setHardDelete(c === true)}
              />
              <Label htmlFor="hard-delete" className="text-sm cursor-pointer">
                Tvrdé smazání (včetně záloh a odpojení strojů)
              </Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteOpen(false)}>
              Zrušit
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={isSubmitting}
            >
              {isSubmitting ? "Mažu..." : hardDelete ? "Smazat vše" : "Archivovat"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
