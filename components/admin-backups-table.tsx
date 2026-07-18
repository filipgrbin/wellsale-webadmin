"use client";

import { useMemo, useState } from "react";
import useSWR from "swr";
import {
  getBackups,
  deleteBackup,
  deleteBackupsBulk,
  getBranches,
  getLicenses,
  decryptBackupOnServer,
  type Backup,
  type ParsedBackupData,
} from "@/lib/api";
import { BackupDownloadDialog } from "@/components/backup-download-dialog";
import { type ProdejRecord, type ProdejPolozka } from "@/lib/sqlite-parser";
import {
  formatBackupDateTime,
  formatPaymentType,
  getClosureCardFields,
  getProductCardFields,
  getSaleCardFields,
  getTableDisplayName,
  getUserCardFields,
} from "@/lib/backup-preview-utils";
import { BranchAppVersion } from "@/components/branch-app-version";
import { UzaverkaTillPanel } from "@/components/uzaverka-till-panel";
import { TransactionStockMovementPanel } from "@/components/transaction-stock-movement-panel";
import { buildBranchVersionMap, resolveBackupAppVersion } from "@/lib/branch-app-version";
import { resolveCashierName } from "@/lib/uzaverka-meta";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Spinner } from "@/components/ui/spinner";
import {
  Download,
  Trash2,
  Search,
  Database,
  Filter,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  Eye,
  FileText,
  ShoppingCart,
  CreditCard,
  Banknote,
  Receipt,
  Package,
  Users,
  Settings,
  ArrowUp,
  ArrowDown,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { cs } from "date-fns/locale";

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}

