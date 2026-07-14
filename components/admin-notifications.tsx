"use client";

import { useState } from "react";
import useSWR from "swr";
import {
  getNotifications,
  makeNotification,
  deleteNotification,
  getLicenses,
  getBranches,
  type Notification,
  type NotificationPriority,
} from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Bell, Send, Trash2, RefreshCw } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { cs } from "date-fns/locale";
import { toast } from "sonner";

type TargetType = "all" | "license" | "branch";

const priorityLabels: Record<NotificationPriority, string> = {
  low: "Nízká",
  medium: "Střední",
  high: "Vysoká",
  immediate: "Okamžitá",
};

const priorityVariants: Record<NotificationPriority, "secondary" | "default" | "destructive" | "outline"> = {
  low: "secondary",
  medium: "default",
  high: "destructive",
  immediate: "destructive",
};

function targetLabel(n: Notification): string {
  let scope: string;
  if (n.branch_id) {
    scope = `Pobočka ${n.branch_name || n.branch_code || `#${n.branch_id}`}`;
  } else if (n.license_key) {
    scope = `Licence ${n.license_key.slice(0, 12)}…`;
  } else {
    scope = "Všechny pokladny";
  }
  return n.admin_only ? `Admin · ${scope}` : scope;
}

export function AdminNotifications() {
  const { data, mutate, isLoading } = useSWR("admin-notifications", () => getNotifications());
  const { data: licensesData } = useSWR("licenses", getLicenses);
  const { data: branchesData } = useSWR("all-branches", () => getBranches());

  const [adminOnly, setAdminOnly] = useState(false);
  const [targetType, setTargetType] = useState<TargetType>("all");
  const [licenseKey, setLicenseKey] = useState("");
  const [selectedBranchIds, setSelectedBranchIds] = useState<Set<number>>(new Set());
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [priority, setPriority] = useState<NotificationPriority>("medium");
  const [expiresAt, setExpiresAt] = useState("");
  const [sending, setSending] = useState(false);
  const [deleteId, setDeleteId] = useState<number | null>(null);

  const branches = branchesData?.branches ?? [];
  const branchesForLicense = licenseKey
    ? branches.filter((b) => b.license_key === licenseKey && !b.archived_at)
    : branches.filter((b) => !b.archived_at);

  const handleAdminOnlyChange = (checked: boolean) => {
    setAdminOnly(checked);
    if (checked && targetType === "all") {
      setTargetType("license");
    }
  };

  const handleTargetChange = (v: TargetType) => {
    setTargetType(v);
    setLicenseKey("");
    setSelectedBranchIds(new Set());
  };

  const toggleBranch = (id: number) => {
    setSelectedBranchIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSend = async () => {
    if (!title.trim() || !message.trim()) {
      toast.error("Vyplňte název a zprávu");
      return;
    }

    if (adminOnly && targetType === "all") {
      toast.error("Admin oznámení musí mít cíl — vyberte licenci nebo pobočky");
      return;
    }
    if (targetType === "license" && !licenseKey) {
      toast.error("Vyberte licenci");
      return;
    }
    if (targetType === "branch") {
      if (!licenseKey) {
        toast.error("Vyberte licenci");
        return;
      }
      if (selectedBranchIds.size === 0) {
        toast.error("Vyberte alespoň jednu pobočku");
        return;
      }
    }

    const payload = {
      title: title.trim(),
      message: message.trim(),
      priority,
      expires_at: expiresAt || null,
      admin_only: adminOnly,
    };

    setSending(true);
    try {
      if (targetType === "branch") {
        for (const branchId of selectedBranchIds) {
          await makeNotification({ ...payload, license_key: licenseKey, branch_id: branchId });
        }
        toast.success(
          selectedBranchIds.size > 1
            ? `Odesláno ${selectedBranchIds.size} oznámení (po pobočkách)`
            : "Oznámení odesláno"
        );
      } else if (targetType === "license") {
        await makeNotification({ ...payload, license_key: licenseKey });
        toast.success("Oznámení odesláno");
      } else {
        await makeNotification({ ...payload, admin_only: false });
        toast.success("Oznámení odesláno");
      }

      setTitle("");
      setMessage("");
      setExpiresAt("");
      setSelectedBranchIds(new Set());
      await mutate();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Odeslání selhalo");
    } finally {
      setSending(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    try {
      await deleteNotification(deleteId);
      toast.success("Oznámení smazáno");
      setDeleteId(null);
      await mutate();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Smazání selhalo");
    }
  };

  const notifications = data?.notifications ?? [];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <Bell className="h-6 w-6" />
          Oznámení
        </h2>
        <p className="text-muted-foreground">
          Na pokladny nebo jen do admin panelu — vždy s konkrétním cílem (licence / pobočky)
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Nové oznámení</CardTitle>
          <CardDescription>
            {adminOnly
              ? "admin_only=true — uvidí jen admini v rozsahu vybrané licence nebo poboček, pokladny ne"
              : "Zobrazí se na pokladnách v rozsahu cíle při příštím načtení"}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-start gap-3 rounded-lg border border-border p-3">
            <Checkbox
              id="admin-only"
              checked={adminOnly}
              onCheckedChange={(c) => handleAdminOnlyChange(c === true)}
            />
            <div className="space-y-0.5">
              <Label htmlFor="admin-only" className="cursor-pointer font-medium">
                Pouze pro adminy (webadmin)
              </Label>
              <p className="text-xs text-muted-foreground">
                Uloží se s admin_only=true. Musíte vybrat licenci nebo konkrétní pobočky — nejde poslat
                „všem licencím“.
              </p>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Cíl</Label>
              <Select value={targetType} onValueChange={(v) => handleTargetChange(v as TargetType)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {!adminOnly && <SelectItem value="all">Všechny pokladny</SelectItem>}
                  <SelectItem value="license">Celá licence (všechny prodejny)</SelectItem>
                  <SelectItem value="branch">Vybrané pobočky z licence</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Priorita</Label>
              <Select value={priority} onValueChange={(v) => setPriority(v as NotificationPriority)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(priorityLabels) as NotificationPriority[]).map((p) => (
                    <SelectItem key={p} value={p}>
                      {priorityLabels[p]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {(targetType === "license" || targetType === "branch") && (
            <div className="space-y-2">
              <Label>Licence</Label>
              <Select
                value={licenseKey}
                onValueChange={(v) => {
                  setLicenseKey(v);
                  setSelectedBranchIds(new Set());
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Vyberte licenci" />
                </SelectTrigger>
                <SelectContent>
                  {(licensesData?.licenses ?? []).map((l) => (
                    <SelectItem key={l.license_key} value={l.license_key}>
                      {l.owner_name} — {l.license_key}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {targetType === "branch" && licenseKey && (
            <div className="space-y-2">
              <Label>Pobočky</Label>
              {branchesForLicense.length === 0 ? (
                <p className="text-sm text-muted-foreground">Tato licence nemá aktivní pobočky</p>
              ) : (
                <div className="rounded-lg border border-border p-3 space-y-2 max-h-48 overflow-y-auto">
                  {branchesForLicense.map((b) => (
                    <div key={b.id} className="flex items-center gap-2">
                      <Checkbox
                        id={`notif-branch-${b.id}`}
                        checked={selectedBranchIds.has(b.id)}
                        onCheckedChange={() => toggleBranch(b.id)}
                      />
                      <Label htmlFor={`notif-branch-${b.id}`} className="cursor-pointer text-sm">
                        <span className="font-medium">{b.code}</span>
                        <span className="text-muted-foreground"> — {b.name}</span>
                      </Label>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="notif-title">Název</Label>
            <Input
              id="notif-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Např. Plánovaná údržba"
              maxLength={200}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="notif-message">Zpráva</Label>
            <Textarea
              id="notif-message"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder={adminOnly ? "Text pro admin panel…" : "Text oznámení pro pokladnu…"}
              rows={4}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="notif-expires">Platnost do (volitelné)</Label>
            <Input
              id="notif-expires"
              type="datetime-local"
              value={expiresAt}
              onChange={(e) => setExpiresAt(e.target.value)}
              className="max-w-xs"
            />
          </div>

          <Button onClick={handleSend} disabled={sending} className="gap-2">
            <Send className="h-4 w-4" />
            {sending ? "Odesílám…" : "Odeslat oznámení"}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-base">Historie oznámení</CardTitle>
            <CardDescription>{data?.total ?? 0} celkem</CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={() => mutate()} className="gap-2">
            <RefreshCw className="h-4 w-4" />
            Obnovit
          </Button>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Načítání…</p>
          ) : notifications.length === 0 ? (
            <p className="text-sm text-muted-foreground">Zatím žádná oznámení</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Název</TableHead>
                  <TableHead>Cíl</TableHead>
                  <TableHead>Priorita</TableHead>
                  <TableHead>Vytvořeno</TableHead>
                  <TableHead className="w-[60px]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {notifications.map((n) => (
                  <TableRow key={n.id}>
                    <TableCell>
                      <div className="font-medium">{n.title}</div>
                      <div className="text-xs text-muted-foreground line-clamp-1 max-w-[300px]">
                        {n.message}
                      </div>
                    </TableCell>
                    <TableCell className="text-sm">{targetLabel(n)}</TableCell>
                    <TableCell>
                      <Badge variant={priorityVariants[n.priority]}>{priorityLabels[n.priority]}</Badge>
                      {n.admin_only && (
                        <Badge variant="outline" className="ml-1">
                          admin
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {formatDistanceToNow(new Date(n.created_at), { addSuffix: true, locale: cs })}
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setDeleteId(n.id)}
                        aria-label="Smazat"
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <AlertDialog open={deleteId != null} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Smazat oznámení?</AlertDialogTitle>
            <AlertDialogDescription>
              Oznámení bude trvale odstraněno z databáze.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Zrušit</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>Smazat</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
