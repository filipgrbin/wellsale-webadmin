"use client";

import { useState } from "react";
import useSWR from "swr";
import { getReleases } from "@/lib/api";
import { pickWebDownloadRelease } from "@/lib/release-download";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Download, Loader2, Package } from "lucide-react";
import { toast } from "sonner";

export function SubadminAppDownload() {
  const { data, isLoading, error } = useSWR("subadmin-releases", getReleases, {
    revalidateOnFocus: false,
    dedupingInterval: 60_000,
  });
  const release = pickWebDownloadRelease(data?.releases);
  const [downloading, setDownloading] = useState(false);

  const handleDownload = () => {
    if (!release) return;
    setDownloading(true);
    try {
      // Full navigation → Next 302 → S3 (no buffering through the app)
      window.location.href = `/api/admin/releases/download?id=${release.id}`;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Stahování selhalo");
      setDownloading(false);
    }
    // Keep spinner briefly; navigation usually unloads the page
    window.setTimeout(() => setDownloading(false), 4000);
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
            onClick={handleDownload}
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
      <CardContent>
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
      </CardContent>
    </Card>
  );
}