function formatDate(date: string | null) {
  if (!date) return "-";
  return formatDistanceToNow(new Date(date), { addSuffix: true, locale: cs });
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("cs-CZ", {
    style: "currency",
    currency: "CZK",
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(amount);
}

function getTableIcon(tableName: string) {
  const name = tableName.toLowerCase();
  if (name.includes("user")) return <Users className="h-4 w-4" />;
  if (name.includes("setting")) return <Settings className="h-4 w-4" />;
  if (name.includes("audit") || name.includes("log")) return <FileText className="h-4 w-4" />;
  if (name.includes("transaction") || name.includes("sale") || name.includes("prodej") || name.includes("receipt")) return <ShoppingCart className="h-4 w-4" />;
  if (name.includes("stock") || name.includes("movement")) return <ChevronRight className="h-4 w-4" />;
  if (name.includes("daily") || name.includes("close") || name.includes("uzaverk")) return <Receipt className="h-4 w-4" />;
  return <Database className="h-4 w-4" />;
}

function shouldShowTableForSubadmin(tableName: string): boolean {
  const lower = tableName.toLowerCase();
  return ![
    "settings",
    "app_settings",
    "config",
    "sqlite_sequence",
    "ntfy_queue",
    "transaction_items",
    "sale_items",
    "polozky",
    "polozka",
    "item_sales",
    "sale_lines",
  ].includes(lower) && !lower.includes("transaction_event") && !lower.includes("events");
}

export function AdminBackupsTable() {
  const [search, setSearch] = useState("");
  const [selectedLicense, setSelectedLicense] = useState<string>("all");
  const [selectedBranch, setSelectedBranch] = useState<string>("all");
  const [selectedKind, setSelectedKind] = useState<string>("all");
  const [page, setPage] = useState(0);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [isBulkDeleting, setIsBulkDeleting] = useState(false);
  const [isDownloading, setIsDownloading] = useState<number | null>(null);
  
  // Backup viewer state
  const [viewingBackup, setViewingBackup] = useState<Backup | null>(null);
  const [isDecrypting, setIsDecrypting] = useState(false);
  const [decryptedData, setDecryptedData] = useState<ParsedBackupData | null>(null);
  const [decryptError, setDecryptError] = useState<string | null>(null);
  const [selectedProdej, setSelectedProdej] = useState<ProdejRecord | null>(null);
  const [downloadChoice, setDownloadChoice] = useState<Backup | null>(null);
  
  const limit = 25;

  const { data: licensesData } = useSWR(["admin-licenses"], () => getLicenses());
  const { data: branchesData } = useSWR(
    ["admin-branches-filter", selectedLicense],
    () => getBranches(selectedLicense !== "all" ? selectedLicense : undefined, true)
  );

  const { data, error, isLoading, mutate } = useSWR(
    ["admin-backups", selectedLicense, selectedBranch, selectedKind, page],
    () =>
      getBackups({
        licenseKey: selectedLicense !== "all" ? selectedLicense : undefined,
        branchId: selectedBranch !== "all" ? Number(selectedBranch) : undefined,
        kind: selectedKind !== "all" ? selectedKind : undefined,
        limit,
        offset: page * limit,
      })
  );

  const backups = data?.backups || [];
  const total = data?.total || 0;
  const totalPages = Math.ceil(total / limit);
  const licenses = licensesData?.licenses || [];
  const branches = branchesData?.branches || [];
  const branchVersionMap = useMemo(() => buildBranchVersionMap(branches), [branches]);

  const filtered = backups.filter(
    (b) =>
      b.file_name.toLowerCase().includes(search.toLowerCase()) ||
      (b.branch_name && b.branch_name.toLowerCase().includes(search.toLowerCase())) ||
      (b.license_owner && b.license_owner.toLowerCase().includes(search.toLowerCase()))
  );

  const kinds = [...new Set(backups.map((b) => b.kind))].filter(Boolean);

  const handleToggleSelect = (id: number) => {
    const newSet = new Set(selectedIds);
    if (newSet.has(id)) {
      newSet.delete(id);
    } else {
      newSet.add(id);
    }
    setSelectedIds(newSet);
  };

  const handleSelectAll = () => {
    if (selectedIds.size === filtered.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filtered.map((b) => b.id)));
    }
  };

  // Offer a choice between the decrypted .db and the encrypted .wsbak.
  const handleDownload = (backup: Backup) => {
    setDownloadChoice(backup);
  };

  const handleViewBackup = async (backup: Backup) => {
    setViewingBackup(backup);
    setDecryptedData(null);
    setDecryptError(null);
    setIsDecrypting(true);
    setSelectedProdej(null);

    try {
      const parsed = await decryptBackupOnServer(backup.id);
      setDecryptedData(parsed);
    } catch (err) {
      setDecryptError(err instanceof Error ? err.message : "Neznama chyba");
    } finally {
      setIsDecrypting(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    try {
      await deleteBackup(deleteId);
      await mutate();
      setDeleteId(null);
    } catch (err) {
      console.error("Failed to delete backup:", err);
    }
  };

  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return;
    setIsBulkDeleting(true);
    try {
      await deleteBackupsBulk([...selectedIds]);
      await mutate();
      setSelectedIds(new Set());
    } catch (err) {
      console.error("Failed to delete backups:", err);
    } finally {
      setIsBulkDeleting(false);
    }
  };

  // Get items for selected prodej
  const selectedProdejItems = selectedProdej
    ? decryptedData?.polozky.filter(
        (p) =>
          p.prodej_id === selectedProdej.id ||
          p.prodej_id === Number(selectedProdej.cislo_dokladu) ||
          p.referenceId === selectedProdej.cislo_dokladu
      ) || []
    : [];

  const isUzaverkaBackup = viewingBackup?.kind === "uzaverka" || viewingBackup?.kind === "close";

  if (error) {
    return (
      <Card className="border-border bg-card">
        <CardContent className="py-12 text-center text-destructive">
          Chyba pri nacitani zaloh: {error.message}
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card className="border-border bg-card">
        <CardHeader className="pb-4">
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <CardTitle className="text-lg flex items-center gap-2">
                <Database className="h-5 w-5" />
                Zalohy ({total})
              </CardTitle>
              <div className="flex items-center gap-2">
                <div className="relative flex-1 sm:flex-none">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Hledat..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="pl-9 w-full sm:w-64"
                  />
                </div>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => mutate()}
                  disabled={isLoading}
                >
                  <RefreshCw className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
                </Button>
              </div>
            </div>

            {/* Filters */}
            <div className="flex flex-wrap items-center gap-2">
              <Filter className="h-4 w-4 text-muted-foreground" />
              
              <Select value={selectedLicense} onValueChange={(v) => { setSelectedLicense(v); setSelectedBranch("all"); setPage(0); }}>
                <SelectTrigger className="w-[200px]">
                  <SelectValue placeholder="Licence" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Vsechny licence</SelectItem>
                  {licenses.map((lic) => (
                    <SelectItem key={lic.license_key} value={lic.license_key}>
                      {lic.owner_name || lic.license_key.slice(0, 9)}...
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              
              <Select value={selectedBranch} onValueChange={(v) => { setSelectedBranch(v); setPage(0); }}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="Pobocka" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Vsechny pobocky</SelectItem>
                  {branches.map((branch) => (
                    <SelectItem key={branch.id} value={String(branch.id)}>
                      {branch.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={selectedKind} onValueChange={(v) => { setSelectedKind(v); setPage(0); }}>
                <SelectTrigger className="w-[150px]">
                  <SelectValue placeholder="Typ" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Vsechny typy</SelectItem>
                  {kinds.map((kind) => (
                    <SelectItem key={kind} value={kind}>
                      {kind}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {selectedIds.size > 0 && (
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={handleBulkDelete}
                  disabled={isBulkDeleting}
                >
                  {isBulkDeleting ? (
                    <Spinner className="h-4 w-4 mr-2" />
                  ) : (
                    <Trash2 className="h-4 w-4 mr-2" />
                  )}
                  Smazat ({selectedIds.size})
                </Button>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading && backups.length === 0 ? (
            <div className="flex items-center justify-center py-12">
              <Spinner className="h-6 w-6" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              Zadne zalohy k zobrazeni
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="border-border">
                      <TableHead className="w-10">
                        <Checkbox
                          checked={selectedIds.size === filtered.length && filtered.length > 0}
                          onCheckedChange={handleSelectAll}
                        />
                      </TableHead>
                      <TableHead>Soubor</TableHead>
                      <TableHead>Licence</TableHead>
                      <TableHead>Pobocka</TableHead>
                      <TableHead>Typ</TableHead>
                      <TableHead>Verze app</TableHead>
                      <TableHead>Zisk</TableHead>
                      <TableHead>Velikost</TableHead>
                      <TableHead>Nahrano</TableHead>
                      <TableHead className="text-right">Akce</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.map((backup) => {
                      const ver = resolveBackupAppVersion(backup, branchVersionMap);
                      return (
                      <TableRow key={backup.id} className="border-border">
                        <TableCell>
                          <Checkbox
                            checked={selectedIds.has(backup.id)}
                            onCheckedChange={() => handleToggleSelect(backup.id)}
                          />
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <FileText className="h-4 w-4 text-muted-foreground" />
                            <span className="font-medium text-sm truncate max-w-[200px]">
                              {backup.file_name}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="text-sm">
                            <p className="font-medium">{backup.license_owner || "-"}</p>
                            <code className="text-xs text-muted-foreground">
                              {backup.license_key.slice(0, 9)}...
                            </code>
                          </div>
                        </TableCell>
                        <TableCell>
                          {backup.branch_name ? (
                            <Badge variant="outline">{backup.branch_name}</Badge>
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary">{backup.kind}</Badge>
                        </TableCell>
                        <TableCell>
                          <BranchAppVersion version={ver.app_version} seenAt={ver.app_version_seen_at} />
                        </TableCell>
                        <TableCell className="text-emerald-500">
                          {(() => {
                            const v = Number((backup.metadata_json as Record<string, unknown> | null)?.real_zisk);
                            return Number.isFinite(v) ? formatCurrency(v) : "—";
                          })()}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {formatBytes(backup.size_bytes)}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {formatDate(backup.uploaded_at)}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            {(backup.file_name.endsWith(".wsbak") || backup.file_name.endsWith(".db")) && (
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => handleViewBackup(backup)}
                                title="Zobrazit obsah"
                              >
                                <Eye className="h-4 w-4" />
                              </Button>
                            )}
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleDownload(backup)}
                              disabled={isDownloading === backup.id}
                            >
                              {isDownloading === backup.id ? (
                                <Spinner className="h-4 w-4" />
                              ) : (
                                <Download className="h-4 w-4" />
                              )}
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => setDeleteId(backup.id)}
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between mt-4 pt-4 border-t border-border">
                  <p className="text-sm text-muted-foreground">
                    Strana {page + 1} z {totalPages}
                  </p>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPage(Math.max(0, page - 1))}
                      disabled={page === 0}
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPage(Math.min(totalPages - 1, page + 1))}
                      disabled={page >= totalPages - 1}
                    >
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* Backup Viewer Dialog */}
      <BackupDownloadDialog
        backup={downloadChoice}
        onOpenChange={(o) => { if (!o) setDownloadChoice(null); }}
      />

      <Dialog open={!!viewingBackup} onOpenChange={(open) => { 
        if (!open) {
          setViewingBackup(null); 
          setSelectedProdej(null);
          setDecryptedData(null);
          setDecryptError(null);
        }
      }}>
        <DialogContent className="max-w-[98vw] sm:max-w-[98vw] w-full max-h-[95vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Database className="h-5 w-5" />
              {isUzaverkaBackup ? "Uzaverka" : "Záloha"}: {viewingBackup?.file_name}
            </DialogTitle>
            <DialogDescription>
              {viewingBackup?.branch_name} - {viewingBackup?.license_owner}
            </DialogDescription>
          </DialogHeader>
          
          {isDecrypting ? (
            <div className="flex flex-col items-center justify-center py-12 gap-4">
              <Spinner className="h-8 w-8" />
              <p className="text-muted-foreground">Desifruji a nacitam data...</p>
            </div>
          ) : decryptError ? (
            <div className="flex flex-col items-center justify-center py-12 gap-4 text-destructive">
              <p>Chyba: {decryptError}</p>
            </div>
          ) : decryptedData ? (
            isUzaverkaBackup ? (
              <div className="flex-1 overflow-hidden">
              {/* Stats */}
              <div className="flex flex-wrap gap-3 mb-4">
                <Card className="bg-secondary/50 flex-1 min-w-[140px]">
                  <CardContent className="p-3 flex items-center gap-2">
                    <ShoppingCart className="h-6 w-6 text-primary shrink-0" />
                    <div className="min-w-0">
                      <p className="text-xl font-bold">{decryptedData.stats.totalSales}</p>
                      <p className="text-xs text-muted-foreground">Prodeju</p>
                    </div>
                  </CardContent>
                </Card>
                <Card className="bg-secondary/50 flex-1 min-w-[140px]">
                  <CardContent className="p-3 flex items-center gap-2">
                    <Receipt className="h-6 w-6 text-success shrink-0" />
                    <div className="min-w-0">
                      <p className="text-xl font-bold">{formatCurrency(decryptedData.stats.totalRevenue)}</p>
                      <p className="text-xs text-muted-foreground">Celkem</p>
                    </div>
                  </CardContent>
                </Card>
                <Card className="bg-secondary/50 flex-1 min-w-[140px]">
                  <CardContent className="p-3 flex items-center gap-2">
                    <Banknote className="h-6 w-6 text-chart-2 shrink-0" />
                    <div className="min-w-0">
                      <p className="text-xl font-bold">{formatCurrency(decryptedData.stats.totalCash)}</p>
                      <p className="text-xs text-muted-foreground">Hotovost</p>
                    </div>
                  </CardContent>
                </Card>
                <Card className="bg-secondary/50 flex-1 min-w-[140px]">
                  <CardContent className="p-3 flex items-center gap-2">
                    <CreditCard className="h-6 w-6 text-chart-3 shrink-0" />
                    <div className="min-w-0">
                      <p className="text-xl font-bold">{formatCurrency(decryptedData.stats.totalCard)}</p>
                      <p className="text-xs text-muted-foreground">Kartou</p>
                    </div>
                  </CardContent>
                </Card>
              </div>

              <UzaverkaTillPanel
                sources={[
                  viewingBackup?.metadata_json,
                  decryptedData.uzaverky[0],
                ]}
              />

              <Tabs defaultValue="prodeje" className="flex-1">
                <TabsList>
                  <TabsTrigger value="prodeje" className="gap-2">
                    <ShoppingCart className="h-4 w-4" />
                    Prodeje ({decryptedData.prodeje.length})
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="prodeje" className="mt-4">
                  <div className="grid grid-cols-5 gap-4 h-[min(520px,calc(95vh-16rem))] min-h-0">
                    {/* Sales list */}
                    <ScrollArea className="col-span-2 h-full min-h-0 border rounded-lg">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Doklad</TableHead>
                            <TableHead>Datum</TableHead>
                            <TableHead>Celkem</TableHead>
                            <TableHead>Platba</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {decryptedData.prodeje.map((prodej) => (
                            <TableRow 
                              key={prodej.id} 
                              className={`cursor-pointer hover:bg-secondary/50 ${selectedProdej?.id === prodej.id ? "bg-primary/10" : ""}`}
                              onClick={() => setSelectedProdej(prodej)}
                            >
                              <TableCell className="font-medium">{prodej.cislo_dokladu}</TableCell>
                              <TableCell className="text-sm text-muted-foreground">{formatBackupDateTime(prodej.datum)}</TableCell>
                              <TableCell className="font-semibold text-green-500">{formatCurrency(prodej.celkem)}</TableCell>
                              <TableCell>
                                <Badge variant="outline" className="text-xs">
                                  {prodej.platba_typ}
                                </Badge>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </ScrollArea>
                    
                    {/* Selected sale items */}
                    <div className="col-span-3 border rounded-lg p-6 min-h-0 overflow-hidden flex flex-col">
                      {selectedProdej ? (
                        <div className="space-y-4 flex-1 min-h-0 flex flex-col">
                          <div className="flex items-center justify-between shrink-0">
                            <h4 className="font-semibold text-lg flex items-center gap-2">
                              <Package className="h-5 w-5" />
                              Polozky dokladu #{selectedProdej.cislo_dokladu}
                            </h4>
                            <div className="text-right">
                              <Badge variant="outline" className="text-base px-3 py-1">{selectedProdej.platba_typ}</Badge>
                              <p className="text-2xl font-bold text-green-500 mt-1">{formatCurrency(selectedProdej.celkem)}</p>
                            </div>
                          </div>
                          <TransactionStockMovementPanel
                            transaction={selectedProdej}
                            stockMovements={decryptedData.stockMovements}
                          />
                          <ScrollArea className="flex-1 min-h-0">
                            {selectedProdejItems.length > 0 ? (
                              <div className="space-y-3">
                                {selectedProdejItems.map((item) => (
                                  <div key={item.id} className="flex items-center justify-between p-4 bg-secondary/50 rounded-lg">
                                    <div>
                                      <p className="font-medium text-base">{item.nazev}</p>
                                      <p className="text-sm text-muted-foreground">
                                        {item.mnozstvi}× {formatCurrency(item.cena_jednotka)}
                                      </p>
                                    </div>
                                    <p className="font-semibold text-lg">{formatCurrency(item.cena_celkem)}</p>
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <p className="text-muted-foreground text-center py-8">
                                Zadne polozky nenalezeny
                              </p>
                            )}
                          </ScrollArea>
                        </div>
                      ) : (
                        <div className="flex items-center justify-center h-full text-muted-foreground">
                          <div className="text-center">
                            <Package className="h-12 w-12 mx-auto mb-2 opacity-30" />
                            <p>Kliknete na prodej pro zobrazeni polozek</p>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </TabsContent>
              </Tabs>
            </div>
          ) : (
            <div className="flex-1 overflow-hidden">
              {/* Summary Cards for non-uzaverka backup */}
              <ScrollArea className="w-full mb-4">
                <div className="flex gap-2 pb-2">
                  {decryptedData.tables
                    .filter(shouldShowTableForSubadmin)
                    .map((tableName) => {
                      const tableData = decryptedData.rawTables?.[tableName];
                      return (
                        <Card key={tableName} className="bg-secondary/30 shrink-0 min-w-[160px]">
                          <CardContent className="p-3 flex items-center gap-2">
                            {getTableIcon(tableName)}
                            <div className="min-w-0 flex-1">
                              <p className="text-xs font-medium truncate">{getTableDisplayName(tableName)}</p>
                              <p className="text-lg font-bold">{tableData?.rowCount || 0}</p>
                            </div>
                          </CardContent>
                        </Card>
                      );
                    })}
                </div>
              </ScrollArea>

              <p className="text-sm text-muted-foreground mb-2">
                Nalezeno {decryptedData.tables.filter(shouldShowTableForSubadmin).length} tabulek v záloze. Vyberte tabulku pro zobrazení záznamů:
              </p>

              <Tabs defaultValue={decryptedData.tables.filter(shouldShowTableForSubadmin)[0] || "none"} className="flex-1">
                <ScrollArea className="w-full">
                  <TabsList className="w-full justify-start flex-wrap h-auto gap-1 p-1">
                    {decryptedData.tables
                      .filter(shouldShowTableForSubadmin)
                      .map((tableName) => (
                        <TabsTrigger key={tableName} value={tableName} className="gap-2 text-xs">
                          {getTableIcon(tableName)}
                          {getTableDisplayName(tableName)}
                          {decryptedData.rawTables?.[tableName] && (
                            <Badge variant="secondary" className="ml-1 text-[10px] px-1">
                              {decryptedData.rawTables[tableName].rowCount}
                            </Badge>
                          )}
                        </TabsTrigger>
                      ))}
                  </TabsList>
                </ScrollArea>

                {decryptedData.tables
                  .filter(shouldShowTableForSubadmin)
                  .map((tableName) => {
                    const tableData = decryptedData.rawTables?.[tableName];
                    const name = tableName.toLowerCase();
                    const isStockMovements = name === "stock_movements" || name.includes("movement") || name.includes("stock");
                    const isProductsTable = name.includes("product");
                    const isUsersTable = name.includes("user");
                    const isClosureTable = name.includes("daily_close") || name.includes("uzaverk") || name.includes("closure");
                    const isSalesTable = name.includes("transaction") || name.includes("sale") || name.includes("prodej") || name.includes("receipt");

                    return (
                      <TabsContent key={tableName} value={tableName} className="mt-4">
                        {tableData ? (
                          <div className="space-y-2">
                            <div className="flex items-center justify-between text-sm text-muted-foreground">
                              <span className="font-medium text-foreground">{getTableDisplayName(tableName)}</span>
                              <span>Celkem záznamů: {tableData.rowCount} (zobrazeno max 100)</span>
                            </div>
                            <ScrollArea className="h-[450px] border rounded-lg">
                              {isStockMovements ? (
                                <div className="p-3 space-y-2">
                                  {tableData.rows.map((row, i) => {
                                    const qty = Number(row.qty || row.quantity || row.mnozstvi || 0);
                                    const isIncoming = qty > 0;
                                    const productName = String(row.product_name || row.name_snapshot || row.nazev || row.product_id || "Neznámý produkt");
                                    const reason = String(row.reason || row.duvod || row.type || "");
                                    const createdAt = formatBackupDateTime(String(row.created_at || row.datum || row.date || ""));

                                    return (
                                      <div
                                        key={i}
                                        className={`flex items-center gap-4 p-3 rounded-lg border ${
                                          isIncoming
                                            ? "bg-green-500/5 border-green-500/20"
                                            : "bg-red-500/5 border-red-500/20"
                                        }`}
                                      >
                                        <div className={`flex items-center justify-center w-10 h-10 rounded-full ${
                                          isIncoming ? "bg-green-500/20" : "bg-red-500/20"
                                        }`}>
                                          {isIncoming ? (
                                            <ArrowUp className="h-5 w-5 text-green-500" />
                                          ) : (
                                            <ArrowDown className="h-5 w-5 text-red-500" />
                                          )}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                          <p className="font-medium truncate">{productName}</p>
                                          <p className="text-xs text-muted-foreground">
                                            {reason && `${reason} • `}{createdAt}
                                          </p>
                                        </div>
                                        <div className={`text-lg font-bold ${isIncoming ? "text-green-500" : "text-red-500"}`}>
                                          {isIncoming ? "+" : ""}{qty} ks
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              ) : isProductsTable ? (
                                <div className="p-3 space-y-3">
                                  {tableData.rows.map((row, i) => {
                                    const { name, price, quantity, limit } = getProductCardFields(row as Record<string, unknown>);
                                    return (
                                      <div key={i} className="rounded-3xl border border-slate-700 bg-slate-950/80 p-4">
                                        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                                          <div>
                                            <p className="font-semibold text-base">{name}</p>
                                            <p className="text-sm text-muted-foreground">Produkt</p>
                                          </div>
                                          <div className="flex flex-wrap gap-2 text-sm text-muted-foreground">
                                            <span className="inline-flex items-center rounded-full bg-slate-800 px-2 py-1">{formatCurrency(price)}</span>
                                            <span className="inline-flex items-center rounded-full bg-slate-800 px-2 py-1">Sklad: {quantity} ks</span>
                                            {limit > 0 && <span className="inline-flex items-center rounded-full bg-slate-800 px-2 py-1">Limit: {limit} ks</span>}
                                          </div>
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              ) : isSalesTable ? (
                                <div className="p-3 space-y-2">
                                  {tableData.rows.map((row, i) => {
                                    const { date, total, payment } = getSaleCardFields(row as Record<string, unknown>);
                                    return (
                                      <div key={i} className="flex flex-col gap-3 rounded-3xl border border-slate-700 bg-slate-950/80 p-4 sm:flex-row sm:items-center sm:justify-between">
                                        <div className="min-w-0">
                                          <p className="font-semibold text-base">{formatBackupDateTime(date)}</p>
                                          <p className="text-xs text-muted-foreground">Platba: {payment}</p>
                                        </div>
                                        <div className="text-right">
                                          <p className="text-lg font-semibold text-green-400">{formatCurrency(total)}</p>
                                          <p className="text-xs text-muted-foreground">Celkem</p>
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              ) : isClosureTable ? (
                                <div className="p-3 space-y-3">
                                  {tableData.rows.map((row, i) => {
                                    const { date, total, cashTotal, qrTotal, txCount, totalItems } = getClosureCardFields(row as Record<string, unknown>);
                                    return (
                                      <div key={i} className="rounded-3xl border border-slate-700 bg-slate-950/80 p-4">
                                        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                                          <div>
                                            <p className="font-semibold text-base">{formatBackupDateTime(date)}</p>
                                            <p className="text-xs text-muted-foreground">Uzávěrka</p>
                                          </div>
                                          <div className="flex flex-wrap gap-2 text-sm text-muted-foreground">
                                            <span className="inline-flex items-center rounded-full bg-slate-800 px-2 py-1">Tržba: {formatCurrency(total)}</span>
                                            <span className="inline-flex items-center rounded-full bg-slate-800 px-2 py-1">Hotově: {formatCurrency(cashTotal)}</span>
                                            <span className="inline-flex items-center rounded-full bg-slate-800 px-2 py-1">QR: {formatCurrency(qrTotal)}</span>
                                          </div>
                                        </div>
                                        <div className="grid gap-3 sm:grid-cols-3 mt-3">
                                          <div className="rounded-2xl bg-slate-900/80 p-3">
                                            <div className="text-xs text-muted-foreground">Transakcí</div>
                                            <div className="font-semibold">{txCount}</div>
                                          </div>
                                          <div className="rounded-2xl bg-slate-900/80 p-3">
                                            <div className="text-xs text-muted-foreground">Položek</div>
                                            <div className="font-semibold">{totalItems}</div>
                                          </div>
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              ) : isUsersTable ? (
                                <div className="p-3 space-y-3">
                                  {tableData.rows.map((row, i) => {
                                    const { name, role, created, pin, permissions } = getUserCardFields(row as Record<string, unknown>);
                                    return (
                                      <div key={i} className="rounded-3xl border border-slate-700 bg-slate-950/80 p-4">
                                        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                                          <div>
                                            <p className="font-semibold text-base">{name}</p>
                                            <p className="text-xs text-muted-foreground">Role: {role}</p>
                                          </div>
                                          <div className="text-sm text-muted-foreground">Vytvořeno: {formatBackupDateTime(created)}</div>
                                        </div>
                                        <div className="mt-3 flex flex-wrap gap-2">
                                          {permissions.length > 0 ? (
                                            permissions.map((permission) => (
                                              <Badge key={permission} variant="outline" className="text-[11px] px-2 py-1">
                                                {permission}
                                              </Badge>
                                            ))
                                          ) : (
                                            <span className="text-xs text-muted-foreground">Žádná oprávnění</span>
                                          )}
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              ) : (
                                <Table>
                                  <TableHeader>
                                    <TableRow>
                                      {tableData.columns.map((col) => (
                                        <TableHead key={col} className="text-xs whitespace-nowrap">
                                          {col}
                                        </TableHead>
                                      ))}
                                    </TableRow>
                                  </TableHeader>
                                  <TableBody>
                                    {tableData.rows.map((row, i) => (
                                      <TableRow key={i}>
                                        {tableData.columns.map((col) => (
                                          <TableCell key={col} className="text-xs max-w-[200px] truncate" title={String(row[col] ?? "")}> 
                                            {row[col] === null ? (
                                              <span className="text-muted-foreground italic">null</span>
                                            ) : typeof row[col] === "object" ? (
                                              <code className="text-[10px] bg-secondary px-1 rounded">
                                                {JSON.stringify(row[col]).slice(0, 50)}...
                                              </code>
                                            ) : (
                                              String(row[col])
                                            )}
                                          </TableCell>
                                        ))}
                                      </TableRow>
                                    ))}
                                  </TableBody>
                                </Table>
                              )}
                            </ScrollArea>
                          </div>
                        ) : (
                          <div className="text-center py-8 text-muted-foreground">
                            Data pro tabulku {getTableDisplayName(tableName)} nejsou k dispozici
                          </div>
                        )}
                      </TabsContent>
                    );
                  })}
              </Tabs>
            </div>
          )
        ) : null}
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteId} onOpenChange={(open) => { if (!open) setDeleteId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Smazat zalohu?</AlertDialogTitle>
            <AlertDialogDescription>
              Tato akce je nevratna. Zaloha bude trvale smazana ze serveru.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Zrusit</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Smazat
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
