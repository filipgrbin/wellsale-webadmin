/**
 * Extract close-export source from decrypted uzaverka SQLite (closeSnapshot layout).
 */

import type {
  CloseDaily,
  CloseExportSettings,
  CloseExportSource,
  CloseProduct,
  CloseStockMovement,
  CloseTransaction,
  CloseTxItem,
} from "@/lib/uzaverka-exports/types";
import { localDayKey } from "@/lib/uzaverka-exports/time";

export async function extractCloseExportSource(
  sqliteBuffer: Buffer,
  settings: CloseExportSettings = {}
): Promise<CloseExportSource> {
  const fs = await import("fs/promises");
  const path = await import("path");
  const os = await import("os");
  const Database = (await import("better-sqlite3")).default;

  const tempFile = path.join(
    os.tmpdir(),
    `uzaverka-export-${Date.now()}-${Math.random().toString(36).slice(2)}.db`
  );
  await fs.writeFile(tempFile, sqliteBuffer);

  const db = new Database(tempFile, { readonly: true });
  try {
    const tables = (
      db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as { name: string }[]
    ).map((r) => r.name.toLowerCase());

    let close: CloseDaily | null = null;
    if (tables.includes("daily_closes")) {
      const row = db
        .prepare("SELECT * FROM daily_closes ORDER BY rowid DESC LIMIT 1")
        .get() as Record<string, unknown> | undefined;
      if (row) {
        close = {
          close_date: String(row.close_date || ""),
          total_revenue: Number(row.total_revenue || 0),
          cash_total: Number(row.cash_total || 0),
          qr_total: Number(row.qr_total || 0),
          tx_count: Number(row.tx_count || 0),
          total_items: Number(row.total_items || 0),
        };
      }
    }
    if (!close?.close_date) {
      throw new Error("Uzávěrka v souboru nenalezena (daily_closes)");
    }
    const closeDate = close.close_date;

    const itemsByTx = new Map<number, CloseTxItem[]>();
    /** detail_snapshot z položek — fallback pro form / balení / šarži když chybí products. */
    const detailByProductId = new Map<
      number,
      { form?: string; package_size?: string; lot_number?: string }
    >();
    if (tables.includes("transaction_items")) {
      const itemRows = db
        .prepare("SELECT * FROM transaction_items")
        .all() as Record<string, unknown>[];
      for (const obj of itemRows) {
        const txId = Number(obj.transaction_id || 0);
        if (!txId) continue;
        const list = itemsByTx.get(txId) || [];
        list.push({
          name_snapshot: String(obj.name_snapshot || obj.product_name || obj.name || ""),
          qty: Number(obj.qty || obj.quantity || 0),
          price_snapshot: Number(obj.price_snapshot || obj.price || 0),
        });
        itemsByTx.set(txId, list);

        const pid = obj.product_id == null ? 0 : Number(obj.product_id);
        if (pid && obj.detail_snapshot && !detailByProductId.has(pid)) {
          try {
            const d = JSON.parse(String(obj.detail_snapshot)) as {
              form?: string | null;
              package_size?: string | null;
              lot_number?: string | null;
            };
            detailByProductId.set(pid, {
              form: d.form?.trim() || undefined,
              package_size: d.package_size?.trim() || undefined,
              lot_number: d.lot_number?.trim() || undefined,
            });
          } catch {
            /* ignore */
          }
        }
      }
    }

    const transactions: CloseTransaction[] = [];
    if (tables.includes("transactions")) {
      const txRows = db
        .prepare("SELECT * FROM transactions ORDER BY id ASC")
        .all() as Record<string, unknown>[];
      for (const obj of txRows) {
        const created = String(obj.created_at || "");
        if (created) {
          const dayMatch =
            localDayKey(created) === closeDate ||
            created.startsWith(closeDate) ||
            created.includes(closeDate);
          if (!dayMatch) continue;
        }
        const id = Number(obj.id || 0);
        transactions.push({
          id,
          created_at: created,
          payment_method: String(obj.payment_method || "cash"),
          total: Number(obj.total || 0),
          cash_given: obj.cash_given == null ? null : Number(obj.cash_given),
          change_returned: obj.change_returned == null ? null : Number(obj.change_returned),
          items: itemsByTx.get(id) || [],
        });
      }
    }

    const dayMovements: CloseStockMovement[] = [];
    if (tables.includes("stock_movements")) {
      const smRows = db
        .prepare("SELECT * FROM stock_movements ORDER BY id ASC")
        .all() as Record<string, unknown>[];
      for (const obj of smRows) {
        dayMovements.push({
          id: Number(obj.id || 0),
          product_id: Number(obj.product_id || 0),
          product_name: String(obj.product_name || ""),
          delta: Number(obj.delta || 0),
          kind: String(obj.kind || ""),
          created_at: String(obj.created_at || ""),
          transaction_id: obj.transaction_id == null ? null : Number(obj.transaction_id),
          document_number: obj.document_number == null ? null : String(obj.document_number),
          batch_number: obj.batch_number == null ? null : String(obj.batch_number),
          batch_document: obj.batch_document == null ? null : String(obj.batch_document),
          batch_doc_number: obj.batch_doc_number == null ? null : String(obj.batch_doc_number),
          stock_after: obj.stock_after == null ? null : Number(obj.stock_after),
          supplier_name: obj.supplier_name == null ? null : String(obj.supplier_name),
          supplier_address: obj.supplier_address == null ? null : String(obj.supplier_address),
          supplier_ic: obj.supplier_ic == null ? null : String(obj.supplier_ic),
        });
      }
    }

    // products — only from this .wsbak (no live API).
    // Unique (product_id, product_name) so a mid-day rename keeps both names.
    const products: CloseProduct[] = [];
    const seen = new Set<string>();
    for (const m of dayMovements) {
      if (!m.product_id) continue;
      const name = String(m.product_name || "").trim();
      const key = `${m.product_id}::${name.toLowerCase()}`;
      if (seen.has(key)) continue;
      seen.add(key);
      products.push({
        id: m.product_id,
        name: name || `Produkt #${m.product_id}`,
        lot_number: m.batch_number || null,
      });
    }
    // Catalog from snapshot (new closes) + detail_snapshot fallback
    const catalogById = new Map<number, Record<string, unknown>>();
    if (tables.includes("products")) {
      try {
        const prodRows = db.prepare("SELECT * FROM products").all() as Record<string, unknown>[];
        for (const row of prodRows) {
          const id = Number(row.id);
          if (!id) continue;
          catalogById.set(id, row);
          if (!products.some((p) => p.id === id)) {
            products.push({
              id,
              name: String(row.name || `Produkt #${id}`),
              subtype: row.subtype == null ? null : String(row.subtype),
              form: row.form == null ? null : String(row.form),
              package_size: row.package_size == null ? null : String(row.package_size),
              lot_number: row.lot_number == null ? null : String(row.lot_number),
              supplier_id: row.supplier_id == null ? null : Number(row.supplier_id),
            });
          }
        }
      } catch {
        /* ignore */
      }
    }
    for (const p of products) {
      const cat = catalogById.get(p.id);
      if (cat) {
        p.subtype = cat.subtype == null ? p.subtype ?? null : String(cat.subtype);
        p.form = cat.form == null ? p.form ?? null : String(cat.form);
        p.package_size =
          cat.package_size == null ? p.package_size ?? null : String(cat.package_size);
        p.lot_number = cat.lot_number == null ? p.lot_number ?? null : String(cat.lot_number);
        p.supplier_id =
          cat.supplier_id == null ? p.supplier_id ?? null : Number(cat.supplier_id);
        if (!p.name) p.name = String(cat.name || "");
      }
      const det = detailByProductId.get(p.id);
      if (det) {
        if (!p.form && det.form) p.form = det.form;
        if (!p.package_size && det.package_size) p.package_size = det.package_size;
        if (!p.lot_number && det.lot_number) p.lot_number = det.lot_number;
      }
    }

    const suppliers: CloseExportSource["suppliers"] = [];
    if (tables.includes("suppliers")) {
      try {
        const rows = db.prepare("SELECT * FROM suppliers").all() as Record<string, unknown>[];
        for (const s of rows) {
          suppliers.push({
            id: Number(s.id),
            name: String(s.name || ""),
            address: s.address == null ? undefined : String(s.address),
            ic: s.ic == null ? undefined : String(s.ic),
          });
        }
      } catch {
        /* ignore */
      }
    }

    return {
      close,
      transactions,
      dayMovements,
      products,
      suppliers,
      settings: {
        shop_location: settings.shop_location || "WellSale",
        ico: settings.ico || "",
        receipt_prefix: settings.receipt_prefix || "TX",
      },
    };
  } finally {
    db.close();
    try {
      await fs.unlink(tempFile);
    } catch {
      /* ignore */
    }
  }
}
