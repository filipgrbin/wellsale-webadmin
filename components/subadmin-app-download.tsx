"use client";

import { useState } from "react";
import useSWR from "swr";
import { getReleases } from "@/lib/api";
import { pickWebDownloadRelease } from "@/lib/release-download";
import { downloadReleaseSetupViaPresign } from "@/lib/download-release";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
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

export function SubadminAppDownload() {
  const { data, isLoading, error } = useSWR("subadmin-releases", getReleases, {
    revalidateOnFocus: false,
    dedupingInterval: 60_000,
  });
  const release = pickWebDownloadRelease(data?.releases);
  const [downloading, setDownloading] = useState(false);

  const handleDownload = async () => {
    if (!release) return;
    setDownloading(true);
    try {
      // Presigned S3 URL (same as zálohy) — navigate to S3, no file through Next
      await downloadReleaseSetupViaPresign(release);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Stahování selhalo");
    } finally {
      setDownloading(false);
    }
  };

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
            disabled={!release || downloading || isLoading}
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
        {!error && isLoading && (
          <p className="text-sm text-muted-foreground">Zjišťuji verzi…</p>
        )}
        {!error && !isLoading && release && (
          <p className="text-sm text-muted-foreground">
            Verze{" "}
            <span className="font-mono font-semibold text-foreground">
              {release.version}
            </span>
          </p>
        )}
        {!error && !isLoading && !release && (
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
