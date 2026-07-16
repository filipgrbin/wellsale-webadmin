import { NextRequest, NextResponse } from "next/server";
import { fetchAndDecryptBackupById } from "@/lib/backup-wsbak-server";
import { posStampOnDay } from "@/lib/transaction-timestamp";
import { normalizeCloseDate } from "@/lib/turnover-utils";

const API_BASE =
  process.env.NEXT_PUBLIC_API_URL ||
  "https://ikehhqxu7b.execute-api.eu-central-1.amazonaws.com";
const ADMIN_KEY = process.env.NEXT_PUBLIC_ADMIN_KEY || "SUPER_SECRET_ADMIN_NKEY";

export interface IntradaySalePoint {
  branchId: number;
  timestamp: string;
  revenue: number;
}

/** Batch-decrypt uzaverka backups and return transaction timestamps for intraday chart. */
export async function POST(request: NextRequest) {
  const adminKey = request.headers.get("x-admin-key") || ADMIN_KEY;
  if (!adminKey) {
    return NextResponse.json({ error: "Missing admin key" }, { status: 401 });
  }

  let body: { backupIds?: number[]; day?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const backupIds = Array.isArray(body.backupIds)
    ? [...new Set(body.backupIds.map(Number).filter((n) => Number.isFinite(n) && n > 0))]
    : [];
  const day = String(body.day || "").slice(0, 10);

  if (!backupIds.length || !/^\d{4}-\d{2}-\d{2}$/.test(day)) {
    return NextResponse.json({ error: "Missing backupIds or day" }, { status: 400 });
  }

  const sales: IntradaySalePoint[] = [];
  const errors: Array<{ id: number; error: string }> = [];

  await Promise.all(
    backupIds.map(async (id) => {
      try {
        const { backup, data } = await fetchAndDecryptBackupById(id, adminKey, API_BASE);
        for (const prodej of data.prodeje) {
          if (!prodej.datum?.trim()) continue;
          if (!posStampOnDay(prodej.datum, day) && normalizeCloseDate(prodej.datum) !== day) {
            continue;
          }
          sales.push({
            branchId: backup.branch_id,
            timestamp: prodej.datum,
            revenue: Number(prodej.celkem) || 0,
          });
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
    day,
    sales,
    errors: errors.length ? errors : undefined,
  });
}
