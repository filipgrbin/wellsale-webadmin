import { Badge } from "@/components/ui/badge";
import { formatAppVersionSeenAt } from "@/lib/branch-app-version";

interface BranchAppVersionProps {
  version?: string | null;
  seenAt?: string | null;
  /** Inline badge only, no seen-at line */
  inline?: boolean;
  className?: string;
}

export function BranchAppVersion({
  version,
  seenAt,
  inline = false,
  className,
}: BranchAppVersionProps) {
  const seen = formatAppVersionSeenAt(seenAt);

  if (!version?.trim()) {
    return <span className={`text-muted-foreground text-xs ${className ?? ""}`}>—</span>;
  }

  if (inline) {
    return (
      <Badge variant="outline" className={`font-mono text-xs font-normal ${className ?? ""}`}>
        v{version.trim()}
      </Badge>
    );
  }

  return (
    <div className={className}>
      <code className="font-mono text-xs bg-secondary px-2 py-0.5 rounded">{version.trim()}</code>
      {seen && <p className="text-xs text-muted-foreground mt-0.5">nahlášeno {seen}</p>}
    </div>
  );
}
