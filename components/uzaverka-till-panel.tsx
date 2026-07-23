"use client";

import {
  TILL_DENOMINATIONS,
  hasTillData,
  mergeUzaverkaMetadata,
  resolveCashierName,
  resolveClosedBy,
  resolveTillTotal,
  type TillSnapshot,
  type UzaverkaMetadata,
} from "@/lib/uzaverka-meta";
import { formatBackupDateTime } from "@/lib/backup-preview-utils";
import { formatCurrency } from "@/lib/turnover-utils";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Banknote, User } from "lucide-react";

function TillSnapshotBlock({
  title,
  snapshot,
}: {
  title: string;
  snapshot: TillSnapshot | undefined;
}) {
  if (!snapshot) {
    return (
      <div className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
        {title}: bez záznamu
      </div>
    );
  }

  if (snapshot.skipped) {
    return (
      <div className="rounded-lg border border-border bg-secondary/20 p-4 space-y-2">
        <div className="flex items-center justify-between gap-2">
          <p className="font-medium text-sm">{title}</p>
          <Badge variant="secondary">Přeskočeno</Badge>
        </div>
        {snapshot.at && (
          <p className="text-xs text-muted-foreground">{formatBackupDateTime(snapshot.at)}</p>
        )}
        {snapshot.actor && (
          <p className="text-xs text-muted-foreground">Zapsal: {snapshot.actor}</p>
        )}
      </div>
    );
  }

  const total = resolveTillTotal(snapshot);
  const counts = snapshot.counts ?? {};

  return (
    <div className="rounded-lg border border-border bg-secondary/20 p-4 space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-medium text-sm">{title}</p>
          {snapshot.at && (
            <p className="text-xs text-muted-foreground mt-0.5">
              {formatBackupDateTime(snapshot.at)}
            </p>
          )}
          {snapshot.actor && (
            <p className="text-xs text-muted-foreground">Zapsal: {snapshot.actor}</p>
          )}
        </div>
        <p className="text-lg font-bold text-emerald-600 tabular-nums shrink-0">
          {formatCurrency(total)}
        </p>
      </div>
      <div className="grid grid-cols-3 sm:grid-cols-4 gap-1.5 text-xs">
        {TILL_DENOMINATIONS.map((denom) => {
          const qty = Number(counts[String(denom)] ?? 0);
          if (!qty) return null;
          return (
            <div
              key={denom}
              className="flex items-center justify-between rounded bg-background/80 px-2 py-1 border border-border/50"
            >
              <span className="text-muted-foreground">{denom} Kč</span>
              <span className="font-medium tabular-nums">×{qty}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

interface UzaverkaTillPanelProps {
  /** metadata_json from backup row and/or decrypted uzaverka row */
  sources: unknown[];
  className?: string;
}

export function UzaverkaTillPanel({ sources, className }: UzaverkaTillPanelProps) {
  const meta = mergeUzaverkaMetadata(...sources);
  if (!hasTillData(meta)) return null;

  const till = meta!.till!;

  return (
    <Card className={className ?? "mb-4 border-border bg-card"}>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <Banknote className="h-4 w-4 text-emerald-600" />
          Stav pokladny (hotovost)
        </CardTitle>
        {(() => {
          const closedBy = resolveClosedBy(meta);
          const cashier = resolveCashierName(meta);
          if (closedBy) {
            return (
              <p className="text-sm text-muted-foreground flex items-center gap-1.5 pt-1">
                <User className="h-3.5 w-3.5 shrink-0" />
                Uzavřel: <span className="font-medium text-foreground">{closedBy}</span>
              </p>
            );
          }
          if (cashier) {
            return (
              <p className="text-sm text-muted-foreground flex items-center gap-1.5 pt-1">
                <User className="h-3.5 w-3.5 shrink-0" />
                Pokladní: <span className="font-medium text-foreground">{cashier}</span>
              </p>
            );
          }
          return null;
        })()}
      </CardHeader>
      <CardContent>
        <div className="grid md:grid-cols-2 gap-3">
          <TillSnapshotBlock title="Začátek směny" snapshot={till.start} />
          <TillSnapshotBlock title="Konec směny" snapshot={till.end} />
        </div>
      </CardContent>
    </Card>
  );
}

/** Inline badge for tables when till data exists. */
export function UzaverkaTillBadge({ meta }: { meta: unknown }) {
  const m = meta as UzaverkaMetadata | null;
  if (!hasTillData(m)) return null;
  const closedBy = resolveClosedBy(m);
  const cashier = resolveCashierName(m);
  const who = closedBy || cashier;
  return (
    <Badge variant="outline" className="text-xs font-normal gap-1">
      <Banknote className="h-3 w-3" />
      Pokladna
      {who ? ` · ${who}` : ""}
    </Badge>
  );
}
