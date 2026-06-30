"use client";

import { useState, type ReactNode } from "react";
import useSWR from "swr";
import { getFaults, getFault, type FaultLog } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  AlertTriangle,
  ClipboardList,
  FileText,
  CalendarClock,
  User,
  CheckCircle2,
  ShieldCheck,
} from "lucide-react";

interface BranchFaultsProps {
  licenseKey: string;
  branchId: number;
}

interface ParsedMainLine {
  time: string;
  level: string;
  scope: string;
  message: string;
}

// Main/updater log lines (log_lines) look like:
//   [2026-06-30T10:14:58.123Z] [ERROR] [printer] tisk selhal: timeout
function parseMainLine(line: string): ParsedMainLine {
  const full = line.match(/^\s*\[([^\]]+)\]\s*\[([^\]]*)\]\s*\[([^\]]*)\]\s*([\s\S]*)$/);
  if (full) {
    return { time: full[1].trim(), level: full[2].trim(), scope: full[3].trim(), message: full[4].trim() };
  }
  const lead = line.match(/^\s*\[([^\]]+)\]\s*([\s\S]*)$/);
  if (lead) {
    return { time: lead[1].trim(), level: "", scope: "", message: lead[2].trim() };
  }
  return { time: "", level: "", scope: "", message: line };
}

function fmt(date: string | null | undefined): string {
  if (!date) return "—";
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return String(date);
  return d.toLocaleString("cs-CZ");
}

function levelClass(level: string): string {
  const l = level.toUpperCase();
  if (l.startsWith("ERR")) return "bg-red-500/10 text-red-500 border-red-500/20";
  if (l.startsWith("WARN")) return "bg-warning/10 text-warning border-warning/30";
  if (l.startsWith("DEBUG")) return "bg-muted text-muted-foreground";
  return "bg-blue-500/10 text-blue-500 border-blue-500/20";
}

