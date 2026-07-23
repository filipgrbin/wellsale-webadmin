import { NextRequest, NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";
import { fetchAndDecryptSqliteBufferById } from "@/lib/backup-wsbak-server";
import { extractCloseExportSource } from "@/lib/uzaverka-exports/extract-source";
import {
  buildCloseExcelBuffer,
  buildCloseSummaryPdfBuffer,
} from "@/lib/uzaverka-exports/close-export";
import { buildDailyEvidenceExcelBuffer } from "@/lib/uzaverka-exports/evidence-excel";

export const runtime = "nodejs";

const API_BASE =
  process.env.NEXT_PUBLIC_API_URL ||
  "https://ikehhqxu7b.execute-api.eu-central-1.amazonaws.com";
const ADMIN_KEY = process.env.NEXT_PUBLIC_ADMIN_KEY || "SUPER_SECRET_ADMIN_NKEY";

const KINDS = new Set(["pdf", "excel", "evidence"]);

function asBase64(buf: Buffer): string {
  return buf.toString("base64");
}

/**
 * POST /api/admin/backups/export
 * body: { id, kind: "pdf"|"excel"|"evidence", shopName?, ico?, receiptPrefix? }
 * → binary file download (same names as POS)
 */
export async function POST(request: NextRequest) {
  const adminKey = request.headers.get("x-admin-key") || ADMIN_KEY;
  if (!adminKey) {
    return NextResponse.json({ error: "Missing admin key" }, { status: 401 });
  }

  let body: {
    id?: number;
    kind?: string;
    shopName?: string;
    ico?: string;
    receiptPrefix?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "bad_json" }, { status: 400 });
  }

  const id = Number(body.id);
  const kind = String(body.kind || "").toLowerCase();
  if (!id || !KINDS.has(kind)) {
    return NextResponse.json(
      { error: "id_and_kind_required", detail: "kind=pdf|excel|evidence" },
      { status: 400 }
    );
  }

  try {
    const { sqliteBuffer } = await fetchAndDecryptSqliteBufferById(id, adminKey, API_BASE);
    const source = await extractCloseExportSource(sqliteBuffer, {
      shop_location: body.shopName || "WellSale",
      ico: body.ico || "",
      receipt_prefix: body.receiptPrefix || "TX",
    });
    const date = source.close.close_date;

    if (kind === "excel") {
      const arr = buildCloseExcelBuffer(source);
      return new NextResponse(new Uint8Array(arr), {
        status: 200,
        headers: {
          "Content-Type":
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "Content-Disposition": `attachment; filename="uzaverka-${date}.xlsx"`,
          "Cache-Control": "no-store",
        },
      });
    }

    if (kind === "pdf") {
      const fontsDir = path.join(process.cwd(), "public", "fonts");
      let regB64: string | null = null;
      let boldB64: string | null = null;
      try {
        regB64 = asBase64(await fs.readFile(path.join(fontsDir, "arial.ttf")));
      } catch {
        /* helvetica fallback */
      }
      try {
        boldB64 = asBase64(await fs.readFile(path.join(fontsDir, "arialbd.ttf")));
      } catch {
        /* */
      }
      const pdf = await buildCloseSummaryPdfBuffer(
        source.close,
        source.settings,
        source.dayMovements,
        source.products,
        source.suppliers,
        regB64,
        boldB64
      );
      return new NextResponse(pdf, {
        status: 200,
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `attachment; filename="uzaverka-souhrn-${date}.pdf"`,
          "Cache-Control": "no-store",
        },
      });
    }

    // evidence — denní deník 1:1 s POS (bez šablony)
    const evidence = await buildDailyEvidenceExcelBuffer(source);
    return new NextResponse(new Uint8Array(evidence), {
      status: 200,
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="evidence-${date}.xlsx"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("[uzaverka-export]", error);
    return NextResponse.json(
      {
        error: "export_failed",
        detail: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
