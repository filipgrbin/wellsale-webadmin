import { NextRequest, NextResponse } from "next/server";
import { fetchAndDecryptBackupById } from "@/lib/backup-wsbak-server";
import { posStampOnDay, posStampInDayRange } from "@/lib/transaction-timestamp";
import { classifyPaymentKind, normalizeCloseDate } from "@/lib/turnover-utils";

const API_BASE =
  process.env.NEXT_PUBLIC_API_URL ||
  "https://ikehhqxu7b.execute-api.eu-central-1.amazonaws.com";
const ADMIN_KEY = process.env.NEXT_PUBLIC_ADMIN_KEY || "SUPER_SECRET_ADMIN_NKEY";

export interface IntradaySalePoint {
  branchId: number;
  timestamp: string;
  revenue: number;
  payKind: "cash" | "qr" | "other";
}

function saleInRange(datum: string, from: string, to: string): boolean {
  if (from === to) {
    return posStampOnDay(datum, from) || normalizeCloseDate(datum) === from;
  }
  if (posStampInDayRange(datum, from, to)) return true;
  const d = normalizeCloseDate(datum);
  return d != null && d >= from && d <= to;
}

/** Batch-decrypt uzaverka backups and return transaction timestamps + product qty for charts / insights. */
export async function POST(request: NextRequest) {
  const adminKey = request.headers.get("x-admin-key") || ADMIN_KEY;
  if (!adminKey) {
    return NextResponse.json({ error: "Missing admin key" }, { status: 401 });
  }

  let body: { backupIds?: number[]; day?: string; from?: string; to?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const backupIds = Array.isArray(body.backupIds)
    ? [...new Set(body.backupIds.map(Number).filter((n) => Number.isFinite(n) && n > 0))]
    : [];

  const day = String(body.day || "").slice(0, 10);
  const from = String(body.from || day || "").slice(0, 10);
  const to = String(body.to || day || from || "").slice(0, 10);
  const dateRe = /^\d{4}-\d{2}-\d{2}$/;

  if (!backupIds.length || !dateRe.test(from) || !dateRe.test(to)) {
    return NextResponse.json({ error: "Missing backupIds or date range" }, { status: 400 });
  }

  const sales: IntradaySalePoint[] = [];
  const productCounts: Record<string, number> = {};
  const errors: Array<{ id: number; error: string }> = [];

  await Promise.all(
    backupIds.map(async (id) => {
      try {
        const { backup, data } = await fetchAndDecryptBackupById(id, adminKey, API_BASE);
        for (const prodej of data.prodeje) {
          if (!prodej.datum?.trim()) continue;
          if (!saleInRange(prodej.datum, from, to)) continue;
          sales.push({
            branchId: backup.branch_id,
            timestamp: prodej.datum,
            revenue: Number(prodej.celkem) || 0,
            payKind: classifyPaymentKind(prodej.platba_typ),
          });
        }

        // Uzaverka backup is day-scoped — all line items belong to that close.
        // Resolve names via product_id in the parser (name_snapshot / products table).
        for (const item of data.polozky) {
          const name = String(item.nazev || "").trim();
          const qty = Number(item.mnozstvi) || 0;
          if (!name || !Number.isFinite(qty) || qty === 0) continue;
          productCounts[name] = (productCounts[name] || 0) + qty;
        }
      } catch (e) {
        errors.push({
          id,
          error: e instanceof Error ? e.message : "Decrypt failed",
        });
      }
    })
  );

  return NextResponse.json({
    ok: true,
    from,
    to,
    day: from === to ? from : undefined,
    sales,
    products: productCounts,
    errors: errors.length ? errors : undefined,
  });
}
