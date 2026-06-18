"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import { 
  getBranches, 
  updateBranch, 
  type Branch,
} from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Spinner } from "@/components/ui/spinner";
import {
  Edit2,
  Archive,
  ArchiveRestore,
  Search,
  Building2,
  ChevronRight,
} from "lucide-react";

interface SubadminBranchesProps {
  licenseKey: string;
}

export function SubadminBranches({ licenseKey }: SubadminBranchesProps) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [editingBranch, setEditingBranch] = useState<Branch | null>(null);
  const [editForm, setEditForm] = useState({ name: "", code: "", address: "" });
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { data, error, isLoading, mutate } = useSWR(
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

  const handleEdit = (branch: Branch, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingBranch(branch);
    setEditForm({
      name: branch.name,
      code: branch.code,
      address: branch.address || "",
    });
  };

  const handleSaveEdit = async () => {
    if (!editingBranch) return;
    setIsSubmitting(true);
    try {
      await updateBranch(editingBranch.id, {
        name: editForm.name,
        code: editForm.code,
        address: editForm.address || null,
      });
      await mutate();
      setEditingBranch(null);
    } catch (err) {
      console.error("Failed to update branch:", err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleToggleArchive = async (branch: Branch, e: React.MouseEvent) => {
    e.stopPropagation();
    setIsSubmitting(true);
    try {
      await updateBranch(branch.id, {
        archived_at: branch.archived_at ? null : new Date().toISOString(),
      });
      await mutate();
    } catch (err) {
      console.error("Failed to toggle archive:", err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleBranchClick = (branch: Branch) => {
    router.push(`/subadmin/branch/${branch.id}`);
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
    <>
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
                    <div className="flex items-center gap-4">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-semibold">{branch.name}</span>
                          <code className="text-xs bg-secondary px-2 py-0.5 rounded">
                            {branch.code}
                          </code>
                          {branch.archived_at ? (
                            <Badge variant="secondary">Archivováno</Badge>
                          ) : (
                            <Badge className="bg-green-500/10 text-green-500 border-green-500/20">Aktivní</Badge>
                          )}
                        </div>
                        {branch.address && (
                          <p className="text-sm text-muted-foreground mt-0.5">{branch.address}</p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={(e) => handleEdit(branch, e)}
                        disabled={isSubmitting}
                      >
                        <Edit2 className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={(e) => handleToggleArchive(branch, e)}
                        disabled={isSubmitting}
                      >
                        {branch.archived_at ? (
                          <ArchiveRestore className="h-4 w-4" />
                        ) : (
                          <Archive className="h-4 w-4" />
                        )}
                      </Button>
                      <ChevronRight className="h-5 w-5 text-muted-foreground" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Edit Dialog */}
      <Dialog open={!!editingBranch} onOpenChange={() => setEditingBranch(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Upravit pobočku</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="name">Název</Label>
              <Input
                id="name"
                value={editForm.name}
                onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="code">Kód</Label>
              <Input
                id="code"
                value={editForm.code}
                onChange={(e) => setEditForm({ ...editForm, code: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="address">Adresa</Label>
              <Textarea
                id="address"
                value={editForm.address}
                onChange={(e) => setEditForm({ ...editForm, address: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingBranch(null)}>
              Zrušit
            </Button>
            <Button onClick={handleSaveEdit} disabled={isSubmitting}>
              {isSubmitting && <Spinner className="h-4 w-4 mr-2" />}
              Uložit
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
