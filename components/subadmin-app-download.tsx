"use client";

import { useEffect, useMemo, useState } from "react";
import useSWR from "swr";
import { getBranches, getReleases } from "@/lib/api";
import { pickWebDownloadRelease } from "@/lib/release-download";
import { downloadReleaseSetup } from "@/lib/download-release";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Download, Loader2, Package } from "lucide-react";
import { toast } from "sonner";

/** From easytill2/uzivatelska_prirucka.md — Požadavky na počítač */
const REQUIREMENTS: Array<{ label: string; min: string; rec: string }> = [
  {
    label: "Operační systém",
    min: "Windows 10 (64bit), aktuální aktualizace",
    rec: "Windows 11 (64bit)",
  },
  {
    label: "Procesor",
    min: "2jádrový x64, ~2 GHz (např. Intel Core i3 / AMD Athlon)",
    rec: "4jádrový x64 nebo lepší (Intel Core i5 / AMD Ryzen 5+)",
  },
  {
    label: "Paměť (RAM)",
    min: "4 GB",
    rec: "8 GB (ideálně 16 GB při současném běhu prohlížeče apod.)",
  },
  {
    label: "Úložiště",
    min: "~1 GB volného místa",
    rec: "SSD, alespoň 5–10 GB volných",
  },
  {
    label: "Grafika",
    min: "Integrovaná s ovladači Windows (DirectX 11)",
    rec: "Běžná kancelářská (integrovaná nebo dedikovaná)",
  },
  {
    label: "Displej",
    min: "1280 × 720",
    rec: "1920 × 1080 nebo vyšší",
  },
];

interface SubadminAppDownloadProps {
  licenseKey: string;
}

export function SubadminAppDownload({ licenseKey }: SubadminAppDownloadProps) {
  const { data, isLoading, error } = useSWR("subadmin-releases", getReleases, {
    revalidateOnFocus: false,
    dedupingInterval: 60_000,
  });
  const { data: branchesData } = useSWR(
    ["subadmin-download-branches", licenseKey],
    () => getBranches(licenseKey),
    { revalidateOnFocus: false }
  );

  const branches = useMemo(
    () => (branchesData?.branches || []).filter((b) => !b.archived_at),
    [branchesData]
  );

  const [branchId, setBranchId] = useState<string>("");
  useEffect(() => {
    if (!branches.length) return;
    setBranchId((prev) => {
      if (prev && branches.some((b) => String(b.id) === prev)) return prev;
      return String(branches[0].id);
    });
  }, [branches]);

  const selectedBranch = branches.find((b) => String(b.id) === branchId) || null;
  const forceVersion = selectedBranch?.update_force_version || null;
  const release = pickWebDownloadRelease(data?.releases, forceVersion);
  const [downloading, setDownloading] = useState(false);

  const handleDownload = async () => {
    if (!release) return;
    setDownloading(true);
    try {
      await downloadReleaseSetup(release);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Stahování selhalo";
      console.error("[WellSale download]", e);
      toast.error(msg);
    } finally {
      setDownloading(false);
    }
  };

  const pinnedMissing = Boolean(forceVersion) && !release;

  return (
    <Card className="border-border bg-card">
      <CardHeader className="pb-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <Package className="h-4 w-4" />
              Stáhnout WellSale
            </CardTitle>
            <CardDescription>
              Instalátor pro Windows (.exe) — oficiální verze ke stažení
            </CardDescription>
          </div>
          <Button
            onClick={() => void handleDownload()}
            disabled={!release || downloading || isLoading || pinnedMissing}
            className="gap-2 shrink-0"
          >
            {downloading || isLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Download className="h-4 w-4" />
            )}
            Stáhnout
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {error && (
          <p className="text-sm text-destructive">
            Nepodařilo se načíst dostupné verze.
          </p>
        )}

        {branches.length > 0 && (
          <div className="space-y-2 max-w-sm">
            <p className="text-sm text-muted-foreground">Pobočka</p>
            <Select value={branchId} onValueChange={setBranchId}>
              <SelectTrigger>
                <SelectValue placeholder="Vyberte pobočku" />
              </SelectTrigger>
              <SelectContent>
                {branches.map((b) => (
                  <SelectItem key={b.id} value={String(b.id)}>
                    {b.code ? `${b.code} — ${b.name}` : b.name}
                    {b.update_force_version ? ` → ${b.update_force_version}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {!error && isLoading && (
          <p className="text-sm text-muted-foreground">Zjišťuji verzi…</p>
        )}
        {!error && !isLoading && release && (
          <p className="text-sm text-muted-foreground">
            Verze{" "}
            <span className="font-mono font-semibold text-foreground">
              {release.version}
            </span>
            {forceVersion ? (
              <span className="ml-2 text-xs">(vynucená pro pobočku)</span>
            ) : (
              <span className="ml-2 text-xs">(webová nabídka)</span>
            )}
          </p>
        )}
        {!error && !isLoading && pinnedMissing && (
          <p className="text-sm text-destructive">
            Pro pobočku je nastavená verze {forceVersion}, ale v releases chybí.
          </p>
        )}
        {!error && !isLoading && !release && !pinnedMissing && (
          <p className="text-sm text-muted-foreground">
            Momentálně není k dispozici žádná verze ke stažení. Zkuste to později.
          </p>
        )}

        <div className="space-y-2 border-t border-border pt-4 text-xs text-muted-foreground">
          <p className="font-medium text-muted-foreground">Systémové požadavky</p>
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-border/60">
                  <th className="py-1.5 pr-3 font-medium"> </th>
                  <th className="py-1.5 pr-3 font-medium">Minimální</th>
                  <th className="py-1.5 font-medium">Doporučené</th>
                </tr>
              </thead>
              <tbody>
                {REQUIREMENTS.map((row) => (
                  <tr key={row.label} className="border-b border-border/40 align-top last:border-0">
                    <td className="py-1.5 pr-3 whitespace-nowrap font-medium text-muted-foreground/90">
                      {row.label}
                    </td>
                    <td className="py-1.5 pr-3">{row.min}</td>
                    <td className="py-1.5">{row.rec}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p>
            Internet je potřeba při první aktivaci licence a alespoň jednou za 25 dní
            (ověření licence). Denní prodej, sklad a uzávěrky fungují i bez připojení;
            online je hlavně pro licenci, aktualizace a cloud.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
