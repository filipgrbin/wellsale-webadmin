"use client";

import { useState, type ReactNode } from "react";
import useSWR from "swr";
import {
  getBackups,
  deleteBackup,
  getBranchDbKey,
  getMachines,
  type Branch,
  type Backup,
} from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
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
  ArrowLeft,
  Building2,
  KeyRound,
  Eye,
  EyeOff,
  Copy,
  Download,
  Trash2,
  Monitor,
  Fingerprint,
  MapPin,
  Calendar,
  AlertTriangle,
  Smartphone,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { cs } from "date-fns/locale";
import { BranchFaults } from "@/components/branch-faults";
import { BackupDownloadDialog } from "@/components/backup-download-dialog";
import { BranchAppVersion } from "@/components/branch-app-version";
import { resolveBackupAppVersion } from "@/lib/branch-app-version";

function formatDate(date: string | null) {
  if (!date) return "—";
  return formatDistanceToNow(new Date(date), { addSuffix: true, locale: cs });
}

function formatBytes(bytes: number): string {
  if (!bytes) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("cs-CZ", {
    style: "currency",
    currency: "CZK",
    maximumFractionDigits: 0,
  }).format(amount);
}

function metaNumber(meta: unknown, key: string): number {
  return Number((meta as Record<string, unknown> | null)?.[key]);
}

function Info({ label, value, icon }: { label: string; value: string; icon: ReactNode }) {
  return (
    <div className="flex items-start gap-3">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded bg-primary/10">
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-sm text-muted-foreground">{label}</p>
        <p className="font-medium truncate">{value}</p>
      </div>
    </div>
  );
}

interface AdminBranchDetailProps {
  branch: Branch;
  onBack: () => void;
}

