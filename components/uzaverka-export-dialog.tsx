"use client";

import { useState } from "react";
import type { Backup, Branch } from "@/lib/api";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { FileSpreadsheet, FileText, BookOpen, Loader2 } from "lucide-react";
import { toast } from "sonner";

const ADMIN_KEY =
  process.env.NEXT_PUBLIC_ADMIN_KEY || "SUPER_SECRET_ADMIN_NKEY";

export type UzaverkaExportKind = "pdf" | "excel" | "evidence";

interface UzaverkaExportDialogProps {
  backup: Backup | null;
  branch?: Branch | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const OPTIONS: Array<{
  kind: UzaverkaExportKind;
  title: string;
  description: string;
  fileHint: string;
  icon: typeof FileText;
}> = [
  {
    kind: "pdf",
    title: "Souhrn dne (PDF)",
    description: "Stejný výstup jako uzaverka-souhrn na pokladně — tržby + souhrn produktů.",
    fileHint: "uzaverka-souhrn-YYYY-MM-DD.pdf",
    icon: FileText,
  },
  {
    kind: "excel",
    title: "Uzávěrka (Excel)",
    description: "Přehled, prodeje po položkách a souhrn skladových pohybů.",
    fileHint: "uzaverka-YYYY-MM-DD.xlsx",
    icon: FileSpreadsheet,
  },
  {
    kind: "evidence",
    title: "Evidenční kniha (Excel)",
    description: "Denní deník PML 1:1 s pokladnou — každý příjem/prodej zvlášť, země a dodací list.",
    fileHint: "evidence-YYYY-MM-DD.xlsx",
    icon: BookOpen,
  },
];

function triggerBlobDownload(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function fileNameFromDisposition(header: string | null, fallback: string): string {
  if (!header) return fallback;
  const m = header.match(/filename="([^"]+)"/i) || header.match(/filename=([^;]+)/i);
  return m?.[1]?.trim() || fallback;
}

export function UzaverkaExportDialog({
  backup,
  branch,
  open,
  onOpenChange,
}: UzaverkaExportDialogProps) {
  const [busy, setBusy] = useState<UzaverkaExportKind | null>(null);

  const runExport = async (kind: UzaverkaExportKind) => {
    if (!backup) return;
    setBusy(kind);
    try {
      const res = await fetch("/api/admin/backups/export", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-admin-key": ADMIN_KEY,
        },
        body: JSON.stringify({
          id: backup.id,
          kind,
          shopName: branch?.name || branch?.code || "WellSale",
          ico: branch?.ico || "",
          receiptPrefix: "TX",
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || err.error || `Export selhal (${res.status})`);
      }

      const blob = await res.blob();
      const fallback =
        kind === "pdf"
          ? "uzaverka-souhrn.pdf"
          : kind === "evidence"
            ? "evidence.xlsx"
            : "uzaverka.xlsx";
      const name = fileNameFromDisposition(res.headers.get("Content-Disposition"), fallback);
      triggerBlobDownload(blob, name);
      toast.success("Export hotov");
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Export selhal");
    } finally {
      setBusy(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Export uzávěrky</DialogTitle>
          <DialogDescription>
            Stejné soubory jako z pokladny (WellSale POS). Vyberte jeden typ exportu.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-2 py-2">
          {OPTIONS.map((opt) => {
            const Icon = opt.icon;
            const loading = busy === opt.kind;
            return (
              <Button
                key={opt.kind}
                variant="outline"
                className="h-auto justify-start gap-3 px-3 py-3 text-left whitespace-normal"
                disabled={!!busy}
                onClick={() => void runExport(opt.kind)}
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded bg-primary/10">
                  {loading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Icon className="h-4 w-4 text-primary" />
                  )}
                </span>
                <span className="min-w-0">
                  <span className="block font-medium">{opt.title}</span>
                  <span className="block text-xs text-muted-foreground font-normal">
                    {opt.description}
                  </span>
                  <span className="mt-0.5 block font-mono text-[10px] text-muted-foreground/80">
                    {opt.fileHint}
                  </span>
                </span>
              </Button>
            );
          })}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={!!busy}>
            Zavřít
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
