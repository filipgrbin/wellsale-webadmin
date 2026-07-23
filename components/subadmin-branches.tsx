"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import { getBranches, type Branch } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import {
  Search,
  Building2,
  ChevronRight,
  Smartphone,
} from "lucide-react";
import { BranchAppVersion } from "@/components/branch-app-version";

interface SubadminBranchesProps {
  licenseKey: string;
}

export function SubadminBranches({ licenseKey }: SubadminBranchesProps) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [showArchived, setShowArchived] = useState(false);

  const { data, error, isLoading } = useSWR(
    ["subadmin-branches", licenseKey, showArchived],
    () => getBranches(licenseKey, showArchived)
  );

  const branches = data?.branches || [];
  const filtered = branches.filter(
    (b) =>
      b.name.toLowerCase().includes(search.toLowerCase()) ||
      b.code.toLowerCase().includes(search.toLowerCase()) ||
      (b.address && b.address.toLowerCase().includes(search.toLowerCase()))
  );

  const handleBranchClick = (branch: Branch) => {
    router.push(`/branch/${branch.id}`);
  };

  if (isLoading) {
    return (
      <Card className="border-border bg-card">
        <CardContent className="flex items-center justify-center py-12">
          <Spinner className="h-6 w-6" />
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="border-border bg-card">
        <CardContent className="py-12 text-center text-destructive">
          Chyba při načítání poboček
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-border bg-card">
      <CardHeader className="pb-4">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <Building2 className="h-5 w-5" />
            Vaše pobočky ({filtered.length})
          </CardTitle>
          <div className="flex items-center gap-2">
            <div className="relative flex-1 sm:flex-none">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Hledat..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 w-full sm:w-64"
              />
            </div>
            <Button
              variant={showArchived ? "secondary" : "outline"}
              size="sm"
              onClick={() => setShowArchived(!showArchived)}
            >
              {showArchived ? "Skrýt archiv" : "Zobrazit archiv"}
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {filtered.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            Žádné pobočky k zobrazení
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map((branch) => (
              <div
                key={branch.id}
                className="border rounded-lg bg-card overflow-hidden cursor-pointer hover:bg-secondary/50 transition-colors"
                onClick={() => handleBranchClick(branch)}
              >
                <div className="flex items-center justify-between p-4">
                  <div className="flex items-center gap-4 min-w-0">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold">{branch.name}</span>
                        <code className="text-xs bg-secondary px-2 py-0.5 rounded">
                          {branch.code}
                        </code>
                        {branch.archived_at ? (
                          <Badge variant="secondary">Archivováno</Badge>
                        ) : (
                          <Badge className="bg-green-500/10 text-green-500 border-green-500/20">
                            Aktivní
                          </Badge>
                        )}
                      </div>
                      {branch.address && (
                        <p className="text-sm text-muted-foreground mt-0.5">{branch.address}</p>
                      )}
                      <div className="mt-1.5 flex items-center gap-2 text-xs text-muted-foreground">
                        <Smartphone className="h-3.5 w-3.5 shrink-0" />
                        <BranchAppVersion
                          version={branch.app_version}
                          seenAt={branch.app_version_seen_at}
                        />
                      </div>
                    </div>
                  </div>
                  <ChevronRight className="h-5 w-5 text-muted-foreground shrink-0" />
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
