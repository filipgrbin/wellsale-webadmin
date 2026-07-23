/**
 * 1:1 port of easytill2/src/lib/closeExport.ts — buildProductDaySummaries + Excel + PDF.
 * Returns file bytes instead of Electron save dialogs.
 */

import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { parseStamp } from "@/lib/uzaverka-exports/time";
import type {
  CloseDaily,
  CloseExportSettings,
  CloseExportSource,
  CloseProduct,
  CloseStockMovement,
  CloseSupplier,
  ProductDaySummary,
} from "@/lib/uzaverka-exports/types";
import { registerCzechFont } from "@/lib/uzaverka-exports/pdf-font";

function dateFmt(iso: string) {
  return parseStamp(iso).toLocaleDateString("cs-CZ", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function timeFmt(iso: string) {
  return parseStamp(iso).toLocaleTimeString("cs-CZ", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

/** Souhrn pohybů skladu za den — jeden řádek na produkt+jméno (rename během dne = 2 řádky). */
export function buildProductDaySummaries(
  dayMovements: CloseStockMovement[],
  products: CloseProduct[],
  suppliers: CloseSupplier[]
): ProductDaySummary[] {
  const productMap = new Map(products.map((p) => [p.id, p]));
  const supplierMap = new Map(suppliers.map((s) => [s.id, s]));
  // Key includes product_name so a mid-day rename in .wsbak yields two stock rows
  // (same as live sklad keyed by observed name when names diverge).
  const byKey = new Map<string, CloseStockMovement[]>();

  for (const m of dayMovements) {
    const nameKey = String(m.product_name || "").trim().toLowerCase();
    const key = `${m.product_id}::${nameKey}`;
    const list = byKey.get(key) || [];
    list.push(m);
    byKey.set(key, list);
  }

  const out: ProductDaySummary[] = [];
  for (const [, mvs] of byKey) {
    const productId = mvs[0].product_id;
    const product = productMap.get(productId);
    // Prefer denormalized name from .wsbak movement (rename-safe)
    const name =
      String(mvs[0]?.product_name || "").trim() ||
      product?.name ||
      `Produkt #${productId}`;
    const subtype = product?.subtype || "";
    const form = product?.form || "";
    const packageSize = product?.package_size || "";
    const label = [name, subtype, form, packageSize].filter(Boolean).join(", ");

    let prijato = 0;
    let vydano = 0;
    let stavZasob = "";
    let lot = product?.lot_number || "";

    const prodSupplier =
      product?.supplier_id != null ? supplierMap.get(product.supplier_id) : null;
    let supplier = prodSupplier
      ? [prodSupplier.name, prodSupplier.address, prodSupplier.ic ? `IČO: ${prodSupplier.ic}` : null]
          .filter(Boolean)
          .join(", ")
      : "";

    for (const m of mvs) {
      const qty = Math.abs(m.delta);
      if (m.delta > 0) {
        prijato += qty;
        if (!supplier) {
          supplier = [m.supplier_name, m.supplier_address, m.supplier_ic ? `IČO: ${m.supplier_ic}` : null]
            .filter(Boolean)
            .join(", ");
        }
        if (m.batch_number) lot = m.batch_number;
      } else {
        vydano += qty;
      }
      if (m.stock_after != null) stavZasob = String(m.stock_after);
      if (!lot && m.batch_number) lot = m.batch_number;
    }

    out.push({
      productId,
      name,
      label,
      subtype,
      form,
      packageSize,
      lot,
      supplier,
      prijato,
      vydano,
      stavZasob,
      moveCount: mvs.length,
    });
  }

  out.sort((a, b) => a.name.localeCompare(b.name, "cs"));
  return out;
}

/** Excel uzávěrky: Přehled + Prodeje + Souhrn produktů (1:1 POS). */
export function buildCloseExcelBuffer(source: CloseExportSource): ArrayBuffer {
  const { close: c, transactions: txs, dayMovements, products, suppliers } = source;
  const summaries = buildProductDaySummaries(dayMovements, products, suppliers);
  const wb = XLSX.utils.book_new();

  const saleRows: Record<string, string | number>[] = [];
  for (const t of txs) {
    const items = Array.isArray(t.items) ? t.items : [];
    if (items.length === 0) {
      saleRows.push({
        "ID transakce": t.id,
        Datum: dateFmt(t.created_at),
        Čas: timeFmt(t.created_at),
        Platba: t.payment_method === "cash" ? "Hotově" : "QR",
        Produkt: "(bez položek)",
        Množství: 0,
        "Cena/ks (Kč)": "",
        "Mezisoučet (Kč)": "",
        "Celkem transakce (Kč)": t.total,
        "Dáno (Kč)": t.cash_given ?? "",
        "Vráceno (Kč)": t.change_returned ?? "",
      });
      continue;
    }
    for (const i of items) {
      saleRows.push({
        "ID transakce": t.id,
        Datum: dateFmt(t.created_at),
        Čas: timeFmt(t.created_at),
        Platba: t.payment_method === "cash" ? "Hotově" : "QR",
        Produkt: i.name_snapshot,
        Množství: i.qty,
        "Cena/ks (Kč)": i.price_snapshot,
        "Mezisoučet (Kč)": i.qty * i.price_snapshot,
        "Celkem transakce (Kč)": t.total,
        "Dáno (Kč)": t.cash_given ?? "",
        "Vráceno (Kč)": t.change_returned ?? "",
      });
    }
  }
  if (saleRows.length === 0) {
    saleRows.push({
      "ID transakce": "",
      Datum: c.close_date,
      Čas: "",
      Platba: "",
      Produkt: "Žádné prodeje",
      Množství: 0,
      "Cena/ks (Kč)": "",
      "Mezisoučet (Kč)": "",
      "Celkem transakce (Kč)": "",
      "Dáno (Kč)": "",
      "Vráceno (Kč)": "",
    });
  }
  const meta = [
    ["WellSale — denní uzávěrka"],
    ["Datum", c.close_date],
    ["Tržba celkem (Kč)", c.total_revenue],
    ["Hotově (Kč)", c.cash_total],
    ["QR (Kč)", c.qr_total],
    ["Transakcí", c.tx_count],
    ["Kusů", c.total_items],
    ["Vygenerováno", new Date().toLocaleString("cs-CZ")],
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(meta), "Přehled");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(saleRows), "Prodeje");

  const summaryRows = summaries.map((s) => ({
    Produkt: s.name,
    Podtyp: s.subtype,
    Forma: s.form,
    Balení: s.packageSize,
    Šarže: s.lot,
    Dodavatel: s.supplier,
    "Přijato (ks)": s.prijato,
    "Vydáno (ks)": s.vydano,
    "Stav zásob (ks)": s.stavZasob,
    "Pohybů celkem": s.moveCount,
  }));
  if (summaryRows.length === 0) {
    summaryRows.push({
      Produkt: "Žádné skladové pohyby",
      Podtyp: "",
      Forma: "",
      Balení: "",
      Šarže: "",
      Dodavatel: "",
      "Přijato (ks)": 0,
      "Vydáno (ks)": 0,
      "Stav zásob (ks)": "",
      "Pohybů celkem": 0,
    });
  }
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(summaryRows), "Souhrn produktů");

  return XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
}

/** PDF souhrn uzávěrky (1:1 POS). */
export async function buildCloseSummaryPdfBuffer(
  close: CloseDaily,
  settings: CloseExportSettings,
  dayMovements: CloseStockMovement[],
  products: CloseProduct[],
  suppliers: CloseSupplier[],
  fontRegularB64: string | null,
  fontBoldB64: string | null
): Promise<Uint8Array> {
  const summaries = buildProductDaySummaries(dayMovements, products, suppliers);
  const shopName = (settings.shop_location || "WellSale").trim();
  const ico = (settings.ico || "").trim();

  const doc = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4",
    putOnlyUsedFonts: true,
  });
  const font = registerCzechFont(doc, fontRegularB64, fontBoldB64);
  const pw = doc.internal.pageSize.getWidth();
  const ph = doc.internal.pageSize.getHeight();

  doc.setFont(font, "bold");
  doc.setFontSize(14);
  doc.text("Denní uzávěrka — souhrn", pw / 2, 16, { align: "center" });
  doc.setFont(font, "normal");
  doc.setFontSize(10);
  doc.text(`${shopName}${ico ? `  ·  IČO: ${ico}` : ""}`, pw / 2, 23, { align: "center" });
  doc.setFont(font, "bold");
  doc.setFontSize(11);
  doc.text(`Datum: ${close.close_date}`, pw / 2, 30, { align: "center" });

  autoTable(doc, {
    startY: 36,
    head: [["Metrika", "Hodnota"]],
    body: [
      ["Tržba celkem", `${close.total_revenue} Kč`],
      ["Hotově", `${close.cash_total} Kč`],
      ["QR", `${close.qr_total} Kč`],
      ["Transakcí", String(close.tx_count)],
      ["Prodaných kusů", String(close.total_items)],
    ],
    styles: { font, fontSize: 9, cellPadding: 2 },
    headStyles: { font, fillColor: [34, 85, 55], textColor: 255, fontStyle: "bold" },
    columnStyles: { 0: { cellWidth: 60 }, 1: { cellWidth: 50, halign: "right" } },
    margin: { left: 40, right: 40 },
  });

  const startY = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY
    ? (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8
    : 80;

  doc.setFont(font, "bold");
  doc.setFontSize(11);
  doc.text("Souhrn produktů (skladové pohyby dne)", 14, startY);

  const body = summaries.length
    ? summaries.map((s, i) => [
        String(i + 1),
        s.label,
        s.lot,
        s.supplier,
        String(s.prijato),
        String(s.vydano),
        s.stavZasob,
      ])
    : [
        [
          {
            content: "Žádné skladové pohyby v tento den.",
            colSpan: 7,
            styles: { halign: "center" as const },
          },
        ],
      ];

  autoTable(doc, {
    startY: startY + 4,
    head: [["#", "Produkt", "Šarže", "Dodavatel", "Přijato", "Vydáno", "Stav"]],
    body: body as never,
    styles: { font, fontSize: 7, cellPadding: 1.2, overflow: "linebreak" },
    headStyles: {
      font,
      fillColor: [34, 85, 55],
      textColor: 255,
      fontSize: 6.5,
      fontStyle: "bold",
      halign: "center",
    },
    columnStyles: {
      0: { cellWidth: 8, halign: "center" },
      1: { cellWidth: 55 },
      2: { cellWidth: 24 },
      3: { cellWidth: 48 },
      4: { cellWidth: 18, halign: "center" },
      5: { cellWidth: 18, halign: "center" },
      6: { cellWidth: 16, halign: "center" },
    },
    margin: { left: 10, right: 10 },
  });

  doc.setFont(font, "normal");
  doc.setFontSize(7);
  doc.setTextColor(120);
  doc.text(
    `Vygenerováno: ${new Date().toLocaleString("cs-CZ")}  |  WellSale POS`,
    10,
    ph - 6
  );

  const out = doc.output("arraybuffer");
  return new Uint8Array(out);
}
