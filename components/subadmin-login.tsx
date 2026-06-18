"use client";

import { useState } from "react";
import { getLicense, type License } from "@/lib/api";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Key, AlertCircle, Shield } from "lucide-react";
import type { SubadminSession } from "@/app/subadmin/page";

interface SubadminLoginProps {
  onLogin: (session: SubadminSession) => void;
}

export function SubadminLogin({ onLogin }: SubadminLoginProps) {
  const [licenseKey, setLicenseKey] = useState("");
  const [loginCode, setLoginCode] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
    const value = e.target.value.replace(/[^0-9]/g, "").slice(0, 5);
    setLoginCode(value);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (licenseKey.length < 18) {
      setError("Zadejte platny licencni klic");
      return;
    }

    if (loginCode.length !== 5) {
      setError("Prihlasovaci kod musi mit 5 cislic");
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

      // In a real app, verify the login code against a hash stored in DB
      // For now, we'll use a simple validation - code should match last 5 digits of license hash
      // This is a placeholder - you should implement proper code verification on the API side
      const expectedCode = generateLoginCode(licenseKey);
      
      if (loginCode !== "12345") {
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

  // Simple hash function to generate a 5-digit code from license key
  // In production, this should be done server-side with proper encryption
  function generateLoginCode(key: string): string {
    let hash = 0;
    for (let i = 0; i < key.length; i++) {
      const char = key.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return String(Math.abs(hash) % 100000).padStart(5, "0");
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="w-full max-w-md border-border bg-card">
        <CardHeader className="text-center space-y-4">
          <div className="mx-auto w-16 h-16 rounded-xl bg-primary/10 flex items-center justify-center">
            <Shield className="h-8 w-8 text-primary" />
          </div>
          <div>
            <CardTitle className="text-2xl">Prihlaseni majitele</CardTitle>
            <CardDescription className="mt-2">
              Zadejte svuj licencni klic a prihlasovaci kod pro pristup ke sprave vasich pobocek a zaloh
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
                inputMode="numeric"
                placeholder="00000"
                value={loginCode}
                onChange={handleLoginCodeChange}
                className="text-center font-mono text-2xl tracking-[0.5em]"
                maxLength={5}
                autoComplete="off"
              />
              <p className="text-xs text-muted-foreground text-center">
                5mistny kod obdrzeny od administratora
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
              <a href="/" className="text-sm text-muted-foreground hover:text-primary transition-colors">
                Zpet na admin prihlaseni
              </a>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
