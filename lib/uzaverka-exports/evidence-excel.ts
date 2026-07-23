/**
 * 1:1 port of easytill2/src/lib/evidenceExcel.ts — denní evidence PML.
 * Loads template from disk (ArrayBuffer) instead of fetch/IPC.
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

function productLabel(p: { name?: string; subtype?: string | null; form?: string | null; package_size?: string | null } | null | undefined): string {
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

export async function buildDailyEvidenceExcelBuffer(
  source: CloseExportSource,
  templateBytes: ArrayBuffer | Uint8Array | Buffer
): Promise<ArrayBuffer> {
  const { closeDate, settings, products, suppliers, movements } = {
    closeDate: source.close.close_date,
    settings: source.settings as Record<string, string>,
    products: source.products,
    suppliers: source.suppliers,
    movements: source.dayMovements,
  };

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

  for (const ws of [ws1, ws2]) {
    const last = Math.max(ws.rowCount || 0, 40);
    for (let r = 3; r <= last; r++) {
      ws.getRow(r).eachCell({ includeEmpty: true }, (cell) => {
        cell.value = null;
      });
    }
  }

  type Sale = { doc: string; qty: number };
  type Group = {
    product: (typeof products)[number] | { name?: string; id: number };
    sarze: string;
    dodavatel: string;
    prijato: number;
    sales: Sale[];
    stav: number | "";
    order: number;
    mvs: CloseStockMovement[];
  };
  const groups = new Map<string, Group>();
  let order = 0;
  for (const m of movements) {
    if (m.kind === "adjust") continue;
    const product = productMap.get(m.product_id) ?? { name: m.product_name, id: m.product_id };
    const observedName = String(m.product_name || product.name || "").trim();
    const sarze = String(m.batch_number || (product as { lot_number?: string }).lot_number || "").trim();
    // Include observed name so mid-day rename in .wsbak → separate evidence rows
    const key = `${m.product_id}::${observedName.toLowerCase()}::${sarze}`;
    if (!groups.has(key)) {
      const prodSupplier =
        (product as { supplier_id?: number | null }).supplier_id != null
          ? supplierMap.get((product as { supplier_id: number }).supplier_id)
          : null;
      order += 1;
      groups.set(key, {
        product: observedName ? { ...product, name: observedName } : product,
        sarze,
        dodavatel: supplierLabel(prodSupplier),
        prijato: 0,
        sales: [],
        stav: "",
        order,
        mvs: [],
      });
    }
    const g = groups.get(key)!;
    g.mvs.push(m);
    const qty = Math.abs(Number(m.delta) || 0);
    if (m.delta > 0) {
      g.prijato += qty;
      if (m.supplier_name || m.supplier_address) g.dodavatel = supplierLabel(null, m) || g.dodavatel;
    } else {
      const doc = saleDocNo(m, prefix);
      if (doc) g.sales.push({ doc, qty });
      else g.sales.push({ doc: "", qty });
    }
    if (m.stock_after != null) g.stav = Number(m.stock_after);
  }

  const DOC_FIRST = 6;
  const DOC_LAST = 28;
  const DOC_SLOTS = DOC_LAST - DOC_FIRST + 1;

  let r1 = 3;
  const sorted = [...groups.values()].sort((a, b) => a.order - b.order);
  for (const g of sorted) {
    const issued = g.sales.reduce((s, x) => s + x.qty, 0);
    const celkem = typeof g.stav === "number" ? g.stav + issued : g.prijato;
    const slotSales = g.sales.slice(0, DOC_SLOTS);
    const overflow = g.sales.length > DOC_SLOTS;

    const prodRow = ws1.getRow(r1);
    prodRow.getCell(1).value = String(g.order);
    prodRow.getCell(2).value = productLabel(g.product);
    prodRow.getCell(4).value = dayLabel;
    for (let i = 0; i < slotSales.length; i++) {
      prodRow.getCell(DOC_FIRST + i).value = slotSales[i].doc || null;
    }
    prodRow.getCell(29).value = g.sarze;
    prodRow.getCell(30).value = g.dodavatel;
    prodRow.getCell(31).value = g.prijato || 0;
    prodRow.getCell(32).value = celkem || 0;
    if (overflow) {
      prodRow.getCell(33).value = issued;
      prodRow.getCell(34).value = (celkem || 0) - issued;
    } else {
      prodRow.getCell(33).value = { formula: `SUM(F${r1 + 1}:AB${r1 + 1})` };
      prodRow.getCell(34).value = { formula: `AF${r1}-AG${r1}` };
    }
    prodRow.getCell(35).value = "";
    prodRow.commit();

    r1 += 1;
    const sumRow = ws1.getRow(r1);
    sumRow.getCell(1).value = "MNOŽSTVÍ CELKEM ks";
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
    sumRow.commit();
    r1 += 1;
  }
  if (sorted.length === 0) {
    ws1.getRow(3).getCell(1).value = "Žádné pohyby skladu v tento den.";
  }

  let r2 = 3;
  let n = 0;
  for (const g of sorted) {
    let totalPrijato = 0;
    let totalVydano = 0;
    let lastStav: number | "" = "";

    for (const m of g.mvs) {
      const isIn = m.delta > 0;
      const qty = Math.abs(Number(m.delta) || 0);
      const prodSupplier =
        (g.product as { supplier_id?: number | null }).supplier_id != null
          ? supplierMap.get((g.product as { supplier_id: number }).supplier_id)
          : null;
      const dodavatel = isIn
        ? supplierLabel(null, m) || supplierLabel(prodSupplier) || g.dodavatel
        : supplierLabel(prodSupplier) || g.dodavatel;
      const dokladPrijmu = isIn
        ? m.batch_document || m.document_number || m.batch_doc_number || ""
        : "";
      const dokladVydeje = !isIn ? saleDocNo(m, prefix) : "";
      const stav = m.stock_after != null ? Number(m.stock_after) : "";
      if (stav !== "") lastStav = stav;
      if (isIn) totalPrijato += qty;
      else totalVydano += qty;
      n += 1;

      const row = ws2.getRow(r2);
      row.getCell(1).value = String(n);
      row.getCell(2).value = productLabel(g.product);
      row.getCell(3).value = isIn ? dateFmtCz(String(m.created_at || "")) : "";
      row.getCell(4).value = !isIn ? dateFmtCz(String(m.created_at || "")) : "";
      row.getCell(5).value = dokladPrijmu;
      row.getCell(6).value = dokladVydeje;
      row.getCell(7).value = g.sarze;
      row.getCell(8).value = dodavatel;
      row.getCell(9).value = isIn ? qty : "";
      row.getCell(10).value = "";
      row.getCell(11).value = !isIn ? qty : "";
      row.getCell(12).value = stav === "" ? "" : stav;
      row.getCell(13).value = "";
      row.commit();
      r2 += 1;
    }

    const sum = ws2.getRow(r2);
    sum.getCell(1).value = "MNOŽSTVÍ CELKEM ks";
    sum.getCell(9).value = totalPrijato;
    sum.getCell(11).value = totalVydano;
    sum.getCell(12).value = lastStav === "" ? "" : lastStav;
    sum.commit();
    r2 += 1;
  }
  if (sorted.length === 0) {
    ws2.getRow(3).getCell(1).value = "Žádné pohyby skladu v tento den.";
  }

  const buf = await wb.xlsx.writeBuffer();
  return buf as ArrayBuffer;
}
