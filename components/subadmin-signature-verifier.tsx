"use client";

import { useCallback, useRef, useState } from "react";
import type { SignatureVerifyResult } from "@/lib/signature-verify-types";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import {
  Upload,
  FileCheck2,
  FileWarning,
  ShieldCheck,
  ShieldAlert,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";

const ACCEPT = ".pdf,.xml,.xades,.p7s,.p7m,.pkcs7,.pem,application/pdf,text/xml,application/pkcs7-signature";

export function SubadminSignatureVerifier() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [result, setResult] = useState<SignatureVerifyResult | null>(null);

  const verifyFile = useCallback(async (file: File) => {
    setLoading(true);
    setError(null);
    setResult(null);
    setFileName(file.name);

    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/signature/verify", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.error || "Ověření selhalo");
      }
      setResult(data.result as SignatureVerifyResult);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Chyba");
    } finally {
      setLoading(false);
    }
  }, []);

  const onFiles = (files: FileList | null) => {
    const file = files?.[0];
    if (file) void verifyFile(file);
  };

  const clear = () => {
    setResult(null);
    setError(null);
    setFileName(null);
    if (inputRef.current) inputRef.current.value = "";
  };

  return (
    <Card className="border-border bg-card">
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <ShieldCheck className="h-5 w-5 text-primary" />
          Kontrola elektronického podpisu
        </CardTitle>
        <CardDescription>
          Nahrajte PDF, XML (XAdES) nebo P7S/PKCS7 — zobrazí se, zda je dokument podepsaný, kdo
          podepsal, typ podpisu a další metadata certifikátu.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") inputRef.current?.click();
          }}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            onFiles(e.dataTransfer.files);
          }}
          onClick={() => inputRef.current?.click()}
          className={cn(
            "flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed p-8 cursor-pointer transition-colors",
            dragOver
              ? "border-primary bg-primary/5"
              : "border-border hover:border-primary/50 hover:bg-secondary/30"
          )}
        >
          <Upload className="h-10 w-10 text-muted-foreground" />
          <div className="text-center">
            <p className="font-medium">Přetáhněte soubor sem nebo klikněte pro výběr</p>
            <p className="text-sm text-muted-foreground mt-1">PDF · XML · P7S · PKCS7</p>
          </div>
          <input
            ref={inputRef}
            type="file"
            accept={ACCEPT}
            className="hidden"
            onChange={(e) => onFiles(e.target.files)}
          />
        </div>

        {loading && (
          <div className="flex items-center justify-center gap-2 py-6 text-muted-foreground">
            <Spinner className="h-5 w-5" />
            <span>Analyzuji podpis…</span>
          </div>
        )}

        {error && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
            {error}
          </div>
        )}

        {result && !loading && (
          <div className="rounded-lg border border-border bg-secondary/20 p-4 space-y-4">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="font-medium truncate">{fileName}</p>
                <p className="text-sm text-muted-foreground">{result.formatLabel}</p>
              </div>
              <Button variant="ghost" size="icon" className="shrink-0" onClick={clear}>
                <X className="h-4 w-4" />
              </Button>
            </div>

            <div className="flex flex-wrap gap-2">
              <Badge variant={result.signed ? "default" : "secondary"} className="gap-1">
                {result.signed ? (
                  <FileCheck2 className="h-3 w-3" />
                ) : (
                  <FileWarning className="h-3 w-3" />
                )}
                {result.signed ? "Podepsáno" : "Bez podpisu"}
              </Badge>
              {result.cryptographicallyValid === true && (
                <Badge variant="outline" className="gap-1 text-emerald-600 border-emerald-500/30">
                  <ShieldCheck className="h-3 w-3" />
                  Krypto OK
                </Badge>
              )}
              {result.cryptographicallyValid === false && (
                <Badge variant="outline" className="gap-1 text-amber-600 border-amber-500/30">
                  <ShieldAlert className="h-3 w-3" />
                  Krypto neověřeno
                </Badge>
              )}
              {result.subFilter && (
                <Badge variant="outline" className="font-mono text-xs">
                  {result.subFilter}
                </Badge>
              )}
            </div>

            {result.signers.length > 0 && (
              <div className="space-y-3">
                <p className="text-sm font-medium">Podepisující</p>
                {result.signers.map((s, i) => (
                  <div
                    key={i}
                    className="rounded-lg border border-border bg-background/80 p-3 text-sm space-y-1.5"
                  >
                    <p className="font-semibold">{s.commonName || "Neznámý subjekt"}</p>
                    {s.organization && (
                      <p className="text-muted-foreground">{s.organization}</p>
                    )}
                    {s.email && <p className="text-muted-foreground">{s.email}</p>}
                    {s.signedAt && (
                      <p>
                        <span className="text-muted-foreground">Čas podpisu: </span>
                        {s.signedAt}
                      </p>
                    )}
                    {s.issuer && (
                      <p className="text-xs text-muted-foreground break-words">
                        Vydavatel: {s.issuer}
                      </p>
                    )}
                    {s.notBefore && s.notAfter && (
                      <p className="text-xs text-muted-foreground">
                        Platnost certifikátu: {s.notBefore} — {s.notAfter}
                      </p>
                    )}
                    {s.thumbprintSha256 && (
                      <p className="text-xs font-mono break-all text-muted-foreground">
                        SHA-256: {s.thumbprintSha256}
                      </p>
                    )}
                    {s.thumbprintSha1 && (
                      <p className="text-xs font-mono break-all text-muted-foreground">
                        SHA-1: {s.thumbprintSha1}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}

            {result.details.length > 0 && (
              <ul className="text-xs text-muted-foreground space-y-1 list-disc pl-4">
                {result.details.map((d, i) => (
                  <li key={i}>{d}</li>
                ))}
              </ul>
            )}

            {result.warnings.map((w, i) => (
              <p key={i} className="text-xs text-amber-600 dark:text-amber-400">
                {w}
              </p>
            ))}
            {result.errors.map((e, i) => (
              <p key={i} className="text-xs text-destructive">
                {e}
              </p>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
