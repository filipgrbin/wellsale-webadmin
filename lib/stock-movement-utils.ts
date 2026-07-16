export interface StockMovementRecord {
  id: number;
  transactionId: number | null;
  receiptNumber: string | null;
  movementNumber: string | null;
  signed: boolean;
  signerName: string | null;
  signatureFingerprint: string | null;
  productName: string | null;
  qty: number;
  reason: string | null;
  createdAt: string | null;
}

function firstString(row: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const v = row[key];
    if (v != null && String(v).trim()) return String(v).trim();
  }
  return null;
}

function firstNumber(row: Record<string, unknown>, keys: string[]): number | null {
  for (const key of keys) {
    const n = Number(row[key]);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

function isTruthySigned(row: Record<string, unknown>): boolean {
  for (const key of [
    "signed",
    "is_signed",
    "has_signature",
    "signature_present",
    "podepsano",
    "podepsan",
  ]) {
    const v = row[key];
    if (v === 1 || v === true || v === "1" || String(v).toLowerCase() === "true") return true;
  }
  const sig = firstString(row, [
    "signature",
    "signature_data",
    "signature_blob",
    "podpis",
  ]);
  if (sig) return true;
  const fp = firstString(row, [
    "signature_fingerprint",
    "cert_thumbprint",
    "thumbprint",
    "fingerprint",
    "signature_hash",
    "podpis_fingerprint",
  ]);
  if (fp) return true;
  const name = firstString(row, [
    "signed_by",
    "signer_name",
    "signature_name",
    "signed_by_name",
    "podepsal",
    "actor",
  ]);
  return Boolean(name);
}

export function parseTransactionStockMeta(row: Record<string, unknown>): {
  signed: boolean;
  signerName: string | null;
  signatureFingerprint: string | null;
  movementNumber: string | null;
  stockMovementId: number | null;
} {
  const stockMovementId = firstNumber(row, [
    "stock_movement_id",
    "movement_id",
    "pohyb_id",
  ]);
  const movementNumber = firstString(row, [
    "movement_number",
    "movement_no",
    "stock_movement_number",
    "cislo_pohybu",
  ]);

  return {
    signed: isTruthySigned(row),
    signerName: firstString(row, [
      "signed_by",
      "signer_name",
      "signature_name",
      "signed_by_name",
      "podepsal",
      "actor",
    ]),
    signatureFingerprint: firstString(row, [
      "signature_fingerprint",
      "cert_thumbprint",
      "thumbprint",
      "fingerprint",
      "signature_hash",
    ]),
    movementNumber: movementNumber ?? (stockMovementId != null ? String(stockMovementId) : null),
    stockMovementId,
  };
}

export function parseStockMovementRow(
  row: Record<string, unknown>,
  index: number
): StockMovementRecord {
  const id = firstNumber(row, ["id", "movement_id", "pohyb_id"]) ?? index + 1;
  const transactionId = firstNumber(row, [
    "transaction_id",
    "tx_id",
    "sale_id",
    "receipt_id",
    "prodej_id",
  ]);
  const receiptNumber = firstString(row, [
    "receipt_number",
    "transaction_number",
    "sale_number",
    "doklad",
    "cislo_dokladu",
  ]);
  const movementNumber = firstString(row, [
    "movement_number",
    "movement_no",
    "pohyb_cislo",
    "cislo_pohybu",
    "stock_movement_number",
    "number",
  ]);

  return {
    id,
    transactionId,
    receiptNumber,
    movementNumber: movementNumber ?? (id ? String(id) : null),
    signed: isTruthySigned(row),
    signerName: firstString(row, [
      "signed_by",
      "signer_name",
      "signature_name",
      "signed_by_name",
      "podepsal",
      "actor",
      "user_name",
    ]),
    signatureFingerprint: firstString(row, [
      "signature_fingerprint",
      "cert_thumbprint",
      "thumbprint",
      "fingerprint",
      "signature_hash",
      "podpis_fingerprint",
    ]),
    productName: firstString(row, [
      "product_name",
      "name_snapshot",
      "nazev",
      "name",
    ]),
    qty: firstNumber(row, ["qty", "quantity", "mnozstvi", "amount"]) ?? 0,
    reason: firstString(row, ["reason", "duvod", "type", "movement_type"]),
    createdAt: firstString(row, ["created_at", "datum", "date", "timestamp"]),
  };
}

export function findStockMovementsForTransaction(
  movements: StockMovementRecord[],
  tx: {
    id: number;
    cislo_dokladu?: string;
    receipt_number?: string;
    stockMovementId?: number | null;
  }
): StockMovementRecord[] {
  const receipt = String(tx.cislo_dokladu || tx.receipt_number || "").trim();
  const linked = movements.filter((m) => {
    if (m.transactionId != null && m.transactionId === tx.id) return true;
    if (tx.stockMovementId != null && m.id === tx.stockMovementId) return true;
    if (receipt && m.receiptNumber && m.receiptNumber === receipt) return true;
    return false;
  });
  return linked;
}

export function transactionHasStockMeta(tx: {
  signed?: boolean;
  signerName?: string | null;
  signatureFingerprint?: string | null;
  movementNumber?: string | null;
  stockMovementId?: number | null;
}): boolean {
  return Boolean(
    tx.signed ||
      tx.signerName ||
      tx.signatureFingerprint ||
      tx.movementNumber ||
      tx.stockMovementId
  );
}

export function summarizeStockMovements(movements: StockMovementRecord[]): {
  movementNumbers: string[];
  signed: boolean;
  signerName: string | null;
  signatureFingerprint: string | null;
} {
  const numbers = [
    ...new Set(
      movements
        .map((m) => m.movementNumber || String(m.id))
        .filter(Boolean)
    ),
  ];
  const signed = movements.some((m) => m.signed);
  const signerName =
    movements.find((m) => m.signerName)?.signerName ?? null;
  const signatureFingerprint =
    movements.find((m) => m.signatureFingerprint)?.signatureFingerprint ?? null;

  return {
    movementNumbers: numbers,
    signed,
    signerName,
    signatureFingerprint,
  };
}
