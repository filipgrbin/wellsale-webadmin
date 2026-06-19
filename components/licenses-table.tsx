"use client";

import { useState } from "react";
import useSWR, { mutate } from "swr";
import {
  getLicenses,
  createLicense,
  updateLicense,
  deleteLicense,
  revokeLicense,
  unrevokeLicense,
  generateLicenseKey,
  type License,
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
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Plus,
  MoreHorizontal,
  Copy,
  Ban,
  Trash2,
  Edit,
  RefreshCw,
  Key,
  Search,
  CheckCircle2,
  XCircle,
  Clock,
  Building2,
  Monitor,
  HardDrive,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { cs } from "date-fns/locale";

function formatDate(date: string | null) {
  if (!date) return "—";
  return formatDistanceToNow(new Date(date), { addSuffix: true, locale: cs });
}

interface LicenseFormData {
  licenseKey: string;
  ownerName: string;
  ownerEmail: string;
  type: "lifetime" | "temporary";
  validUntil: string;
  maxMachines: number;
  notes: string;
  loginCode: string;
}

const defaultFormData: LicenseFormData = {
  licenseKey: "",
  ownerName: "",
  ownerEmail: "",
  type: "lifetime",
  validUntil: "",
  maxMachines: 1,
  notes: "",
  loginCode: "",
};

export function LicensesTable({ onSelectLicense }: { onSelectLicense?: (license: License) => void }) {
  const { data, error, isLoading } = useSWR("licenses", getLicenses);
  const [search, setSearch] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [revokeOpen, setRevokeOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [selectedLicense, setSelectedLicense] = useState<License | null>(null);
  const [formData, setFormData] = useState<LicenseFormData>(defaultFormData);
  const [revokeReason, setRevokeReason] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const licenses = data?.licenses || [];
  const filteredLicenses = licenses.filter(
    (l) =>
      l.license_key.toLowerCase().includes(search.toLowerCase()) ||
      l.owner_name.toLowerCase().includes(search.toLowerCase()) ||
      l.owner_email.toLowerCase().includes(search.toLowerCase())
  );

  const handleCreate = async () => {
    setIsSubmitting(true);
    try {
      await createLicense({
        licenseKey: formData.licenseKey || undefined,
        ownerName: formData.ownerName,
        ownerEmail: formData.ownerEmail,
        type: formData.type,
        validUntil: formData.type === "temporary" ? formData.validUntil : undefined,
        maxMachines: formData.maxMachines,
        notes: formData.notes || undefined,
        loginCode: formData.loginCode || undefined,
      });
      mutate("licenses");
      setCreateOpen(false);
      setFormData(defaultFormData);
    } catch (e) {
      alert(e instanceof Error ? e.message : "Chyba při vytváření licence");
    }
    setIsSubmitting(false);
  };

  const handleUpdate = async () => {
    if (!selectedLicense) return;
    setIsSubmitting(true);
    try {
      await updateLicense(selectedLicense.license_key, {
        owner_name: formData.ownerName,
        owner_email: formData.ownerEmail,
        license_type: formData.type,
        valid_until: formData.type === "temporary" ? formData.validUntil : null,
        max_machines: formData.maxMachines,
        notes: formData.notes,
        login_code: formData.loginCode,
      });
      mutate("licenses");
      setEditOpen(false);
    } catch (e) {
      alert(e instanceof Error ? e.message : "Chyba při aktualizaci licence");
    }
    setIsSubmitting(false);
  };

  const handleRevoke = async () => {
    if (!selectedLicense) return;
    setIsSubmitting(true);
    try {
      await revokeLicense(selectedLicense.license_key, revokeReason);
      mutate("licenses");
      setRevokeOpen(false);
      setRevokeReason("");
    } catch (e) {
      alert(e instanceof Error ? e.message : "Chyba při revokaci licence");
    }
    setIsSubmitting(false);
  };

  const handleUnrevoke = async (license: License) => {
    try {
      await unrevokeLicense(license.license_key);
      mutate("licenses");
    } catch (e) {
      alert(e instanceof Error ? e.message : "Chyba při obnovení licence");
    }
  };

  const handleDelete = async () => {
    if (!selectedLicense) return;
    setIsSubmitting(true);
    try {
      await deleteLicense(selectedLicense.license_key);
      mutate("licenses");
      setDeleteOpen(false);
    } catch (e) {
      alert(e instanceof Error ? e.message : "Chyba při mazání licence");
    }
    setIsSubmitting(false);
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  const openEdit = (license: License) => {
    setSelectedLicense(license);
    setFormData({
      licenseKey: license.license_key,
      ownerName: license.owner_name,
      ownerEmail: license.owner_email,
      type: license.license_type as "lifetime" | "temporary",
      validUntil: license.valid_until ? license.valid_until.split("T")[0] : "",
      maxMachines: license.max_machines,
      notes: license.notes || "",
      loginCode: license.login_code || "",
    });
    setEditOpen(true);
  };

  if (error) {
    return (
      <div className="flex items-center justify-center p-8 text-destructive">
        Chyba při načítání licencí: {error.message}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Hledat licence..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="icon"
            onClick={() => mutate("licenses")}
            disabled={isLoading}
          >
            <RefreshCw className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
          </Button>
          <Dialog open={createOpen} onOpenChange={setCreateOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="mr-2 h-4 w-4" />
                Nová licence
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Vytvořit novou licenci</DialogTitle>
                <DialogDescription>
                  Vyplňte údaje pro novou licenci
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <div className="grid gap-2">
                  <Label>Licenční klíč</Label>
                  <div className="flex gap-2">
                    <Input
                      placeholder="Automaticky generovaný"
                      value={formData.licenseKey}
                      onChange={(e) =>
                        setFormData({ ...formData, licenseKey: e.target.value.toUpperCase() })
                      }
                      className="font-mono"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      onClick={() =>
                        setFormData({ ...formData, licenseKey: generateLicenseKey() })
                      }
                    >
                      <Key className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="grid gap-2">
                    <Label>Jméno vlastníka</Label>
                    <Input
                      value={formData.ownerName}
                      onChange={(e) =>
                        setFormData({ ...formData, ownerName: e.target.value })
                      }
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label>Email vlastníka</Label>
                    <Input
                      type="email"
                      value={formData.ownerEmail}
                      onChange={(e) =>
                        setFormData({ ...formData, ownerEmail: e.target.value })
                      }
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="grid gap-2">
                    <Label>Typ licence</Label>
                    <Select
                      value={formData.type}
                      onValueChange={(v) =>
                        setFormData({ ...formData, type: v as "lifetime" | "temporary" })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="lifetime">Permanentní</SelectItem>
                        <SelectItem value="temporary">Dočasná</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  {formData.type === "temporary" && (
                    <div className="grid gap-2">
                      <Label>Platnost do</Label>
                      <Input
                        type="date"
                        value={formData.validUntil}
                        onChange={(e) =>
                          setFormData({ ...formData, validUntil: e.target.value })
                        }
                      />
                    </div>
                  )}
                </div>
                <div className="grid gap-2">
                  <Label>Max. strojů</Label>
                  <Input
                    type="number"
                    min={1}
                    value={formData.maxMachines}
                    onChange={(e) =>
                      setFormData({ ...formData, maxMachines: parseInt(e.target.value) || 1 })
                    }
                  />
                </div>
                <div className="grid gap-2">
                  <Label>Poznámky</Label>
                  <Textarea
                    value={formData.notes}
                    onChange={(e) =>
                      setFormData({ ...formData, notes: e.target.value })
                    }
                    rows={3}
                  />
                </div>
                <div className="grid gap-2">
                  <Label>Přihlašovací kód (subadmin)</Label>
                  <Input
                    placeholder="Automaticky generovaný"
                    value={formData.loginCode}
                    onChange={(e) =>
                      setFormData({ ...formData, loginCode: e.target.value })
                    }
                    className="font-mono"
                  />
                  <p className="text-xs text-muted-foreground">
                    Kód, kterým se majitel přihlásí do subadmin panelu. Necháte-li prázdné, vygeneruje se automaticky.
                  </p>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setCreateOpen(false)}>
                  Zrušit
                </Button>
                <Button onClick={handleCreate} disabled={isSubmitting}>
                  {isSubmitting ? "Vytvářím..." : "Vytvořit"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="rounded-lg border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>Licenční klíč</TableHead>
              <TableHead>Vlastník</TableHead>
              <TableHead>Typ</TableHead>
              <TableHead>Stav</TableHead>
              <TableHead className="text-center">
                <Building2 className="h-4 w-4 mx-auto" />
              </TableHead>
              <TableHead className="text-center">
                <Monitor className="h-4 w-4 mx-auto" />
              </TableHead>
              <TableHead className="text-center">
                <HardDrive className="h-4 w-4 mx-auto" />
              </TableHead>
              <TableHead>Poslední aktivita</TableHead>
              <TableHead className="w-[50px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={9} className="text-center py-8">
                  <RefreshCw className="h-6 w-6 animate-spin mx-auto text-muted-foreground" />
                </TableCell>
              </TableRow>
            ) : filteredLicenses.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">
                  Žádné licence nenalezeny
                </TableCell>
              </TableRow>
            ) : (
              filteredLicenses.map((license) => {
                const isExpired =
                  license.license_type === "temporary" &&
                  license.valid_until &&
                  new Date(license.valid_until) < new Date();

                return (
                  <TableRow
                    key={license.license_key}
                    className="cursor-pointer"
                    onClick={() => onSelectLicense?.(license)}
                  >
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <code className="font-mono text-sm bg-secondary px-2 py-1 rounded">
                          {license.license_key}
                        </code>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6"
                          onClick={(e) => {
                            e.stopPropagation();
                            copyToClipboard(license.license_key);
                          }}
                        >
                          <Copy className="h-3 w-3" />
                        </Button>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div>
                        <div className="font-medium">{license.owner_name || "—"}</div>
                        <div className="text-sm text-muted-foreground">
                          {license.owner_email || "—"}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={license.license_type === "lifetime" ? "default" : "secondary"}>
                        {license.license_type === "lifetime" ? "Permanentní" : "Dočasná"}
                      </Badge>
                    </TableCell>
                    <TableCell>
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
                    </TableCell>
                    <TableCell className="text-center text-muted-foreground">
                      {license.branches_count ?? 0}
                    </TableCell>
                    <TableCell className="text-center text-muted-foreground">
                      {license.machines_count ?? 0}
                    </TableCell>
                    <TableCell className="text-center text-muted-foreground">
                      {license.backups_count ?? 0}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {formatDate(license.last_seen_at)}
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            onClick={(e) => {
                              e.stopPropagation();
                              copyToClipboard(license.license_key);
                            }}
                          >
                            <Copy className="mr-2 h-4 w-4" />
                            Kopírovat klíč
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={(e) => {
                              e.stopPropagation();
                              openEdit(license);
                            }}
                          >
                            <Edit className="mr-2 h-4 w-4" />
                            Upravit
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          {license.revoked ? (
                            <DropdownMenuItem
                              onClick={(e) => {
                                e.stopPropagation();
                                handleUnrevoke(license);
                              }}
                            >
                              <RefreshCw className="mr-2 h-4 w-4" />
                              Obnovit licenci
                            </DropdownMenuItem>
                          ) : (
                            <DropdownMenuItem
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedLicense(license);
                                setRevokeOpen(true);
                              }}
                              className="text-warning"
                            >
                              <Ban className="mr-2 h-4 w-4" />
                              Revokovat
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuItem
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedLicense(license);
                              setDeleteOpen(true);
                            }}
                            className="text-destructive"
                          >
                            <Trash2 className="mr-2 h-4 w-4" />
                            Smazat
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      {/* Edit Dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Upravit licenci</DialogTitle>
            <DialogDescription>
              Klíč: {selectedLicense?.license_key}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Jméno vlastníka</Label>
                <Input
                  value={formData.ownerName}
                  onChange={(e) =>
                    setFormData({ ...formData, ownerName: e.target.value })
                  }
                />
              </div>
              <div className="grid gap-2">
                <Label>Email vlastníka</Label>
                <Input
                  type="email"
                  value={formData.ownerEmail}
                  onChange={(e) =>
                    setFormData({ ...formData, ownerEmail: e.target.value })
                  }
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Typ licence</Label>
                <Select
                  value={formData.type}
                  onValueChange={(v) =>
                    setFormData({ ...formData, type: v as "lifetime" | "temporary" })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="lifetime">Permanentní</SelectItem>
                    <SelectItem value="temporary">Dočasná</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {formData.type === "temporary" && (
                <div className="grid gap-2">
                  <Label>Platnost do</Label>
                  <Input
                    type="date"
                    value={formData.validUntil}
                    onChange={(e) =>
                      setFormData({ ...formData, validUntil: e.target.value })
                    }
                  />
                </div>
              )}
            </div>
            <div className="grid gap-2">
              <Label>Max. strojů</Label>
              <Input
                type="number"
                min={1}
                value={formData.maxMachines}
                onChange={(e) =>
                  setFormData({ ...formData, maxMachines: parseInt(e.target.value) || 1 })
                }
              />
            </div>
            <div className="grid gap-2">
              <Label>Poznámky</Label>
              <Textarea
                value={formData.notes}
                onChange={(e) =>
                  setFormData({ ...formData, notes: e.target.value })
                }
                rows={3}
              />
            </div>
            <div className="grid gap-2">
              <Label>Přihlašovací kód (subadmin)</Label>
              <Input
                value={formData.loginCode}
                onChange={(e) =>
                  setFormData({ ...formData, loginCode: e.target.value })
                }
                className="font-mono"
              />
              <p className="text-xs text-muted-foreground">
                Kód pro přihlášení majitele do subadmin panelu.
              </p>
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

      {/* Revoke Dialog */}
      <Dialog open={revokeOpen} onOpenChange={setRevokeOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Revokovat licenci</DialogTitle>
            <DialogDescription>
              Licence: {selectedLicense?.license_key}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label>Důvod revokace</Label>
              <Textarea
                value={revokeReason}
                onChange={(e) => setRevokeReason(e.target.value)}
                placeholder="Uveďte důvod revokace..."
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRevokeOpen(false)}>
              Zrušit
            </Button>
            <Button
              variant="destructive"
              onClick={handleRevoke}
              disabled={isSubmitting}
            >
              {isSubmitting ? "Revokuji..." : "Revokovat"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Dialog */}
      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Smazat licenci</DialogTitle>
            <DialogDescription>
              Opravdu chcete smazat licenci {selectedLicense?.license_key}?
              Tato akce je nevratná a smaže i všechny související pobočky, stroje a zálohy.
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
              {isSubmitting ? "Mažu..." : "Smazat"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
