"use client";

import { useParams, useRouter } from "next/navigation";
import { useState, useMemo, useEffect } from "react";
import useSWR from "swr";
import { 
  getBranches, 
  getBranchDbKey, 
  getBackups,
  decryptBackupOnServer,
  type Branch,
  type Backup,
  type ParsedBackupData,
} from "@/lib/api";
import { type ProdejRecord, type ProdejPolozka } from "@/lib/sqlite-parser";
import {
  formatBackupDateTime,
  formatPaymentType,
  getClosureCardFields,
  getProductCardFields,
  getSaleCardFields,
  getTableDisplayName,
  getUserCardFields,
  isTransactionEventsTable,
} from "@/lib/backup-preview-utils";
import { BranchFaults } from "@/components/branch-faults";
import { BackupDownloadDialog } from "@/components/backup-download-dialog";
import { BranchAppVersion } from "@/components/branch-app-version";
import { UzaverkaTillPanel } from "@/components/uzaverka-till-panel";
import { TransactionStockMovementPanel } from "@/components/transaction-stock-movement-panel";
import { resolveBackupAppVersion } from "@/lib/branch-app-version";
import { hasTillData, resolveCashierName } from "@/lib/uzaverka-meta";

interface SubadminSession {
  licenseKey: string;
  ownerName: string;
  ownerEmail: string;
  loginCode: string;
}
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/spinner";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  ArrowDown,
  ArrowUp,
  ArrowLeft,
  KeyRound,
  Eye,
  EyeOff,
  Copy,
  AlertTriangle,
  Database,
  Calendar,
  HardDrive,
  Receipt,
  Banknote,
  QrCode,
  Package,
  TrendingUp,
  BarChart3,
  ShoppingCart,
  Loader2,
  Download,
  TableIcon,
  Users,
  Settings,
  ClipboardList,
  ArrowUpDown,
  Smartphone,
} from "lucide-react";

// Helper to get nice table names
// Tables hidden for subadmin
const HIDDEN_TABLES_FOR_SUBADMIN = ["settings", "app_settings", "config", "sqlite_sequence"];

function shouldShowTableForSubadmin(tableName: string): boolean {
  const lower = tableName.toLowerCase();
  return !HIDDEN_TABLES_FOR_SUBADMIN.includes(lower) && !isTransactionEventsTable(tableName);
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("cs-CZ", { style: "currency", currency: "CZK", maximumFractionDigits: 0 }).format(amount);
}

function getTableIcon(tableName: string) {
  const name = tableName.toLowerCase();
  if (name.includes("user")) return <Users className="h-4 w-4" />;
  if (name.includes("setting")) return <Settings className="h-4 w-4" />;
  if (name.includes("audit") || name.includes("log")) return <ClipboardList className="h-4 w-4" />;
  if (name.includes("transaction")) return <ShoppingCart className="h-4 w-4" />;
  if (name.includes("stock") || name.includes("movement")) return <ArrowUpDown className="h-4 w-4" />;
  if (name.includes("daily") || name.includes("close")) return <Receipt className="h-4 w-4" />;
  return <TableIcon className="h-4 w-4" />;
}

