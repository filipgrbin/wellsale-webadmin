"use client";

import { useState, useEffect } from "react";
import { getLicense, type License } from "@/lib/api";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Key, AlertCircle, Shield } from "lucide-react";
import type { SubadminSession } from "@/lib/subadmin-session";

interface SubadminLoginProps {
  onLogin: (session: SubadminSession) => void;
}

// Strict license format: XXXX-XXXX-XXXX-XXX (4-4-4-3, A-Z / 0-9).
const LICENSE_RE = /^[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{3}$/;

export function SubadminLogin({ onLogin }: SubadminLoginProps) {
  const [licenseKey, setLicenseKey] = useState("");
  const [loginCode, setLoginCode] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Prefill the license from ?license=… — but only if it is EXACTLY in the
  // valid format. Anything malformed is ignored (no tampering via the URL).
  useEffect(() => {
    const fromUrl = (new URLSearchParams(window.location.search).get("license") || "")
      .toUpperCase()
      .trim();
    if (LICENSE_RE.test(fromUrl)) {
      setLicenseKey(fromUrl);
    }
  }, []);

  const formatLicenseKey = (value: string) => {
    // Remove all non-alphanumeric characters
    const clean = value.toUpperCase().replace(/[^A-Z0-9]/g, "");
    // Add dashes in the format XXXX-XXXX-XXXX-XXX
    const parts = [];
    if (clean.length > 0) parts.push(clean.slice(0, 4));
    if (clean.length > 4) parts.push(clean.slice(4, 8));
    if (clean.length > 8) parts.push(clean.slice(8, 12));
    if (clean.length > 12) parts.push(clean.slice(12, 15));
    return parts.join("-");
  };

  const handleLicenseKeyChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const formatted = formatLicenseKey(e.target.value);
    if (formatted.length <= 18) {
      setLicenseKey(formatted);
    }
  };

  const handleLoginCodeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    // login_code can be alphanumeric (e.g. an 8-char hex code), not just 5 digits.
    const value = e.target.value.replace(/[^a-zA-Z0-9]/g, "").slice(0, 64);
    setLoginCode(value);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // Block login for anything outside the strict format (no tampering).
    if (!LICENSE_RE.test(licenseKey.toUpperCase())) {
      setError("Zadejte platny licencni klic ve formatu XXXX-XXXX-XXXX-XXX");
      return;
    }

    if (!loginCode) {
      setError("Zadejte prihlasovaci kod");
      return;
    }

    setIsLoading(true);

    try {
      const result = await getLicense(licenseKey);
      
      if (!result.ok || !result.license) {
        setError("Licencni klic nebyl nalezen");
        return;
      }

      const license = result.license;

      if (license.revoked) {
        setError("Tato licence byla revokovaná");
        return;
      }

      // Match the backend's assertLicenseActive: a temporary license past its
      // valid_until is inactive, so the subadmin can't log in either.
      if (
        license.license_type === "temporary" &&
        license.valid_until &&
        new Date(license.valid_until) < new Date()
      ) {
        setError("Platnost licence vypršela");
        return;
      }

      // Validate against the license's stored login_code (case-insensitive).
      const expected = (license.login_code ?? "").trim().toLowerCase();
      if (!expected || loginCode.trim().toLowerCase() !== expected) {
        setError("Neplatny prihlasovaci kod");
        return;
      }

      onLogin({
        licenseKey: license.license_key,
        ownerName: license.owner_name,
        ownerEmail: license.owner_email,
        loginCode,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Chyba pri prihlaseni");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="w-full max-w-md border-border bg-card">
        <CardHeader className="text-center space-y-4">
          <div className="mx-auto w-16 h-16 rounded-xl bg-primary/10 flex items-center justify-center">
            <Shield className="h-8 w-8 text-primary" />
          </div>
          <div>
            <CardTitle className="text-2xl">WellSale Webadministrace</CardTitle>
            <CardDescription className="mt-2">
              Přihlášení majitele licence — správa poboček a záloh
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            {error && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <div className="space-y-2">
              <Label htmlFor="licenseKey">Licencni klic</Label>
              <div className="relative">
                <Key className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="licenseKey"
                  placeholder="XXXX-XXXX-XXXX-XXX"
                  value={licenseKey}
                  onChange={handleLicenseKeyChange}
                  className="pl-10 font-mono tracking-wider"
                  autoComplete="off"
                />
              </div>
              <p className="text-xs text-muted-foreground">
                Format: XXXX-XXXX-XXXX-XXX
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="loginCode">Prihlasovaci kod</Label>
              <Input
                id="loginCode"
                type="text"
                placeholder="kod od administratora"
                value={loginCode}
                onChange={handleLoginCodeChange}
                className="text-center font-mono text-xl tracking-widest"
                maxLength={64}
                autoComplete="off"
              />
              <p className="text-xs text-muted-foreground text-center">
                Kod obdrzeny od administratora
              </p>
            </div>

            <Button type="submit" className="w-full" disabled={isLoading}>
              {isLoading ? (
                <>
                  <span className="animate-spin mr-2">&#9696;</span>
                  Overuji...
                </>
              ) : (
                "Prihlasit se"
              )}
            </Button>

            <div className="text-center">
              <a href="/login" className="text-sm text-muted-foreground hover:text-primary transition-colors">
                Zpět na WellSale Admin Panel
              </a>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