export function AdminBranchDetail({ branch, onBack }: AdminBranchDetailProps) {
  const { data: backupsData, mutate: mutateBackups } = useSWR(
    ["admin-branch-backups", branch.id],
    () => getBackups({ licenseKey: branch.license_key, branchId: branch.id, limit: 200 })
  );
  const { data: machinesData } = useSWR(
    ["admin-branch-machines", branch.license_key],
    () => getMachines(branch.license_key)
  );

  const [dbKey, setDbKey] = useState<string | null>(null);
  const [dbKeyVisible, setDbKeyVisible] = useState(false);
  const [dbKeyLoading, setDbKeyLoading] = useState(false);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [downloadChoice, setDownloadChoice] = useState<Backup | null>(null);

  const backups = backupsData?.backups || [];
  const machines = (machinesData?.machines || []).filter(
    (m) => String(m.branch_id) === String(branch.id)
  );

  const copy = (t: string) => navigator.clipboard.writeText(t);

  const loadDbKey = async () => {
    if (dbKey) {
      setDbKeyVisible((v) => !v);
      return;
    }
    setDbKeyLoading(true);
    try {
      const r = await getBranchDbKey(branch.id);
      if (r.ok) {
        setDbKey(r.dbKey);
        setDbKeyVisible(true);
      }
    } catch (e) {
      console.error("Failed to load DB key:", e);
    } finally {
      setDbKeyLoading(false);
    }
  };

  const handleDelete = async () => {
    if (deleteId == null) return;
    setIsDeleting(true);
    try {
      await deleteBackup(deleteId);
      mutateBackups();
      setDeleteId(null);
    } catch (e) {
      alert(e instanceof Error ? e.message : "Chyba při mazání");
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={onBack}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
            <Building2 className="h-6 w-6 text-primary" />
            {branch.name}
            <code className="rounded bg-secondary px-2 py-0.5 text-sm font-normal">{branch.code}</code>
            {branch.archived_at && <Badge variant="secondary">Archivováno</Badge>}
          </h2>
          <p className="font-mono text-xs text-muted-foreground">
            {branch.license_key} · #{branch.id}
          </p>
        </div>
      </div>

      <Card className="border-border bg-card">
        <CardHeader>
          <CardTitle className="text-lg">Informace o pobočce</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Info label="Adresa" value={branch.address || "—"} icon={<MapPin className="h-4 w-4 text-primary" />} />
          <Info
            label="IČO / DIČ"
            value={`${branch.ico || "—"} / ${branch.dic || "—"}`}
            icon={<Building2 className="h-4 w-4 text-primary" />}
          />
          <div className="flex items-start gap-3">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded bg-primary/10">
              <Fingerprint className="h-4 w-4 text-primary" />
            </div>
            <div className="min-w-0">
              <p className="text-sm text-muted-foreground">HWID</p>
              {branch.hwid ? (
                <p className="truncate font-mono text-xs" title={branch.hwid}>{branch.hwid}</p>
              ) : (
                <p className="font-medium">nenavázáno</p>
              )}
              {branch.hwid_bound_at && (
                <p className="text-xs text-muted-foreground">navázáno {formatDate(branch.hwid_bound_at)}</p>
              )}
            </div>
          </div>
          <Info label="Vytvořeno" value={formatDate(branch.created_at)} icon={<Calendar className="h-4 w-4 text-primary" />} />
          <div className="flex items-start gap-3">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded bg-primary/10">
              <Smartphone className="h-4 w-4 text-primary" />
            </div>
            <div className="min-w-0">
              <p className="text-sm text-muted-foreground">Verze aplikace</p>
              <BranchAppVersion version={branch.app_version} seenAt={branch.app_version_seen_at} />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="border-border bg-card">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <KeyRound className="h-4 w-4" />
            Šifrovací klíč (DB Key)
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-start gap-3 rounded-lg border border-warning/30 bg-warning/10 p-3">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
            <p className="text-xs text-muted-foreground">
              Vysoce citlivé. <strong className="text-foreground">Nikdy nesdílejte.</strong>
            </p>
          </div>
          {dbKey && dbKeyVisible ? (
            <div className="flex items-center gap-2">
              <Input readOnly value={dbKey} className="font-mono text-sm" />
              <Button variant="outline" size="icon" onClick={() => setDbKeyVisible(false)}>
                <EyeOff className="h-4 w-4" />
              </Button>
              <Button variant="outline" size="icon" onClick={() => copy(dbKey)}>
                <Copy className="h-4 w-4" />
              </Button>
            </div>
          ) : (
            <Button variant="outline" onClick={loadDbKey} disabled={dbKeyLoading}>
              {dbKeyLoading ? <Spinner className="mr-2 h-4 w-4" /> : <Eye className="mr-2 h-4 w-4" />}
              Zobrazit klíč
            </Button>
          )}
        </CardContent>
      </Card>

      <Card className="border-border bg-card">
        <CardHeader>
          <CardTitle className="text-lg">Zálohy ({backups.length})</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="rounded-lg border border-border">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>Soubor</TableHead>
                  <TableHead>Typ</TableHead>
                  <TableHead>Verze app</TableHead>
                  <TableHead>Tržba</TableHead>
                  <TableHead>Zisk</TableHead>
                  <TableHead>Velikost</TableHead>
                  <TableHead>Nahráno</TableHead>
                  <TableHead className="w-[100px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {backups.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="py-8 text-center text-muted-foreground">
                      Žádné zálohy
                    </TableCell>
                  </TableRow>
                ) : (
                  backups.map((b) => {
                    const ver = resolveBackupAppVersion(b, new Map([[branch.id, branch]]));
                    return (
                    <TableRow key={b.id}>
                      <TableCell className="max-w-[240px] truncate font-mono text-xs" title={b.file_name}>
                        {b.file_name}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{b.kind}</Badge>
                      </TableCell>
                      <TableCell>
                        <BranchAppVersion version={ver.app_version} seenAt={ver.app_version_seen_at} />
                      </TableCell>
                      <TableCell className="text-green-500">
                        {Number.isFinite(metaNumber(b.metadata_json, "total_revenue"))
                          ? formatCurrency(metaNumber(b.metadata_json, "total_revenue"))
                          : "—"}
                      </TableCell>
                      <TableCell className="text-emerald-500">
                        {Number.isFinite(metaNumber(b.metadata_json, "real_zisk"))
                          ? formatCurrency(metaNumber(b.metadata_json, "real_zisk"))
                          : "—"}
                      </TableCell>
                      <TableCell className="text-muted-foreground">{formatBytes(b.size_bytes)}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {new Date(b.uploaded_at).toLocaleString("cs-CZ")}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => setDownloadChoice(b)}
                          >
                            <Download className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-destructive"
                            onClick={() => setDeleteId(b.id)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Card className="border-border bg-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Monitor className="h-4 w-4" />
            Stroje ({machines.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {machines.length === 0 ? (
            <p className="text-sm text-muted-foreground">Žádné stroje na této pobočce</p>
          ) : (
            <div className="space-y-2">
              {machines.map((m) => (
                <div key={m.id} className="flex items-center justify-between rounded-lg border border-border p-3">
                  <div className="min-w-0">
                    <p className="font-medium">{m.hostname || "—"}</p>
                    <p className="truncate font-mono text-xs text-muted-foreground">{m.install_id}</p>
                  </div>
                  <p className="shrink-0 text-xs text-muted-foreground">{formatDate(m.last_seen_at)}</p>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <BranchFaults licenseKey={branch.license_key} branchId={branch.id} />

      <BackupDownloadDialog
        backup={downloadChoice}
        onOpenChange={(o) => { if (!o) setDownloadChoice(null); }}
      />

      <Dialog open={deleteId != null} onOpenChange={(o) => { if (!o) setDeleteId(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Smazat zálohu</DialogTitle>
            <DialogDescription>
              Opravdu smazat tuto zálohu? Smaže se z databáze i z úložiště (S3).
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteId(null)}>
              Zrušit
            </Button>
            <Button variant="destructive" onClick={handleDelete} disabled={isDeleting}>
              {isDeleting ? "Mažu..." : "Smazat"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