// Extract close date from backup filename (e.g., "uzaverka_2024-01-15_branch.wsbak")
function extractDateFromFilename(filename: string): string | null {
  const match = filename.match(/(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : null;
}

export default function BranchDetailPage() {
  const params = useParams();
  const router = useRouter();
  const branchId = Number(params.id);
  
  // Session state - load from localStorage
  const [session, setSession] = useState<SubadminSession | null>(null);
  const [sessionLoading, setSessionLoading] = useState(true);
  
  useEffect(() => {
    const savedSession = localStorage.getItem("subadmin_session");
    if (savedSession) {
      try {
        setSession(JSON.parse(savedSession));
      } catch {
        // Invalid session, redirect to login
        router.push("/");
      }
    } else {
      // No session, redirect to login
      router.push("/");
    }
    setSessionLoading(false);
  }, [router]);
  
  // DB Key state
  const [dbKeyVisible, setDbKeyVisible] = useState(false);
  const [dbKey, setDbKey] = useState<string | null>(null);
  const [dbKeyLoading, setDbKeyLoading] = useState(false);
  
  // Backup view state
  const [viewingBackup, setViewingBackup] = useState<Backup | null>(null);
  const [decryptedData, setDecryptedData] = useState<ParsedBackupData | null>(null);
  const [decryptError, setDecryptError] = useState<string | null>(null);
  const [isDecrypting, setIsDecrypting] = useState(false);
  const [isDownloading, setIsDownloading] = useState<number | null>(null);
  const [downloadChoice, setDownloadChoice] = useState<Backup | null>(null);
  const [selectedProdej, setSelectedProdej] = useState<{ id: number; cislo_dokladu: string; datum: string; celkem: number; platba_typ: string } | null>(null);

  // Fetch branch info - we need to get it from the list of branches using the license key
  const { data: branchesData, isLoading: branchLoading, error: branchError } = useSWR(
    session?.licenseKey ? ["branch-detail", branchId, session.licenseKey] : null,
    async () => {
      console.log("[v0] Fetching branches for license:", session!.licenseKey, "looking for branch ID:", branchId);
      // Get branches for this license to find the one we need
      const data = await getBranches(session!.licenseKey, true);
      console.log("[v0] Got branches:", data.branches?.length, "branches");
      // Convert both to numbers for comparison since API might return string IDs
      const branch = data.branches.find(b => Number(b.id) === branchId);
      console.log("[v0] Found branch:", branch);
      return { branch };
    }
  );
  
  // Debug log
  useEffect(() => {
    if (branchError) {
      console.error("[v0] Branch fetch error:", branchError);
    }
  }, [branchError]);
  
  const branch = branchesData?.branch;

  // Fetch backups for this branch
  const { data: backupsData, isLoading: backupsLoading } = useSWR(
    session && branchId ? ["branch-backups", branchId, session.licenseKey] : null,
    () => getBackups({ branchId, licenseKey: session!.licenseKey, limit: 100 })
  );

  // Filter uzaverky backups
  const uzaverkyBackups = useMemo(() => {
    if (!backupsData?.backups) return [];
    return backupsData.backups.filter(b => b.kind === "uzaverka" || b.kind === "close");
  }, [backupsData?.backups]);

  // Other backups (not uzaverka)
  const otherBackups = useMemo(() => {
    if (!backupsData?.backups) return [];
    return backupsData.backups.filter(b => b.kind !== "uzaverka" && b.kind !== "close");
  }, [backupsData?.backups]);
  
  // Load DB key on mount
  const loadDbKey = async () => {
    if (dbKey) return;
    setDbKeyLoading(true);
    try {
      const result = await getBranchDbKey(branchId);
      if (result.ok) {
        setDbKey(result.dbKey);
      }
    } catch (e) {
      console.error("Failed to get DB key:", e);
    } finally {
      setDbKeyLoading(false);
    }
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

  // Offer a choice between the decrypted .db and the encrypted .wsbak.
  const handleDownload = (backup: Backup) => {
    setDownloadChoice(backup);
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  const isUzaverkaBackup = viewingBackup?.kind === "uzaverka" || viewingBackup?.kind === "close";

  const selectedProdejItems = selectedProdej && decryptedData
    ? decryptedData.polozky.filter(p => p.prodej_id === selectedProdej.id) 
    : [];

  // Show loading while session is being loaded
  if (sessionLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Spinner className="h-8 w-8" />
      </div>
    );
  }

  if (!session) {
    return null; // Will redirect to /
  }

  if (branchLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Spinner className="h-8 w-8" />
      </div>
    );
  }

  if (!branch) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-4">
        <p className="text-muted-foreground">Pobočka nenalezena (ID: {branchId})</p>
        <p className="text-xs text-muted-foreground">License: {session?.licenseKey}</p>
        <Button variant="outline" onClick={() => router.back()}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Zpět
        </Button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto py-6 px-4 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => router.back()}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div>
              <h1 className="text-2xl font-bold flex items-center gap-2">
                {branch.name}
                <code className="text-sm bg-secondary px-2 py-0.5 rounded font-normal">
                  {branch.code}
                </code>
              </h1>
              {branch.address && (
                <p className="text-muted-foreground">{branch.address}</p>
              )}
              <div className="flex items-center gap-2 mt-1 text-sm text-muted-foreground">
                <Smartphone className="h-4 w-4 shrink-0" />
                <span>Verze aplikace:</span>
                <BranchAppVersion
                  version={branch.app_version}
                  seenAt={branch.app_version_seen_at}
                  inline
                />
                {branch.app_version_seen_at && (
                  <span className="text-xs">
                    (nahlášeno{" "}
                    {new Date(branch.app_version_seen_at).toLocaleString("cs-CZ")})
                  </span>
                )}
              </div>
            </div>
          </div>
          <Badge className={branch.archived_at ? "bg-secondary" : "bg-green-500/10 text-green-500 border-green-500/20"}>
            {branch.archived_at ? "Archivováno" : "Aktivní"}
          </Badge>
        </div>

        {/* DB Key Section */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <KeyRound className="h-4 w-4" />
              Šifrovací klíč (DB Key)
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-start gap-3 p-3 rounded-lg bg-warning/10 border border-warning/30">
              <AlertTriangle className="h-4 w-4 text-warning shrink-0 mt-0.5" />
              <p className="text-xs text-muted-foreground">
                Tento klíč slouží k dešifrování dat. <strong className="text-foreground">Nikdy jej nikomu nesdělujte!</strong>
              </p>
            </div>
            
            {dbKeyLoading ? (
              <div className="flex items-center gap-2 p-3 bg-secondary rounded-lg">
                <Spinner className="h-4 w-4" />
                <span className="text-sm text-muted-foreground">Načítám klíč...</span>
              </div>
            ) : dbKey ? (
              <div className="flex items-center gap-2">
                <Input
                  type={dbKeyVisible ? "text" : "password"}
                  value={dbKey}
                  readOnly
                  className="font-mono text-sm flex-1"
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
                  onClick={() => copyToClipboard(dbKey)}
                >
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
            ) : (
              <Button variant="outline" onClick={loadDbKey}>
                <Eye className="h-4 w-4 mr-2" />
                Zobrazit klíč
              </Button>
            )}
          </CardContent>
        </Card>

        {/* Uzaverky Section */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Receipt className="h-4 w-4" />
              Uzávěrky ({uzaverkyBackups.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {backupsLoading ? (
              <div className="flex items-center gap-2 p-4">
                <Spinner className="h-4 w-4" />
                <span className="text-sm text-muted-foreground">Načítám uzávěrky...</span>
              </div>
            ) : uzaverkyBackups.length === 0 ? (
              <div className="p-4 text-center text-muted-foreground">
                Žádné uzávěrky
              </div>
            ) : (
              <ScrollArea className="h-[300px]">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Datum uzávěrky</TableHead>
                      <TableHead>Verze app</TableHead>
                      <TableHead>Pokladní</TableHead>
                      <TableHead>Tržba</TableHead>
                      <TableHead>Zisk</TableHead>
                      <TableHead>Nahráno</TableHead>
                      <TableHead>Velikost</TableHead>
                      <TableHead className="text-right">Akce</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {uzaverkyBackups.map((backup) => {
                      const closeDate = extractDateFromFilename(backup.file_name);
                      const meta = (backup.metadata_json || {}) as Record<string, unknown>;
                      const rz = Number(meta.real_zisk);
                      const cashier = resolveCashierName(meta);
                      const ver = resolveBackupAppVersion(backup);
                      return (
                        <TableRow key={backup.id}>
                          <TableCell className="font-medium">
                            <div className="flex items-center gap-2">
                              <Calendar className="h-4 w-4 text-muted-foreground" />
                              {closeDate ? new Date(closeDate).toLocaleDateString("cs-CZ") : backup.file_name}
                            </div>
                          </TableCell>
                          <TableCell>
                            <BranchAppVersion version={ver.app_version} inline />
                          </TableCell>
                          <TableCell className="text-muted-foreground text-sm">
                            {cashier ?? "—"}
                            {hasTillData(meta) && (
                              <span className="ml-1.5 text-xs text-emerald-600">· pokladna</span>
                            )}
                          </TableCell>
                          <TableCell className="font-medium text-green-500">
                            {meta.total_revenue != null ? formatCurrency(Number(meta.total_revenue)) : "—"}
                          </TableCell>
                          <TableCell className="font-medium text-emerald-500">
                            {Number.isFinite(rz) ? formatCurrency(rz) : "—"}
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {new Date(backup.uploaded_at).toLocaleString("cs-CZ")}
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {formatBytes(backup.size_bytes)}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-1">
                              <Button 
                                variant="ghost" 
                                size="sm"
                                onClick={() => handleViewBackup(backup)}
                              >
                                <Eye className="h-4 w-4 mr-1" />
                                Zobrazit
                              </Button>
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
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </ScrollArea>
            )}
          </CardContent>
        </Card>

        {/* Other Backups Section */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <HardDrive className="h-4 w-4" />
              Ostatní zálohy ({otherBackups.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {backupsLoading ? (
              <div className="flex items-center gap-2 p-4">
                <Spinner className="h-4 w-4" />
                <span className="text-sm text-muted-foreground">Načítám zálohy...</span>
              </div>
            ) : otherBackups.length === 0 ? (
              <div className="p-4 text-center text-muted-foreground">
                Žádné ostatní zálohy
              </div>
            ) : (
              <ScrollArea className="h-[300px]">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Typ</TableHead>
                      <TableHead>Soubor</TableHead>
                      <TableHead>Nahráno</TableHead>
                      <TableHead>Velikost</TableHead>
                      <TableHead className="text-right">Akce</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {otherBackups.map((backup) => (
                      <TableRow key={backup.id}>
                        <TableCell>
                          <Badge variant="outline">{backup.kind}</Badge>
                        </TableCell>
                        <TableCell className="font-mono text-xs truncate max-w-[200px]">
                          {backup.file_name}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {new Date(backup.uploaded_at).toLocaleString("cs-CZ")}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {formatBytes(backup.size_bytes)}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            {(backup.file_name.endsWith(".wsbak") || backup.file_name.endsWith(".db")) && (
                              <Button 
                                variant="ghost" 
                                size="sm"
                                onClick={() => handleViewBackup(backup)}
                              >
                                <Eye className="h-4 w-4 mr-1" />
                                Zobrazit
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
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </ScrollArea>
            )}
          </CardContent>
        </Card>

        {/* Nahlášené chyby a výpadky */}
        <BranchFaults licenseKey={session.licenseKey} branchId={branchId} />
      </div>

      <BackupDownloadDialog
        backup={downloadChoice}
        onOpenChange={(o) => { if (!o) setDownloadChoice(null); }}
      />

      {/* Backup Viewer Dialog */}
      <Dialog open={!!viewingBackup} onOpenChange={(open) => { if (!open) { setViewingBackup(null); setSelectedProdej(null); } }}>
        <DialogContent className="max-w-[98vw] sm:max-w-[98vw] w-full max-h-[95vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Database className="h-5 w-5" />
              {isUzaverkaBackup ? "Uzávěrka" : "Záloha"}: {viewingBackup?.file_name}
            </DialogTitle>
            <DialogDescription>
              {viewingBackup && new Date(viewingBackup.uploaded_at).toLocaleString("cs-CZ")}
            </DialogDescription>
          </DialogHeader>
          
          {isDecrypting ? (
            <div className="flex flex-col items-center justify-center py-12 gap-4">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="text-muted-foreground">Dešifruji a analyzuji data...</p>
            </div>
          ) : decryptError ? (
            <div className="flex flex-col items-center justify-center py-12 gap-4 text-destructive">
              <AlertTriangle className="h-8 w-8" />
              <p>Chyba: {decryptError}</p>
            </div>
          ) : decryptedData ? (
            isUzaverkaBackup ? (
              // Uzaverka Dialog Content
              <div className="space-y-4">
                {/* Stats Cards */}
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
                  <Card className="bg-secondary/50">
                    <CardContent className="p-3 flex items-center gap-2">
                      <ShoppingCart className="h-6 w-6 text-primary shrink-0" />
                      <div>
                        <p className="text-xl font-bold">{decryptedData.stats.totalSales}</p>
                        <p className="text-xs text-muted-foreground">Transakcí</p>
                      </div>
                    </CardContent>
                  </Card>
                  <Card className="bg-secondary/50">
                    <CardContent className="p-3 flex items-center gap-2">
                      <Receipt className="h-6 w-6 text-green-500 shrink-0" />
                      <div>
                        <p className="text-xl font-bold">{formatCurrency(decryptedData.stats.totalRevenue)}</p>
                        <p className="text-xs text-muted-foreground">Celkový výdělek</p>
                      </div>
                    </CardContent>
                  </Card>
                  <Card className="bg-secondary/50">
                    <CardContent className="p-3 flex items-center gap-2">
                      <Package className="h-6 w-6 text-blue-500 shrink-0" />
                      <div>
                        <p className="text-xl font-bold">
                          {decryptedData.uzaverky[0]?.total_items || decryptedData.uzaverky[0]?.payload_json?.total_items || decryptedData.polozky.reduce((sum, p) => sum + p.mnozstvi, 0)}
                        </p>
                        <p className="text-xs text-muted-foreground">Prodaných kusů</p>
                      </div>
                    </CardContent>
                  </Card>
                  <Card className="bg-secondary/50">
                    <CardContent className="p-3 flex items-center gap-2">
                      <Banknote className="h-6 w-6 text-emerald-500 shrink-0" />
                      <div>
                        <p className="text-xl font-bold">{formatCurrency(decryptedData.stats.totalCash)}</p>
                        <p className="text-xs text-muted-foreground">Hotovost</p>
                      </div>
                    </CardContent>
                  </Card>
                  <Card className="bg-secondary/50">
                    <CardContent className="p-3 flex items-center gap-2">
                      <QrCode className="h-6 w-6 text-purple-500 shrink-0" />
                      <div>
                        <p className="text-xl font-bold">{formatCurrency(decryptedData.stats.totalCard)}</p>
                        <p className="text-xs text-muted-foreground">QR platby</p>
                      </div>
                    </CardContent>
                  </Card>
                  <Card className="bg-secondary/50">
                    <CardContent className="p-3 flex items-center gap-2">
                      <TrendingUp className="h-6 w-6 text-emerald-400 shrink-0" />
                      <div>
                        <p className="text-xl font-bold">
                          {(() => {
                            const rz = Number((viewingBackup?.metadata_json as Record<string, unknown> | null)?.real_zisk);
                            return Number.isFinite(rz) ? formatCurrency(rz) : "—";
                          })()}
                        </p>
                        <p className="text-xs text-muted-foreground">Reálný zisk</p>
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

                <Tabs defaultValue="analyza">
                  <TabsList>
                    <TabsTrigger value="analyza" className="gap-2">
                      <BarChart3 className="h-4 w-4" />
                      Analýza
                    </TabsTrigger>
                    <TabsTrigger value="prodeje" className="gap-2">
                      <ShoppingCart className="h-4 w-4" />
                      Prodeje ({decryptedData.prodeje.length})
                    </TabsTrigger>
                  </TabsList>

                  <TabsContent value="analyza" className="mt-4">
                    <div className="grid md:grid-cols-2 gap-4">
                      {/* Top Products Analysis */}
                      <Card>
                        <CardHeader className="pb-2">
                          <CardTitle className="text-sm flex items-center gap-2">
                            <TrendingUp className="h-4 w-4 text-primary" />
                            Nejprodávanější produkty
                          </CardTitle>
                        </CardHeader>
                        <CardContent>
                          <div>
                            {(() => {
                              const payload = decryptedData.uzaverky[0]?.payload_json;
                              const perProduct = payload?.perProduct;
                              
                              if (perProduct && Object.keys(perProduct).length > 0) {
                                const sortedProducts = Object.entries(perProduct)
                                  .sort((a, b) => b[1] - a[1]);
                                
                                return (
                                  <div className="space-y-2">
                                    {sortedProducts.map(([name, qty], index) => (
                                      <div 
                                        key={name}
                                        className="flex items-center gap-3 p-2 rounded-lg bg-secondary/30"
                                      >
                                        <div className={`flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold ${
                                          index === 0 ? "bg-yellow-500 text-yellow-950" :
                                          index === 1 ? "bg-gray-300 text-gray-800" :
                                          index === 2 ? "bg-orange-400 text-orange-950" :
                                          "bg-muted text-muted-foreground"
                                        }`}>
                                          {index + 1}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                          <p className="text-sm font-medium truncate">{name}</p>
                                        </div>
                                        <Badge variant="secondary" className="shrink-0">
                                          {qty} ks
                                        </Badge>
                                      </div>
                                    ))}
                                  </div>
                                );
                              }
                              
                              const productCounts: Record<string, number> = {};
                              decryptedData.polozky.forEach(p => {
                                productCounts[p.nazev] = (productCounts[p.nazev] || 0) + p.mnozstvi;
                              });
                              const sortedProducts = Object.entries(productCounts)
                                .sort((a, b) => b[1] - a[1])
                                .slice(0, 10);

                              if (sortedProducts.length === 0) {
                                return (
                                  <p className="text-muted-foreground text-center py-8">
                                    Žádná data o produktech
                                  </p>
                                );
                              }

                              return (
                                <div className="space-y-2">
                                  {sortedProducts.map(([name, qty], index) => (
                                    <div 
                                      key={name}
                                      className="flex items-center gap-3 p-2 rounded-lg bg-secondary/30"
                                    >
                                      <div className={`flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold ${
                                        index === 0 ? "bg-yellow-500 text-yellow-950" :
                                        index === 1 ? "bg-gray-300 text-gray-800" :
                                        index === 2 ? "bg-orange-400 text-orange-950" :
                                        "bg-muted text-muted-foreground"
                                      }`}>
                                        {index + 1}
                                      </div>
                                      <div className="flex-1 min-w-0">
                                        <p className="text-sm font-medium truncate">{name}</p>
                                      </div>
                                      <Badge variant="secondary" className="shrink-0">
                                        {qty} ks
                                      </Badge>
                                    </div>
                                  ))}
                                </div>
                              );
                            })()}
                          </div>
                        </CardContent>
                      </Card>

                      {/* Summary Stats */}
                      <Card>
                        <CardHeader className="pb-2">
                          <CardTitle className="text-sm flex items-center gap-2">
                            <BarChart3 className="h-4 w-4 text-primary" />
                            Souhrn uzávěrky
                          </CardTitle>
                        </CardHeader>
                        <CardContent>
                          <div className="space-y-4">
                            {decryptedData.uzaverky[0] && (
                              <>
                                <div className="space-y-2">
                                  <div className="flex justify-between text-sm">
                                    <span className="text-muted-foreground">Datum uzávěrky:</span>
                                    <span className="font-medium">{formatBackupDateTime(decryptedData.uzaverky[0].close_date || decryptedData.uzaverky[0].datum)}</span>
                                  </div>
                                  {(() => {
                                    const cashier = resolveCashierName(viewingBackup?.metadata_json) ??
                                      resolveCashierName(decryptedData.uzaverky[0]);
                                    if (!cashier) return null;
                                    return (
                                      <div className="flex justify-between text-sm">
                                        <span className="text-muted-foreground">Pokladní:</span>
                                        <span className="font-medium">{cashier}</span>
                                      </div>
                                    );
                                  })()}
                                  <div className="flex justify-between text-sm">
                                    <span className="text-muted-foreground">Počet transakcí:</span>
                                    <span className="font-medium">{decryptedData.uzaverky[0].tx_count || decryptedData.uzaverky[0].payload_json?.tx_count || 0}</span>
                                  </div>
                                  <div className="flex justify-between text-sm">
                                    <span className="text-muted-foreground">Celkem prodaných kusů:</span>
                                    <span className="font-medium">{decryptedData.uzaverky[0].total_items || decryptedData.uzaverky[0].payload_json?.total_items || "-"}</span>
                                  </div>
                                </div>

                                <div className="h-px bg-border" />
                                
                                <div className="space-y-2">
                                  <div className="flex justify-between text-sm">
                                    <span className="text-muted-foreground flex items-center gap-2">
                                      <Banknote className="h-4 w-4" /> Hotovost:
                                    </span>
                                    <span className="font-medium text-emerald-500">
                                      {formatCurrency(decryptedData.stats.totalCash)}
                                    </span>
                                  </div>
                                  <div className="flex justify-between text-sm">
                                    <span className="text-muted-foreground flex items-center gap-2">
                                      <QrCode className="h-4 w-4" /> QR platby:
                                    </span>
                                    <span className="font-medium text-purple-500">
                                      {formatCurrency(decryptedData.stats.totalCard)}
                                    </span>
                                  </div>
                                </div>

                                <div className="h-px bg-border" />
                                
                                <div className="flex justify-between">
                                  <span className="font-semibold">Celkem:</span>
                                  <span className="font-bold text-lg text-green-500">
                                    {formatCurrency(decryptedData.stats.totalRevenue)}
                                  </span>
                                </div>

                                {decryptedData.stats.totalRevenue > 0 && (
                                  <div className="mt-4 space-y-2">
                                    <p className="text-xs text-muted-foreground">Podíl plateb:</p>
                                    <div className="flex h-4 rounded-full overflow-hidden">
                                      <div 
                                        className="bg-emerald-500 transition-all"
                                        style={{ width: `${(decryptedData.stats.totalCash / decryptedData.stats.totalRevenue) * 100}%` }}
                                      />
                                      <div 
                                        className="bg-purple-500 transition-all"
                                        style={{ width: `${(decryptedData.stats.totalCard / decryptedData.stats.totalRevenue) * 100}%` }}
                                      />
                                    </div>
                                    <div className="flex justify-between text-xs">
                                      <span className="text-emerald-500">
                                        Hotovost: {((decryptedData.stats.totalCash / decryptedData.stats.totalRevenue) * 100).toFixed(1)}%
                                      </span>
                                      <span className="text-purple-500">
                                        QR: {((decryptedData.stats.totalCard / decryptedData.stats.totalRevenue) * 100).toFixed(1)}%
                                      </span>
                                    </div>
                                  </div>
                                )}
                              </>
                            )}
                            {decryptedData.uzaverky.length === 0 && (
                              <p className="text-muted-foreground text-center py-8">
                                Žádná data o uzávěrce
                              </p>
                            )}
                          </div>
                        </CardContent>
                      </Card>
                    </div>
                  </TabsContent>
                  
                  <TabsContent value="prodeje" className="mt-4">
                    <div className="grid grid-cols-5 gap-4 items-start">
                      <div className="col-span-2 border rounded-lg">
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
                                    {formatPaymentType(prodej.platba_typ)}
                                  </Badge>
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                      
                      <div className="col-span-3 border rounded-lg p-6">
                        {selectedProdej ? (
                          <div className="space-y-4">
                            <div className="flex items-center justify-between">
                              <h4 className="font-semibold text-lg flex items-center gap-2">
                                <Package className="h-5 w-5" />
                                Položky dokladu #{selectedProdej.cislo_dokladu}
                              </h4>
                              <div className="text-right">
                                <Badge variant="outline" className="text-base px-3 py-1">{formatPaymentType(selectedProdej.platba_typ)}</Badge>
                                <p className="text-2xl font-bold text-green-500 mt-1">{formatCurrency(selectedProdej.celkem)}</p>
                              </div>
                            </div>
                            <TransactionStockMovementPanel
                              transaction={selectedProdej}
                              stockMovements={decryptedData.stockMovements}
                            />
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
                                Žádné položky nenalezeny
                              </p>
                            )}
                          </div>
                        ) : (
                          <div className="flex items-center justify-center min-h-[200px] text-muted-foreground">
                            <div className="text-center">
                              <Package className="h-12 w-12 mx-auto mb-2 opacity-30" />
                              <p>Klikněte na prodej pro zobrazení položek</p>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </TabsContent>
                </Tabs>
              </div>
            ) : (
              // Non-Uzaverka Dialog Content - Show all tables with summary
              <div className="flex-1 overflow-hidden">
                {/* Summary Cards - show record counts for visible tables */}
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
                                  // Special rendering for stock movements
                                  <div className="p-3 space-y-2">
                                    {tableData.rows.map((row, i) => {
                                      const qty = Number(row.qty || row.quantity || row.mnozstvi || 0);
                                      const isIncoming = qty > 0;
                                      const productName = String(row.product_name || row.name_snapshot || row.nazev || row.product_id || "Neznámý produkt");
                                      const reason = String(row.reason || row.duvod || row.type || "");
                                      const createdAt = String(row.created_at || row.datum || "");
                                      
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
                                  // Default table rendering
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
    </div>
  );
}
