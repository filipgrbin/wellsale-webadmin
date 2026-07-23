/** Lokální wall-clock — 1:1 s easytill2/src/lib/localTime.ts */

function pad(n: number, w = 2) {
  return String(n).padStart(w, "0");
}

export function parseStamp(input: Date | string | number | null | undefined): Date {
  if (input instanceof Date) return input;
  if (typeof input === "number") return new Date(input);
  if (input == null || input === "") return new Date(NaN);
  const t = String(input).trim();

  if (/[zZ]$/.test(t) || /[+-]\d{2}:\d{2}$/.test(t)) {
    return new Date(t);
  }

  const m = t.match(
    /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?(?:\.(\d{1,3}))?)?/
  );
  if (m) {
    return new Date(
      Number(m[1]),
      Number(m[2]) - 1,
      Number(m[3]),
      Number(m[4] || 0),
      Number(m[5] || 0),
      Number(m[6] || 0),
      Number((m[7] || "0").padEnd(3, "0").slice(0, 3))
    );
  }
  return new Date(t);
}

export function localDayKey(input: Date | string | number = new Date()): string {
  const d = input instanceof Date ? input : parseStamp(input);
  const x = Number.isNaN(d.getTime()) ? new Date() : d;
  return `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}`;
}

export function normalizeReceiptPrefix(raw: string | null | undefined): string {
  let p = String(raw ?? "TX")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9_-]/g, "");
  if (!p) p = "TX";
  if (p.length > 12) p = p.slice(0, 12);
  return p;
}

export function formatReceiptNumber(
  id: number | string | null | undefined,
  prefix?: string | null
): string {
  const p = normalizeReceiptPrefix(prefix);
  const n = Math.max(0, Number(id) || 0);
  return `${p}-${String(n).padStart(4, "0")}`;
}
