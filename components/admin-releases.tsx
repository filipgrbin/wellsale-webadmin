"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import useSWR from "swr";
import {
  getReleases,
  getReleaseUploadUrls,
  createRelease,
  updateRelease,
  deleteRelease,
  uploadReleaseFileToS3,
  type AppRelease,
  type ReleaseChannel,
} from "@/lib/api";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Progress } from "@/components/ui/progress";
import {
  Rocket,
  RefreshCw,
  Upload,
  Trash2,
  Pencil,
  FileArchive,
  CheckCircle2,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const VERSION_RE = /^\d+\.\d+\.\d+([.-][\w.]+)?$/;

function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  return d.toLocaleString("cs-CZ", { hour12: false });
}

function isAllowedReleaseFile(name: string): boolean {
  const n = name.split(/[/\\]/).pop() || "";
  if (n === "latest.yml" || n === "latest.yaml") return true;
  return /\.(yml|yaml|exe|blockmap)$/i.test(n);
}

function normalizeFileName(name: string): string {
  const n = name.split(/[/\\]/).pop() || name;
  return n === "latest.yaml" ? "latest.yml" : n;
}

export function AdminReleases() {
  const { data, mutate, isLoading } = useSWR("admin-releases", getReleases);
  const releases = data?.releases ?? [];

  const [uploadOpen, setUploadOpen] = useState(false);
  const [editRelease, setEditRelease] = useState<AppRelease | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<AppRelease | null>(null);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Rocket className="h-6 w-6" />
            App releases
          </h2>
          <p className="text-muted-foreground">
            Nahrání a správa Windows updater balíčků (latest.yml + Setup.exe + .blockmap)
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => mutate()} disabled={isLoading}>
            <RefreshCw className={cn("h-4 w-4 mr-2", isLoading && "animate-spin")} />
            Obnovit
          </Button>
          <Button size="sm" onClick={() => setUploadOpen(true)}>
            <Upload className="h-4 w-4 mr-2" />
            Nový release
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Publikované verze</CardTitle>
          <CardDescription>
            Aktivní release v kanálu je ten, který dostávají pokladny (rollout %). Forced = povinný update.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded-lg border border-border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>Verze</TableHead>
                  <TableHead>Kanál</TableHead>
                  <TableHead>Rollout</TableHead>
                  <TableHead>Stav</TableHead>
                  <TableHead>S3</TableHead>
                  <TableHead>Publikováno</TableHead>
                  <TableHead className="w-[120px]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={7} className="py-10 text-center text-muted-foreground">
                      Načítám releases…
                    </TableCell>
                  </TableRow>
                ) : releases.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="py-10 text-center text-muted-foreground">
                      Zatím žádný release — nahrajte první balíček
                    </TableCell>
                  </TableRow>
                ) : (
                  releases.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell>
                        <div className="font-mono font-semibold">{r.version}</div>
                        {r.release_notes && (
                          <p className="text-xs text-muted-foreground line-clamp-1 max-w-[220px]" title={r.release_notes}>
                            {r.release_notes}
                          </p>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{r.channel}</Badge>
                      </TableCell>
                      <TableCell className="tabular-nums">{r.rollout_percent}%</TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {r.active ? (
                            <Badge>Active</Badge>
                          ) : (
                            <Badge variant="secondary">Inactive</Badge>
                          )}
                          {r.forced && <Badge variant="destructive">Forced</Badge>}
                        </div>
                      </TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground max-w-[180px] truncate" title={r.s3_prefix}>
                        {r.s3_prefix}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                        {formatDate(r.published_at || r.created_at)}
                      </TableCell>
                      <TableCell>
                        <div className="flex justify-end gap-1">
                          <Button variant="ghost" size="icon" onClick={() => setEditRelease(r)} title="Upravit">
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="text-destructive"
                            onClick={() => setDeleteTarget(r)}
                            title="Smazat"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <UploadReleaseDialog
        open={uploadOpen}
        onOpenChange={setUploadOpen}
        onDone={() => {
          setUploadOpen(false);
          void mutate();
        }}
      />

      <EditReleaseDialog
        release={editRelease}
        onOpenChange={(o) => {
          if (!o) setEditRelease(null);
        }}
        onDone={() => {
          setEditRelease(null);
          void mutate();
        }}
      />

      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Smazat release {deleteTarget?.version}?</AlertDialogTitle>
            <AlertDialogDescription>
              Odstraní záznam z DB a soubory ze S3 prefixu{" "}
              <code className="text-xs">{deleteTarget?.s3_prefix}</code>. Tuto akci nelze vrátit.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Zrušit</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={async () => {
                if (!deleteTarget) return;
                try {
                  const res = await deleteRelease({ id: deleteTarget.id, deleteS3: true });
                  toast.success(
                    `Smazáno ${res.deleted.version} (${res.deleted.deletedObjects} S3 objektů)`
                  );
                  setDeleteTarget(null);
                  void mutate();
                } catch (e) {
                  toast.error(e instanceof Error ? e.message : "Smazání selhalo");
                }
              }}
            >
              Smazat
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function UploadReleaseDialog({
  open,
  onOpenChange,
  onDone,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onDone: () => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [version, setVersion] = useState("");
  const [channel, setChannel] = useState<ReleaseChannel>("stable");
  const [rollout, setRollout] = useState("100");
  const [forced, setForced] = useState(false);
  const [active, setActive] = useState(true);
  const [notes, setNotes] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<Record<string, number>>({});
  const [step, setStep] = useState<string | null>(null);

  const reset = () => {
    setVersion("");
    setChannel("stable");
    setRollout("100");
    setForced(false);
    setActive(true);
    setNotes("");
    setFiles([]);
    setBusy(false);
    setProgress({});
    setStep(null);
    if (fileRef.current) fileRef.current.value = "";
  };

  const hasLatestYml = useMemo(
    () => files.some((f) => normalizeFileName(f.name) === "latest.yml"),
    [files]
  );
  const hasExe = useMemo(() => files.some((f) => /\.exe$/i.test(f.name)), [files]);

  const onPickFiles = (list: FileList | null) => {
    if (!list?.length) return;
    const next: File[] = [];
    const rejected: string[] = [];
    for (const f of Array.from(list)) {
      if (!isAllowedReleaseFile(f.name)) {
        rejected.push(f.name);
        continue;
      }
      next.push(f);
    }
    if (rejected.length) {
      toast.error(`Nepovolené soubory: ${rejected.join(", ")}`);
    }
    setFiles((prev) => {
      const map = new Map(prev.map((f) => [normalizeFileName(f.name), f]));
      for (const f of next) map.set(normalizeFileName(f.name), f);
      return [...map.values()];
    });
  };

  const handleUpload = async () => {
    const v = version.trim();
    if (!VERSION_RE.test(v)) {
      toast.error("Neplatná verze (očekáváno např. 1.5.9)");
      return;
    }
    if (!files.length) {
      toast.error("Vyberte soubory release (alespoň latest.yml a .exe)");
      return;
    }
    if (!hasLatestYml) {
      toast.error("Chybí latest.yml — updater bez něj nefunguje");
      return;
    }

    setBusy(true);
    try {
      setStep("Žádám upload URL…");
      const urls = await getReleaseUploadUrls({
        version: v,
        files: files.map((f) => normalizeFileName(f.name)),
      });

      const byName = new Map(files.map((f) => [normalizeFileName(f.name), f]));
      for (const slot of urls.uploads) {
        const file = byName.get(slot.fileName);
        if (!file) throw new Error(`Chybí lokální soubor ${slot.fileName}`);
        setStep(`Nahrávám ${slot.fileName}…`);
        await uploadReleaseFileToS3(slot, file, (pct) => {
          setProgress((p) => ({ ...p, [slot.fileName]: pct }));
        });
        setProgress((p) => ({ ...p, [slot.fileName]: 100 }));
      }

      setStep("Vytvářím záznam v DB…");
      await createRelease({
        version: v,
        channel,
        rollout_percent: Math.max(0, Math.min(100, Number(rollout) || 0)),
        forced,
        active,
        release_notes: notes.trim() || null,
        verifyS3: true,
      });

      toast.success(`Release ${v} publikován`);
      reset();
      onDone();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload selhal");
    } finally {
      setBusy(false);
      setStep(null);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (busy) return;
        if (!o) reset();
        onOpenChange(o);
      }}
    >
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Nový app release</DialogTitle>
          <DialogDescription>
            Nahrajte artefakty z electron-builder (win): <code>latest.yml</code>, Setup.exe a
            .blockmap. Pak se vytvoří záznam v DB.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          <div className="grid gap-2">
            <Label htmlFor="rel-version">Verze</Label>
            <Input
              id="rel-version"
              placeholder="1.5.9"
              className="font-mono"
              value={version}
              onChange={(e) => setVersion(e.target.value.trim())}
              disabled={busy}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-2">
              <Label>Kanál</Label>
              <Select
                value={channel}
                onValueChange={(v) => setChannel(v as ReleaseChannel)}
                disabled={busy}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="stable">stable</SelectItem>
                  <SelectItem value="beta">beta</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="rel-rollout">Rollout %</Label>
              <Input
                id="rel-rollout"
                type="number"
                min={0}
                max={100}
                value={rollout}
                onChange={(e) => setRollout(e.target.value)}
                disabled={busy}
              />
            </div>
          </div>

          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <Switch checked={active} onCheckedChange={setActive} disabled={busy} id="rel-active" />
              <Label htmlFor="rel-active">Active (publikovat hned)</Label>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                checked={forced}
                onCheckedChange={(c) => setForced(c === true)}
                disabled={busy}
                id="rel-forced"
              />
              <Label htmlFor="rel-forced">Forced update</Label>
            </div>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="rel-notes">Release notes</Label>
            <Textarea
              id="rel-notes"
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              disabled={busy}
              placeholder="Co je nového…"
            />
          </div>

          <div className="grid gap-2">
            <Label>Soubory</Label>
            <div
              className={cn(
                "rounded-lg border border-dashed border-border p-4 text-center cursor-pointer hover:bg-secondary/30 transition-colors",
                busy && "pointer-events-none opacity-60"
              )}
              onClick={() => fileRef.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                onPickFiles(e.dataTransfer.files);
              }}
            >
              <FileArchive className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
              <p className="text-sm font-medium">Přetáhněte nebo vyberte soubory</p>
              <p className="text-xs text-muted-foreground mt-1">.yml · .exe · .blockmap</p>
              <input
                ref={fileRef}
                type="file"
                multiple
                accept=".yml,.yaml,.exe,.blockmap"
                className="hidden"
                onChange={(e) => onPickFiles(e.target.files)}
              />
            </div>
            {files.length > 0 && (
              <ul className="space-y-2 text-sm">
                {files.map((f) => {
                  const name = normalizeFileName(f.name);
                  const pct = progress[name];
                  return (
                    <li key={name} className="rounded border border-border px-3 py-2">
                      <div className="flex justify-between gap-2">
                        <span className="font-mono text-xs truncate">{name}</span>
                        <span className="text-xs text-muted-foreground shrink-0">
                          {(f.size / 1024 / 1024).toFixed(1)} MB
                          {pct != null ? ` · ${pct}%` : ""}
                        </span>
                      </div>
                      {pct != null && <Progress value={pct} className="h-1.5 mt-2" />}
                    </li>
                  );
                })}
              </ul>
            )}
            <div className="flex flex-wrap gap-2 text-xs">
              <Badge variant={hasLatestYml ? "default" : "secondary"} className="gap-1">
                {hasLatestYml && <CheckCircle2 className="h-3 w-3" />}
                latest.yml
              </Badge>
              <Badge variant={hasExe ? "default" : "secondary"} className="gap-1">
                {hasExe && <CheckCircle2 className="h-3 w-3" />}
                .exe
              </Badge>
            </div>
          </div>

          {step && <p className="text-sm text-muted-foreground">{step}</p>}
        </div>

        <DialogFooter>
          <Button variant="outline" disabled={busy} onClick={() => onOpenChange(false)}>
            Zrušit
          </Button>
          <Button disabled={busy || !version || !files.length} onClick={() => void handleUpload()}>
            {busy ? "Nahrávám…" : "Nahrát a publikovat"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EditReleaseDialog({
  release,
  onOpenChange,
  onDone,
}: {
  release: AppRelease | null;
  onOpenChange: (o: boolean) => void;
  onDone: () => void;
}) {
  const [version, setVersion] = useState("");
  const [channel, setChannel] = useState<ReleaseChannel>("stable");
  const [rollout, setRollout] = useState("0");
  const [forced, setForced] = useState(false);
  const [active, setActive] = useState(true);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const open = !!release;

  useEffect(() => {
    if (!release) return;
    setVersion(release.version);
    setChannel(release.channel === "beta" ? "beta" : "stable");
    setRollout(String(release.rollout_percent ?? 0));
    setForced(!!release.forced);
    setActive(!!release.active);
    setNotes(release.release_notes || "");
  }, [release]);

  const save = async () => {
    if (!release) return;
    const v = version.trim();
    if (!VERSION_RE.test(v)) {
      toast.error("Neplatná verze (očekáváno např. 1.5.9)");
      return;
    }
    setSaving(true);
    try {
      const renamed = v !== release.version;
      await updateRelease({
        id: release.id,
        version: renamed ? release.version : v,
        ...(renamed ? { new_version: v } : {}),
        channel,
        rollout_percent: Math.max(0, Math.min(100, Number(rollout) || 0)),
        forced,
        active,
        release_notes: notes.trim() || null,
      });
      toast.success(`Release ${v} uložen`);
      onDone();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Uložení selhalo");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Upravit release</DialogTitle>
          <DialogDescription>
            Prefix S3: <code className="text-xs">{release?.s3_prefix}</code>
            {version.trim() && version.trim() !== release?.version && (
              <span className="block mt-1 text-amber-600 dark:text-amber-400">
                Přejmenování verze mění jen záznam v DB — S3 soubory zůstanou pod starým prefixem,
                pokud to backend nepřesune.
              </span>
            )}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-2">
          <div className="grid gap-2">
            <Label htmlFor="edit-version">Název / verze</Label>
            <Input
              id="edit-version"
              className="font-mono"
              placeholder="1.5.9"
              value={version}
              onChange={(e) => setVersion(e.target.value.trim())}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-2">
              <Label>Kanál</Label>
              <Select value={channel} onValueChange={(v) => setChannel(v as ReleaseChannel)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="stable">stable</SelectItem>
                  <SelectItem value="beta">beta</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label>Rollout %</Label>
              <Input
                type="number"
                min={0}
                max={100}
                value={rollout}
                onChange={(e) => setRollout(e.target.value)}
              />
            </div>
          </div>
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <Switch checked={active} onCheckedChange={setActive} id="edit-active" />
              <Label htmlFor="edit-active">Active</Label>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                checked={forced}
                onCheckedChange={(c) => setForced(c === true)}
                id="edit-forced"
              />
              <Label htmlFor="edit-forced">Forced</Label>
            </div>
          </div>
          <div className="grid gap-2">
            <Label>Release notes</Label>
            <Textarea rows={4} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Zrušit
          </Button>
          <Button disabled={saving || !version.trim()} onClick={() => void save()}>
            {saving ? "Ukládám…" : "Uložit"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
