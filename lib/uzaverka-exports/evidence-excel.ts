/**
 * 1:1 port of easytill2/src/lib/evidenceExcel.ts — denní evidence PML.
 * Loads template from disk (ArrayBuffer) instead of fetch/IPC.
 *
 * Příjmy a výdeje jsou VŽDY oddělené řádky (souhrn za den / pohyb).
 * Každý záznam = produktový řádek + řádek „MNOŽSTVÍ CELKEM ks“.
 */

import ExcelJS from "exceljs";
import { formatReceiptNumber } from "@/lib/uzaverka-exports/time";
import type { CloseExportSource, CloseStockMovement } from "@/lib/uzaverka-exports/types";

function dateFmtCz(iso: string): string {
  return new Date(iso).toLocaleDateString("cs-CZ", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function productLabel(
  p:
    | { name?: string; subtype?: string | null; form?: string | null; package_size?: string | null }
    | null
    | undefined
): string {
  return [p?.name, p?.subtype, p?.form, p?.package_size]
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

function supplierLabel(
  sp: { name?: string; address?: string; ic?: string } | null | undefined,
  m?: CloseStockMovement
): string {
  if (m && (m.supplier_name || m.supplier_address || m.supplier_ic)) {
    return [m.supplier_name, m.supplier_address, m.supplier_ic ? `IČ: ${m.supplier_ic}` : null]
      .filter(Boolean)
      .join(" - ");
  }
  if (!sp) return "";
  return [sp.name, sp.address, sp.ic ? `IČ: ${sp.ic}` : null].filter(Boolean).join(" - ");
}

function saleDocNo(m: CloseStockMovement, prefix?: string | null): string {
  if (m.document_number) return String(m.document_number);
  if (m.transaction_id) return formatReceiptNumber(m.transaction_id, prefix);
  return "";
}

type Sale = { doc: string; qty: number };

/** Jedna evidence-položka = buď jen příjem, nebo jen výdej (nikdy obojí najednou). */
type EvidenceEntry = {
  kind: "in" | "out";
  product: { name?: string; id?: number; subtype?: string | null; form?: string | null; package_size?: string | null; lot_number?: string | null; supplier_id?: number | null };
  sarze: string;
  dodavatel: string;
  prijato: number;
  prijemDate: string;
  prijemDoklad: string;
  sales: Sale[];
  stav: number | "";
  sortAt: string;
};

export async function buildDailyEvidenceExcelBuffer(
  source: CloseExportSource,
  templateBytes: ArrayBuffer | Uint8Array | Buffer
): Promise<ArrayBuffer> {
  const closeDate = source.close.close_date;
  const settings = source.settings as Record<string, string>;
  const products = source.products;
  const suppliers = source.suppliers;
  const movements = source.dayMovements;

  const supplierMap = new Map(suppliers.map((s) => [s.id, s]));
  const productMap = new Map(products.map((p) => [p.id, p]));
  const prefix = settings.receipt_prefix || "TX";

  const day = closeDate.slice(8, 10);
  const mon = closeDate.slice(5, 7);
  const year = closeDate.slice(0, 4);
  const docId = `D${day}M${mon}`;
  const pvDoc = `PV${day}${mon}${year}`;
  const dayLabel = dateFmtCz(`${closeDate}T12:00:00`);

  const wb = new ExcelJS.Workbook();
  const ab =
    templateBytes instanceof ArrayBuffer
      ? templateBytes
      : templateBytes.buffer.slice(
          templateBytes.byteOffset,
          templateBytes.byteOffset + templateBytes.byteLength
        );
  await wb.xlsx.load(ab as ArrayBuffer);
  const ws1 = wb.worksheets[0];
  const ws2 = wb.worksheets[1];
  ws1.name = `DENNÍ PRODEJ ${pvDoc}`.slice(0, 31);
  ws2.name = `${docId} Evidence`.slice(0, 31);

  try {
    ws1.getCell(1, 1).value = docId;
  } catch {
    /* */
  }
  try {
    ws2.getCell(1, 1).value = docId;
  } catch {
    /* */
  }

  // Smaž ukázková data (řádek 3+), mergované „MNOŽSTVÍ…“ obnovíme při zápisu.
  for (const ws of [ws1, ws2]) {
    try {
      const merges = [...(((ws as unknown as { model?: { merges?: string[] } }).model?.merges) || [])];
      for (const m of merges) {
        if (/^A1:/i.test(m)) continue;
        try {
          ws.unMergeCells(m);
        } catch {
          /* */
        }
      }
    } catch {
      /* */
    }
    const last = Math.max(ws.rowCount || 0, 40);
    for (let r = 3; r <= last; r++) {
      ws.getRow(r).eachCell({ includeEmpty: true }, (cell) => {
        cell.value = null;
      });
    }
  }

  // ── Oddělené příjmy (1 pohyb = 1 záznam) + výdeje (seskupení produkt+šarže) ─
  const entries: EvidenceEntry[] = [];
  const outByKey = new Map<string, EvidenceEntry>();

  const sortedMovements = [...movements].sort((a, b) =>
    String(a.created_at || "").localeCompare(String(b.created_at || ""))
  );

  for (const m of sortedMovements) {
    if (m.kind === "adjust") continue;
    const catalog = productMap.get(m.product_id);
    const observedName = String(m.product_name || catalog?.name || "").trim();
    const product = {
      ...(catalog || {}),
      id: m.product_id,
      name: observedName || catalog?.name || `Produkt #${m.product_id}`,
    };
    const sarze = String(m.batch_number || product.lot_number || "").trim();
    const qty = Math.abs(Number(m.delta) || 0);
    if (qty <= 0) continue;

    if (m.delta > 0) {
      const prodSupplier =
        product.supplier_id != null ? supplierMap.get(product.supplier_id) : null;
      entries.push({
        kind: "in",
        product,
        sarze,
        dodavatel: supplierLabel(null, m) || supplierLabel(prodSupplier),
        prijato: qty,
        prijemDate: dateFmtCz(String(m.created_at || "")),
        prijemDoklad: String(m.batch_document || m.document_number || m.batch_doc_number || ""),
        sales: [],
        stav: m.stock_after != null ? Number(m.stock_after) : "",
        sortAt: String(m.created_at || ""),
      });
      continue;
    }

    // Výdej: souhrn za den (produkt + pozorované jméno + šarže)
    const key = `${m.product_id}::${observedName.toLowerCase()}::${sarze}`;
    let g = outByKey.get(key);
    if (!g) {
      const prodSupplier =
        product.supplier_id != null ? supplierMap.get(product.supplier_id) : null;
      g = {
        kind: "out",
        product,
        sarze,
        dodavatel: supplierLabel(prodSupplier),
        prijato: 0,
        prijemDate: "",
        prijemDoklad: "",
        sales: [],
        stav: "",
        sortAt: String(m.created_at || ""),
      };
      outByKey.set(key, g);
      entries.push(g);
    }
    g.sales.push({ doc: saleDocNo(m, prefix), qty });
    if (m.stock_after != null) g.stav = Number(m.stock_after);
  }

  entries.sort((a, b) => a.sortAt.localeCompare(b.sortAt));

  // ── List 1: DENNÍ PRODEJ ──────────────────────────────────────────────────
  const DOC_FIRST = 6; // F
  const DOC_LAST = 28; // AB
  const DOC_SLOTS = DOC_LAST - DOC_FIRST + 1;

  let r1 = 3;
  let order1 = 0;
  for (const g of entries) {
    order1 += 1;
    const issued = g.sales.reduce((s, x) => s + x.qty, 0);
    const celkem =
      typeof g.stav === "number"
        ? g.kind === "out"
          ? g.stav + issued
          : g.stav
        : g.kind === "in"
          ? g.prijato
          : issued;
    const slotSales = g.kind === "out" ? g.sales.slice(0, DOC_SLOTS) : [];
    const overflow = g.kind === "out" && g.sales.length > DOC_SLOTS;

    const prodRow = ws1.getRow(r1);
    prodRow.getCell(1).value = String(order1);
    prodRow.getCell(2).value = productLabel(g.product);
    if (g.kind === "in") {
      prodRow.getCell(3).value = g.prijemDate || "";
      prodRow.getCell(5).value = g.prijemDoklad || "";
    } else {
      prodRow.getCell(4).value = dayLabel;
      for (let i = 0; i < slotSales.length; i++) {
        prodRow.getCell(DOC_FIRST + i).value = slotSales[i].doc || null;
      }
    }
    prodRow.getCell(29).value = g.sarze;
    prodRow.getCell(30).value = g.dodavatel;
    prodRow.getCell(31).value = g.kind === "in" ? g.prijato || 0 : 0;
    prodRow.getCell(32).value = celkem || 0;
    if (g.kind === "out") {
      if (overflow) {
        prodRow.getCell(33).value = issued;
        prodRow.getCell(34).value = (celkem || 0) - issued;
      } else {
        prodRow.getCell(33).value = { formula: `SUM(F${r1 + 1}:AB${r1 + 1})` };
        prodRow.getCell(34).value = { formula: `AF${r1}-AG${r1}` };
      }
    } else {
      prodRow.getCell(33).value = 0;
      prodRow.getCell(34).value = { formula: `AF${r1}-AG${r1}` };
    }
    prodRow.getCell(35).value = "";
    prodRow.commit();

    r1 += 1;
    const sumRow = ws1.getRow(r1);
    try {
      ws1.mergeCells(r1, 1, r1, 5);
    } catch {
      /* */
    }
    sumRow.getCell(1).value = "MNOŽSTVÍ CELKEM ks";
    if (g.kind === "out") {
      for (let i = 0; i < slotSales.length; i++) {
        sumRow.getCell(DOC_FIRST + i).value = slotSales[i].qty || 0;
      }
      if (overflow) {
        const rest = g.sales.slice(DOC_SLOTS).reduce((s, x) => s + x.qty, 0);
        if (slotSales.length > 0) {
          const last = DOC_FIRST + slotSales.length - 1;
          sumRow.getCell(last).value = (slotSales[slotSales.length - 1].qty || 0) + rest;
        } else {
          sumRow.getCell(DOC_FIRST).value = issued;
        }
      }
    }
    sumRow.commit();
    r1 += 1;
  }
  if (entries.length === 0) {
    ws1.getRow(3).getCell(1).value = "Žádné pohyby skladu v tento den.";
  }

  // ── List 2: Evidence — oddělený příjem / výdej (souhrnné řádky) ────────────
  let r2 = 3;
  let order2 = 0;
  for (const g of entries) {
    order2 += 1;
    const issued = g.sales.reduce((s, x) => s + x.qty, 0);
    const celkem =
      typeof g.stav === "number"
        ? g.kind === "out"
          ? g.stav + issued
          : g.stav
        : g.kind === "in"
          ? g.prijato
          : issued;
    const prodR = r2;
    const sumR = r2 + 1;

    const prodRow = ws2.getRow(prodR);
    prodRow.getCell(1).value = String(order2);
    prodRow.getCell(2).value = productLabel(g.product);
    if (g.kind === "in") {
      prodRow.getCell(3).value = g.prijemDate || "";
      prodRow.getCell(5).value = g.prijemDoklad || "";
      prodRow.getCell(6).value = null;
      prodRow.getCell(9).value = g.prijato || 0;
    } else {
      prodRow.getCell(4).value = dayLabel;
      prodRow.getCell(6).value = issued > 0 ? pvDoc : null;
      prodRow.getCell(9).value = 0;
    }
    prodRow.getCell(7).value = g.sarze;
    prodRow.getCell(8).value = g.dodavatel;
    prodRow.getCell(10).value = celkem || 0;
    prodRow.getCell(11).value = { formula: `SUM(F${sumR}:F${sumR})` };
    prodRow.getCell(12).value = { formula: `J${prodR}-K${prodR}` };
    prodRow.getCell(13).value = "";
    prodRow.commit();

    const sumRow = ws2.getRow(sumR);
    try {
      ws2.mergeCells(sumR, 1, sumR, 5);
    } catch {
      /* */
    }
    sumRow.getCell(1).value = "MNOŽSTVÍ CELKEM ks";
    sumRow.getCell(6).value = g.kind === "out" ? issued || 0 : 0;
    sumRow.commit();

    r2 += 2;
  }
  if (entries.length === 0) {
    ws2.getRow(3).getCell(1).value = "Žádné pohyby skladu v tento den.";
  }

  const buf = await wb.xlsx.writeBuffer();
  return buf as ArrayBuffer;
}
