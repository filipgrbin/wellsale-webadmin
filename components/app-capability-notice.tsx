"use client";

import { AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";

/** Soft notice when some/all branches lack a POS capability. */
export function AppCapabilityNotice({
  notice,
  className,
}: {
  notice: string | null | undefined;
  className?: string;
}) {
  if (!notice) return null;
  return (
    <div
      className={cn(
        "flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-amber-900 dark:text-amber-200",
        className
      )}
    >
      <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
      <p>{notice}</p>
    </div>
  );
}
