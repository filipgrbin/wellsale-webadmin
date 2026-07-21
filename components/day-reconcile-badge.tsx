"use client";

import { Badge } from "@/components/ui/badge";
import type { DayCompareResult, DayMatchStatus } from "@/lib/day-reconcile";
import { cn } from "@/lib/utils";

const STATUS_CLASS: Record<DayMatchStatus, string> = {
  ok: "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  warning: "border-amber-500/40 bg-amber-500/10 text-amber-800 dark:text-amber-400",
  error: "border-red-500/40 bg-red-500/10 text-red-700 dark:text-red-400",
  open: "border-border bg-muted text-muted-foreground",
  no_live: "border-sky-500/40 bg-sky-500/10 text-sky-800 dark:text-sky-400",
  unavailable: "border-border bg-muted text-muted-foreground",
};

export function DayReconcileBadge({
  result,
  loading,
  className,
}: {
  result?: DayCompareResult | null;
  loading?: boolean;
  className?: string;
}) {
  if (loading) {
    return (
      <Badge variant="outline" className={cn("font-normal text-[10px]", className)}>
        …
      </Badge>
    );
  }
  if (!result) return null;

  return (
    <Badge
      variant="outline"
      title={result.hint}
      className={cn("font-normal text-[10px] tabular-nums", STATUS_CLASS[result.status], className)}
    >
      {result.label}
    </Badge>
  );
}
