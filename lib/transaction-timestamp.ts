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

/** Match YYYY-MM-DD HH:MM or ISO datetime; digits are Prague wall clock from POS. */
export function matchPosWallClock(ts: string): RegExpMatchArray | null {
  return String(ts).trim().match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?/);
}

/**
 * WellSale POS stores transaction time as Prague local wall clock in SQLite.
 * Some builds append a spurious "Z" (local digits treated as UTC) — do NOT
 * apply timezone offset on top of the literal hour/minute digits.
 */
export function posWallClockHour(ts: string): number | null {
  const m = matchPosWallClock(ts);
  return m ? Number(m[4]) : null;
}

export function formatPosWallClock(ts: string): string | null {
  const m = matchPosWallClock(ts);
  if (!m) return null;
  const sec = m[6] ?? "00";
  return `${m[3]}.${m[2]}.${m[1]} ${m[4]}:${m[5]}:${sec}`;
}
