"use client";

import {
  findStockMovementsForTransaction,
  type StockMovementRecord,
} from "@/lib/stock-movement-utils";
import { Package } from "lucide-react";

export interface TransactionStockView {
  id: number;
  cislo_dokladu?: string;
  receipt_number?: string;
  movementNumber?: string | null;
  stockMovementId?: number | null;
}

interface TransactionStockMovementPanelProps {
  transaction: TransactionStockView;
  stockMovements?: StockMovementRecord[];
}

/** Shows linked stock movement numbers only — no signature status. */
export function TransactionStockMovementPanel({
  transaction,
  stockMovements = [],
}: TransactionStockMovementPanelProps) {
  const linked = findStockMovementsForTransaction(stockMovements, transaction);
  const numbers = [
    ...new Set(
      [
        ...linked.map((m) => m.movementNumber || String(m.id)),
        transaction.movementNumber,
        transaction.stockMovementId != null ? String(transaction.stockMovementId) : null,
      ].filter(Boolean) as string[]
    ),
  ];

  if (numbers.length === 0 && linked.length === 0) return null;

  return (
    <div className="rounded-lg border border-border bg-secondary/30 p-3 space-y-1 shrink-0 text-sm">
      <div className="flex items-center gap-2">
        <Package className="h-4 w-4 text-muted-foreground shrink-0" />
        <span className="text-muted-foreground">Číslo pohybu ve skladu</span>
        <span className="font-mono text-xs font-medium ml-auto">
          {numbers.length ? numbers.join(", ") : "—"}
        </span>
      </div>
    </div>
  );
}