export function BranchFaults({ licenseKey, branchId }: BranchFaultsProps) {
  const { data, isLoading, error } = useSWR(
    ["branch-faults", licenseKey, branchId],
    () => getFaults({ licenseKey, branchId })
  );
  // The selected list row gives metadata instantly; attachments are fetched.
  const [selected, setSelected] = useState<FaultLog | null>(null);

  const { data: detailData, isLoading: detailLoading } = useSWR(
    selected ? ["fault-detail", selected.id] : null,
    () => getFault(selected!.id)
  );

  const faults = data?.faults || [];
  const detail = detailData?.fault;
  const auditRows = detail?.audit_rows ?? [];
  const logLines = detail?.log_lines ?? [];

  return (
    <>
      <Card className="border-border bg-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <AlertTriangle className="h-5 w-5 text-warning" />
            Nahlášené chyby a výpadky ({faults.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center gap-2 py-6">
              <Spinner className="h-4 w-4" />
              <span className="text-sm text-muted-foreground">Načítám chyby...</span>
            </div>
          ) : error ? (
            <p className="py-6 text-center text-sm text-destructive">
              Chyby se nepodařilo načíst
            </p>
          ) : (
            <div className="rounded-lg border border-border">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead>Nahlášeno</TableHead>
                    <TableHead>Výpadek (od – do)</TableHead>
                    <TableHead>Důvod</TableHead>
                    <TableHead>Nahlásil</TableHead>
                    <TableHead className="w-[90px]">Stav</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {faults.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                        Žádné nahlášené chyby
                      </TableCell>
                    </TableRow>
                  ) : (
                    faults.map((f) => (
                      <TableRow
                        key={f.id}
                        className="cursor-pointer"
                        onClick={() => setSelected(f)}
                      >
                        <TableCell className="whitespace-nowrap text-sm">{fmt(f.created_at)}</TableCell>
                        <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                          {f.issue_start || f.issue_end
                            ? `${fmt(f.issue_start)} – ${f.issue_end ? fmt(f.issue_end) : "trvá"}`
                            : "—"}
                        </TableCell>
                        <TableCell className="max-w-[320px] truncate" title={f.reason}>
                          {f.reason || "—"}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {f.reported_by || "—"}
                        </TableCell>
                        <TableCell>
                          {f.resolution ? (
                            <Badge className="bg-green-500/10 text-green-500 border-green-500/20">
                              Vyřešeno
                            </Badge>
                          ) : (
                            <Badge variant="secondary">Otevřeno</Badge>
                          )}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!selected} onOpenChange={(o) => { if (!o) setSelected(null); }}>
        <DialogContent className="max-w-[98vw] sm:max-w-5xl w-full max-h-[95vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-warning" />
              Detail nahlášené chyby #{selected?.id}
            </DialogTitle>
            <DialogDescription>
              Nahlášeno {fmt(selected?.created_at)}
            </DialogDescription>
          </DialogHeader>

          {selected && (
            <div className="flex-1 overflow-hidden flex flex-col gap-4">
              {/* Metadata (from the list row, available instantly) */}
              <div className="grid gap-3 sm:grid-cols-2">
                <Detail icon={<CalendarClock className="h-4 w-4 text-primary" />} label="Začátek výpadku" value={fmt(selected.issue_start)} />
                <Detail icon={<CalendarClock className="h-4 w-4 text-primary" />} label="Konec výpadku" value={selected.issue_end ? fmt(selected.issue_end) : "Trvá / neznámo"} />
                <Detail icon={<User className="h-4 w-4 text-primary" />} label="Nahlásil" value={selected.reported_by || "—"} />
                <Detail icon={<FileText className="h-4 w-4 text-primary" />} label="Lokální ID" value={selected.local_id != null ? String(selected.local_id) : "—"} />
              </div>

              <div className="rounded-lg border border-border p-3">
                <p className="mb-1 text-xs font-medium text-muted-foreground">Důvod / popis</p>
                <p className="whitespace-pre-wrap text-sm">{selected.reason || "—"}</p>
              </div>

              {selected.resolution && (
                <div className="rounded-lg border border-green-500/20 bg-green-500/5 p-3">
                  <p className="mb-1 flex items-center gap-1.5 text-xs font-medium text-green-500">
                    <CheckCircle2 className="h-3.5 w-3.5" /> Řešení
                  </p>
                  <p className="whitespace-pre-wrap text-sm">{selected.resolution}</p>
                </div>
              )}

              {(selected.signature || selected.cert_thumbprint) && (
                <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-secondary/30 p-3 text-xs">
                  <ShieldCheck className="h-4 w-4 shrink-0 text-primary" />
                  <span className="font-medium">Elektronicky podepsáno</span>
                  {selected.cert_thumbprint && (
                    <span className="font-mono text-muted-foreground" title={selected.cert_thumbprint}>
                      cert: {selected.cert_thumbprint.slice(0, 16)}{selected.cert_thumbprint.length > 16 ? "…" : ""}
                    </span>
                  )}
                </div>
              )}

              {/* Two attached logs (fetched from /faults/get) */}
              <Tabs defaultValue="audit" className="flex-1 overflow-hidden flex flex-col">
                <TabsList>
                  <TabsTrigger value="audit" className="gap-2">
                    <ClipboardList className="h-4 w-4" />
                    Akce uživatelů ({auditRows.length})
                  </TabsTrigger>
                  <TabsTrigger value="main" className="gap-2">
                    <FileText className="h-4 w-4" />
                    Chyby programu ({logLines.length})
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="audit" className="mt-3 flex-1 overflow-hidden">
                  <ScrollArea className="h-[360px] rounded-lg border border-border">
                    {detailLoading ? (
                      <div className="flex items-center gap-2 p-4">
                        <Spinner className="h-4 w-4" />
                        <span className="text-sm text-muted-foreground">Načítám přílohu...</span>
                      </div>
                    ) : (
                      <Table>
                        <TableHeader>
                          <TableRow className="hover:bg-transparent">
                            <TableHead className="whitespace-nowrap">Datum a čas</TableHead>
                            <TableHead>Kategorie</TableHead>
                            <TableHead>Aktér</TableHead>
                            <TableHead>Akce</TableHead>
                            <TableHead>Detaily</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {auditRows.length === 0 ? (
                            <TableRow>
                              <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                                Žádné přiložené záznamy akcí
                              </TableCell>
                            </TableRow>
                          ) : (
                            auditRows.map((r, i) => (
                              <TableRow key={r.id ?? i}>
                                <TableCell className="whitespace-nowrap text-xs">{fmt(r.created_at)}</TableCell>
                                <TableCell>
                                  {r.category ? (
                                    <Badge variant="outline" className="text-[10px]">{r.category}</Badge>
                                  ) : "—"}
                                </TableCell>
                                <TableCell className="text-xs">{r.actor || "—"}</TableCell>
                                <TableCell className="text-xs font-medium">{r.action || "—"}</TableCell>
                                <TableCell className="max-w-[360px] truncate text-xs" title={r.details || ""}>
                                  {r.details || "—"}
                                </TableCell>
                              </TableRow>
                            ))
                          )}
                        </TableBody>
                      </Table>
                    )}
                  </ScrollArea>
                </TabsContent>

                <TabsContent value="main" className="mt-3 flex-1 overflow-hidden">
                  <ScrollArea className="h-[360px] rounded-lg border border-border">
                    {detailLoading ? (
                      <div className="flex items-center gap-2 p-4">
                        <Spinner className="h-4 w-4" />
                        <span className="text-sm text-muted-foreground">Načítám přílohu...</span>
                      </div>
                    ) : logLines.length === 0 ? (
                      <p className="py-8 text-center text-muted-foreground">
                        Žádné přiložené záznamy chyb
                      </p>
                    ) : (
                      <div className="divide-y divide-border font-mono text-xs">
                        {logLines.map((line, i) => {
                          const p = parseMainLine(line);
                          return (
                            <div key={i} className="flex items-start gap-3 px-3 py-1.5">
                              <span className="shrink-0 whitespace-nowrap text-muted-foreground">
                                {p.time ? fmt(p.time) : "—"}
                              </span>
                              {p.level && (
                                <Badge variant="outline" className={`shrink-0 text-[10px] ${levelClass(p.level)}`}>
                                  {p.level}
                                </Badge>
                              )}
                              {p.scope && (
                                <span className="shrink-0 text-muted-foreground">[{p.scope}]</span>
                              )}
                              <span className="break-all">{p.message}</span>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </ScrollArea>
                </TabsContent>
              </Tabs>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

function Detail({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-start gap-3 rounded-lg border border-border p-3">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded bg-primary/10">
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="truncate text-sm font-medium" title={value}>{value}</p>
      </div>
    </div>
  );
}
