/** Normalize POS/SQLite transaction timestamp to a parseable string. */
export function extractTransactionTimestamp(row: Record<string, unknown>): string {
  const raw =
    row.created_at ??
    row.createdAt ??
    row.date ??
    row.timestamp ??
    row.paid_at ??
    row.sale_time ??
    row.datetime ??
    row.time ??
    "";

  if (typeof raw === "number" && Number.isFinite(raw)) {
    const ms = raw > 1e12 ? raw : raw * 1000;
    return new Date(ms).toISOString();
  }

  if (typeof raw === "string") {
    const s = raw.trim();
    if (/^\d+$/.test(s)) {
      const n = Number(s);
      const ms = n > 1e12 ? n : n * 1000;
      return new Date(ms).toISOString();
    }
    return s;
  }

  return String(raw || "");
}
