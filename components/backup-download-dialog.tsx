"use client";

import { useState } from "react";
import { type Backup } from "@/lib/api";
import { downloadDecryptedDb, downloadEncryptedBackup } from "@/lib/download-backup";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/spinner";
import { Database, Lock, ChevronRight } from "lucide-react";

interface BackupDownloadDialogProps {
  backup: Backup | null;
  onOpenChange: (open: boolean) => void;
}

export function BackupDownloadDialog({ backup, onOpenChange }: BackupDownloadDialogProps) {
  const [busy, setBusy] = useState<null | "db" | "wsbak">(null);
  const [error, setError] = useState<string | null>(null);

  const run = async (which: "db" | "wsbak") => {
    if (!backup) return;
    setBusy(which);
    setError(null);
    try {
      if (which === "db") await downloadDecryptedDb(backup);
      else await downloadEncryptedBackup(backup);
      onOpenChange(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Stažení selhalo");
    } finally {
      setBusy(null);
    }
  };

  return (
    <Dialog open={!!backup} onOpenChange={(o) => { if (!busy) onOpenChange(o); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Stáhnout zálohu</DialogTitle>
          <DialogDescription className="truncate" title={backup?.file_name}>
            {backup?.file_name}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {/* Clean .db */}
          <button
            type="button"
            disabled={busy != null}
            onClick={() => run("db")}
            className="flex w-full items-center gap-3 rounded-lg border border-border bg-card p-4 text-left transition-colors hover:bg-secondary/50 disabled:opacity-60"
          >
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded bg-primary/10">
              {busy === "db" ? <Spinner className="h-5 w-5" /> : <Database className="h-5 w-5 text-primary" />}
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-medium">Stáhnout čistý soubor .db s daty</p>
              <p className="text-xs text-muted-foreground">
                Dešifrovaná SQLite databáze. Lze otevřít jakýmkoliv prohlížečem SQLite souborů.
              </p>
            </div>
            <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
          </button>

          {/* Encrypted .wsbak */}
          <button
            type="button"
            disabled={busy != null}
            onClick={() => run("wsbak")}
            className="flex w-full items-center gap-3 rounded-lg border border-border bg-card p-4 text-left transition-colors hover:bg-secondary/50 disabled:opacity-60"
          >
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded bg-primary/10">
              {busy === "wsbak" ? <Spinner className="h-5 w-5" /> : <Lock className="h-5 w-5 text-primary" />}
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-medium">Stáhnout zakódovaný soubor .wsbak</p>
              <p className="text-xs text-muted-foreground">
                Nečitelný, ale nikdo jiný se do něj nedostane (obsah zobrazíte na prodejně ve WellSale).
              </p>
            </div>
            <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
          </button>

          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
      </DialogContent>
    </Dialog>
  );
}
