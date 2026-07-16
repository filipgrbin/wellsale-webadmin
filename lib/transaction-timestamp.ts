/**
 * WellSale POS canonical timestamp (schema v7+):
 *   `2026-07-16 09:30:00` — PC local wall clock, no Z, no offset.
 *
 * Legacy backups may still contain true UTC ISO (`…T07:30:00.000Z` = 9:30 CEST)
 * or pre-migration naive ISO; those are handled separately below.
 */

/** Canonical: `YYYY-MM-DD HH:MM:SS` or `YYYY-MM-DD HH:MM` */
export const CANONICAL_POS_STAMP =
  /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2})(?::(\d{2}))?$/;

/** Naive datetime digits (T separator, no timezone suffix). */
const NAIVE_ISO_STAMP =
  /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?/;

function pragueHourFromUtcIso(iso: string): number {
  const h = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Prague",
    hour: "numeric",
    hour12: false,
  }).format(new Date(iso));
  const n = Number(h);
  return n === 24 ? 0 : n;
}

function hasExplicitTimezone(s: string): boolean {
  return s.endsWith("Z") || /[+-]\d{2}:?\d{2}$/.test(s);
}

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

export function isCanonicalPosStamp(ts: string): boolean {
  return CANONICAL_POS_STAMP.test(String(ts).trim());
}

/** Date part YYYY-MM-DD from any supported POS stamp. */
export function posStampDate(ts: string): string | null {
  const s = String(ts).trim();
  const c = s.match(CANONICAL_POS_STAMP);
  if (c) return `${c[1]}-${c[2]}-${c[3]}`;
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  if (hasExplicitTimezone(s)) {
    const d = new Date(s);
    if (!Number.isNaN(d.getTime())) {
      return new Intl.DateTimeFormat("en-CA", {
        timeZone: "Europe/Prague",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(d);
    }
  }
  return null;
}

/** Hour 0–23 for intraday charts. */
export function posStampHour(ts: string): number | null {
  const s = String(ts).trim();
  if (!s) return null;

  const canonical = s.match(CANONICAL_POS_STAMP);
  if (canonical) return Number(canonical[4]);

  if (!hasExplicitTimezone(s)) {
    const naive = s.match(NAIVE_ISO_STAMP);
    if (naive) return Number(naive[4]);
  }

  if (hasExplicitTimezone(s) || s.includes("T")) {
    const d = new Date(s);
    if (!Number.isNaN(d.getTime())) return pragueHourFromUtcIso(s);
  }

  return null;
}

/** Display as `DD.MM.YYYY HH:MM:SS` — matches POS parseStamp intent. */
export function formatPosStamp(ts: string): string | null {
  const s = String(ts).trim();
  if (!s) return null;

  const canonical = s.match(CANONICAL_POS_STAMP);
  if (canonical) {
    const sec = canonical[6] ?? "00";
    return `${canonical[3]}.${canonical[2]}.${canonical[1]} ${canonical[4]}:${canonical[5]}:${sec}`;
  }

  if (!hasExplicitTimezone(s)) {
    const naive = s.match(NAIVE_ISO_STAMP);
    if (naive) {
      const sec = naive[6] ?? "00";
      return `${naive[3]}.${naive[2]}.${naive[1]} ${naive[4]}:${naive[5]}:${sec}`;
    }
  }

  if (hasExplicitTimezone(s)) {
    const d = new Date(s);
    if (!Number.isNaN(d.getTime())) {
      return d.toLocaleString("cs-CZ", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
        timeZone: "Europe/Prague",
      });
    }
  }

  return null;
}

/** @deprecated use posStampHour */
export function posWallClockHour(ts: string): number | null {
  return posStampHour(ts);
}

/** @deprecated use formatPosStamp */
export function formatPosWallClock(ts: string): string | null {
  return formatPosStamp(ts);
}

/** @deprecated use posStampHour */
export function matchPosWallClock(ts: string): RegExpMatchArray | null {
  return String(ts).trim().match(NAIVE_ISO_STAMP);
}

/** Hour for charts — canonical literal first, legacy UTC ISO fallback. */
export function pragueHourFromTimestamp(ts: string): number {
  const s = String(ts).trim();
  if (/^\d+$/.test(s)) {
    const n = Number(s);
    const ms = n > 1e12 ? n : n * 1000;
    return pragueHourFromUtcIso(new Date(ms).toISOString());
  }
  return posStampHour(ts) ?? 0;
}

/** Day filter: stamp within [day 00:00:00, day 23:59:59] (string compare). */
export function posStampOnDay(ts: string, day: string): boolean {
  const d = posStampDate(ts);
  if (d) return d === day.slice(0, 10);
  return false;
}

/** Compare stamp to inclusive local day range. */
export function posStampInDayRange(ts: string, from: string, to: string): boolean {
  const d = posStampDate(ts);
  if (!d) return false;
  return d >= from.slice(0, 10) && d <= to.slice(0, 10);
}
