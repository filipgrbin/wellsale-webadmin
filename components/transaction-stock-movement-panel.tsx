"use client";

import { Badge } from "@/components/ui/badge";
import { FileSignature } from "lucide-react";
import {
  findStockMovementsForTransaction,
  summarizeStockMovements,
  transactionHasStockMeta,
  type StockMovementRecord,
} from "@/lib/stock-movement-utils";

export interface TransactionStockView {
  id: number;
  cislo_dokladu?: string;
  receipt_number?: string;
  signed?: boolean;
  signerName?: string | null;
  signatureFingerprint?: string | null;
  movementNumber?: string | null;
  stockMovementId?: number | null;
}

interface TransactionStockMovementPanelProps {
  transaction: TransactionStockView;
  stockMovements?: StockMovementRecord[];
}

export function TransactionStockMovementPanel({
  transaction,
  stockMovements = [],
}: TransactionStockMovementPanelProps) {
  const linked = findStockMovementsForTransaction(stockMovements, transaction);
  const hasMovementRows = linked.length > 0;
  const hasTxMeta = transactionHasStockMeta(transaction);

  if (!hasMovementRows && !hasTxMeta) return null;

  const summary = hasMovementRows
    ? summarizeStockMovements(linked)
    : {
        movementNumbers: transaction.movementNumber
          ? [transaction.movementNumber]
          : transaction.stockMovementId
            ? [String(transaction.stockMovementId)]
            : [],
        signed: Boolean(transaction.signed),
        signerName: transaction.signerName ?? null,
        signatureFingerprint: transaction.signatureFingerprint ?? null,
      };

  return (
    <div className="rounded-lg border border-border bg-secondary/30 p-4 space-y-3 shrink-0">
      <div className="flex items-center gap-2">
        <FileSignature className="h-4 w-4 text-primary shrink-0" />
        <p className="font-medium text-sm">Skladový pohyb</p>
      </div>

      <div className="grid gap-2 text-sm">
        <div className="flex justify-between gap-4">
          <span className="text-muted-foreground">Podepsáno</span>
          <Badge variant={summary.signed ? "default" : "secondary"}>
            {summary.signed ? "Ano" : "Ne"}
          </Badge>
        </div>

        {summary.movementNumbers.length > 0 && (
          <div className="flex justify-between gap-4">
            <span className="text-muted-foreground shrink-0">Číslo pohybu</span>
            <span className="font-medium text-right font-mono text-xs">
              {summary.movementNumbers.join(", ")}
            </span>
          </div>
        )}

        {summary.signerName && (
          <div className="flex justify-between gap-4">
            <span className="text-muted-foreground shrink-0">Podepsal</span>
            <span className="font-medium text-right">{summary.signerName}</span>
          </div>
        )}

        {summary.signatureFingerprint && (
          <div className="space-y-1">
            <span className="text-muted-foreground text-xs">Fingerprint podpisu</span>
            <p className="font-mono text-[11px] break-all bg-background/80 rounded px-2 py-1.5 border border-border/50">
              {summary.signatureFingerprint}
            </p>
          </div>
        )}
      </div>

      {linked.length > 1 && (
        <div className="pt-2 border-t border-border/50 space-y-2">
          <p className="text-xs text-muted-foreground">Položky pohybu ({linked.length})</p>
          {linked.map((m) => (
            <div key={m.id} className="text-xs flex justify-between gap-2">
              <span className="truncate text-muted-foreground">
                #{m.movementNumber || m.id}
                {m.productName ? ` · ${m.productName}` : ""}
                {m.qty ? ` · ${m.qty} ks` : ""}
              </span>
              <span>{m.signed ? "✓" : "—"}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
