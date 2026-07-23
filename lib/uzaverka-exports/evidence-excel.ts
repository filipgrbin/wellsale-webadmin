/**
 * 1:1 port of easytill2/src/lib/evidenceExcel.ts —
 * Denní evidenční kniha = DETAILNÍ deník (1 pohyb = 1 řádek).
 */

import ExcelJS from "exceljs";
import { formatReceiptNumber, localDayKey } from "@/lib/uzaverka-exports/time";
import type { CloseExportSource, CloseStockMovement } from "@/lib/uzaverka-exports/types";

function dateTimeFmtCz(iso: string): string {
  if (!iso) return "";
  return new Date(iso).toLocaleString("cs-CZ", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function productLabel(
  p: CloseExportSource["products"][number] | null | undefined,
  m?: CloseStockMovement
): string {
  const name = m?.product_name || p?.name || "";
  return [name, p?.subtype, p?.form, p?.package_size]
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

const KIND_LABEL: Record<string, string> = {
  in: "Příjem",
  sale: "Prodej",
  out: "Výdej",
  adjust: "Úprava",
};

/** Doklad: u příjmu číslo dodacího listu (document_number), u prodeje účtenka. */
function movementDoc(m: CloseStockMovement, prefix?: string | null): string {
  const isIn = m.kind === "in" || Number(m.delta) > 0;
  if (isIn) {
    return String(m.document_number || m.batch_document || m.batch_doc_number || "").trim();
  }
  if (m.document_number) return String(m.document_number);
  if (m.transaction_id) return formatReceiptNumber(m.transaction_id, prefix);
  return "";
}

const HEADERS = [
  "Č.",
  "Datum a čas",
  "Typ",
  "Název, podtyp, forma, balení",
  "Šarže",
  "Doklad",
  "Dodavatel",
  "Adresa dodavatele",
  "IČ dodavatele",
  "Země dodavatele",
  "Množství ks",
  "Stav zásob ks",
  "Zapsal",
  "Interní ID pohybu",
] as const;

export async function buildDailyEvidenceExcelBuffer(
  source: CloseExportSource
): Promise<ArrayBuffer> {
  const closeDate = source.close.close_date;
  const settings = source.settings as Record<string, string>;
  const products = source.products;
  const suppliers = source.suppliers;
  const movements = source.dayMovements;

  const productMap = new Map(products.map((p) => [p.id, p]));
  const prefix = settings.receipt_prefix || "TX";
  const shop = settings.shop_location || "WellSale";
  const ico = settings.ico || "";

  const dayMovements = [...movements]
    .filter((m) => {
      const at = String(m.created_at || "");
      if (!at) return true;
      return (
        localDayKey(at) === closeDate ||
        at.startsWith(closeDate) ||
        at.includes(closeDate)
      );
    })
    .sort(
      (a, b) =>
        String(a.created_at || "").localeCompare(String(b.created_at || "")) ||
        Number(a.id || 0) - Number(b.id || 0)
    );

  const wb = new ExcelJS.Workbook();
  wb.creator = "WellSale";
  const ws = wb.addWorksheet(`Evidence ${closeDate}`.slice(0, 31), {
    views: [{ state: "frozen", ySplit: 4 }],
  });

  ws.getCell(1, 1).value = "Evidenční kniha PML — denní deník (vyhl. 147/2025 Sb.)";
  ws.getCell(1, 1).font = { bold: true, size: 12 };
  ws.getCell(2, 1).value = [shop, ico ? `IČO: ${ico}` : "", settings.shop_address || ""]
    .filter(Boolean)
    .join(" · ");
  ws.getCell(3, 1).value = `Datum: ${closeDate} · záznamů: ${dayMovements.length}`;

  const headerRow = ws.getRow(4);
  HEADERS.forEach((h, i) => {
    const cell = headerRow.getCell(i + 1);
    cell.value = h;
    cell.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 9 };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF284028" } };
    cell.alignment = { vertical: "middle", wrapText: true };
  });
  headerRow.height = 22;

  let r = 5;
  let n = 0;
  for (const m of dayMovements) {
    n += 1;
    const product = productMap.get(m.product_id) ?? null;
    const isIn = m.kind === "in" || Number(m.delta) > 0;
    const sarze = String(m.batch_number || product?.lot_number || "").trim();

    const catalogSup =
      product?.supplier_id != null
        ? suppliers.find((s) => s.id === product.supplier_id)
        : null;
    const namedSup = m.supplier_name
      ? suppliers.find(
          (s) =>
            String(s.name || "")
              .trim()
              .toLowerCase() === String(m.supplier_name).trim().toLowerCase()
        )
      : null;
    const fallbackSup = namedSup || catalogSup;

    const supplierName = (m.supplier_name || fallbackSup?.name || "").trim();
    const supplierAddress = (m.supplier_address || fallbackSup?.address || "").trim();
    const supplierIc = (m.supplier_ic || fallbackSup?.ic || "").trim();
    const supplierCountry = (
      m.supplier_country ||
      fallbackSup?.country ||
      settings.supplier_country ||
      ""
    ).trim();

    const row = ws.getRow(r);
    const values: ExcelJS.CellValue[] = [
      n,
      dateTimeFmtCz(String(m.created_at || "")),
      KIND_LABEL[m.kind || ""] || (isIn ? "Příjem" : "Výdej"),
      productLabel(product, m),
      sarze,
      movementDoc(m, prefix),
      supplierName,
      supplierAddress,
      supplierIc,
      supplierCountry,
      Number(m.delta) || 0,
      m.stock_after != null ? Number(m.stock_after) : "",
      m.user_name || "",
      m.id != null ? Number(m.id) : "",
    ];
    values.forEach((v, i) => {
      const cell = row.getCell(i + 1);
      cell.value = v;
      cell.font = { size: 9 };
      cell.alignment = { vertical: "middle", wrapText: i === 3 || i === 7 };
      if (i === 10 || i === 11) {
        cell.alignment = { vertical: "middle", horizontal: "right" };
      }
    });
    if (isIn) {
      row.eachCell({ includeEmpty: true }, (cell) => {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEAF6EA" } };
      });
    } else if (m.kind === "sale" || m.kind === "out" || Number(m.delta) < 0) {
      row.eachCell({ includeEmpty: true }, (cell) => {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFF4E8" } };
      });
    }
    row.commit();
    r += 1;
  }

  if (dayMovements.length === 0) {
    ws.getCell(5, 1).value = "Žádné skladové pohyby v tento den.";
  }

  ws.columns = [
    { width: 6 },
    { width: 18 },
    { width: 10 },
    { width: 36 },
    { width: 14 },
    { width: 18 },
    { width: 22 },
    { width: 28 },
    { width: 14 },
    { width: 14 },
    { width: 12 },
    { width: 12 },
    { width: 14 },
    { width: 14 },
  ];

  const buf = await wb.xlsx.writeBuffer();
  return buf as ArrayBuffer;
}
