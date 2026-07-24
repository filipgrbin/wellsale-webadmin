/**
 * Extract close-export source from decrypted uzaverka SQLite (.wsbak → plain .db).
 * Enrich movements the same way POS listStockMovements does (JOIN products/batches/suppliers/users)
 * whenever those tables exist in the snapshot.
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

function tableColumns(db: { prepare: (sql: string) => { all: () => unknown[] } }, table: string): Set<string> {
  try {
    const rows = db.prepare(`PRAGMA table_info(${table})`).all() as { name?: string }[];
    return new Set(rows.map((r) => String(r.name || "").toLowerCase()).filter(Boolean));
  } catch {
    return new Set();
  }
}

function str(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s ? s : null;
}

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
    const has = (t: string) => tables.includes(t);

    let close: CloseDaily | null = null;
    if (has("daily_closes")) {
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
    const detailByProductId = new Map<
      number,
      { form?: string; package_size?: string; lot_number?: string }
    >();
    if (has("transaction_items")) {
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
    if (has("transactions")) {
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

    // ── stock_movements — JOIN jako POS listStockMovements, jen z tabulek v .wsbak ──
    const dayMovements: CloseStockMovement[] = [];
    if (has("stock_movements")) {
      const smCols = tableColumns(db, "stock_movements");
      const joinProducts = has("products");
      const joinBatches = has("batches");
      const joinSuppliers = has("suppliers");
      const joinUsers = has("users");
      const supCols = joinSuppliers ? tableColumns(db, "suppliers") : new Set<string>();
      const hasSupCountry = supCols.has("country");

      const selectParts = ["sm.*"];
      if (joinProducts) {
        selectParts.push(
          "p.subtype AS _subtype",
          "p.form AS _form",
          "p.package_size AS _package_size",
          "p.lot_number AS _product_lot",
          "p.supplier_id AS _product_supplier_id"
        );
      }
      if (joinBatches) {
        selectParts.push("b.batch_number AS _batch_number", "b.document_number AS _batch_document");
        if (joinSuppliers) {
          selectParts.push(
            "s.name AS _batch_sup_name",
            "s.address AS _batch_sup_address",
            "s.ic AS _batch_sup_ic",
            hasSupCountry ? "s.country AS _batch_sup_country" : "NULL AS _batch_sup_country"
          );
        }
      }
      if (joinProducts && joinSuppliers) {
        selectParts.push(
          "ps.name AS _prod_sup_name",
          "ps.address AS _prod_sup_address",
          "ps.ic AS _prod_sup_ic",
          hasSupCountry ? "ps.country AS _prod_sup_country" : "NULL AS _prod_sup_country"
        );
      }
      if (joinUsers) {
        selectParts.push("u.name AS _user_name");
      }

      let sql = `SELECT ${selectParts.join(",\n          ")} FROM stock_movements sm`;
      if (joinProducts) sql += " LEFT JOIN products p ON p.id = sm.product_id";
      if (joinBatches) sql += " LEFT JOIN batches b ON b.id = sm.batch_id";
      if (joinBatches && joinSuppliers) sql += " LEFT JOIN suppliers s ON s.id = b.supplier_id";
      if (joinProducts && joinSuppliers) {
        sql += " LEFT JOIN suppliers ps ON ps.id = p.supplier_id";
      }
      if (joinUsers) sql += " LEFT JOIN users u ON u.id = sm.user_id";

      // Soft-delete — jen když sloupec existuje
      if (smCols.has("deleted_at")) {
        sql += " WHERE (sm.deleted_at IS NULL OR sm.deleted_at = '')";
      }
      sql += " ORDER BY sm.id ASC";

      let smRows: Record<string, unknown>[] = [];
      try {
        smRows = db.prepare(sql).all() as Record<string, unknown>[];
      } catch (e) {
        // Fallback: raw movements without joins (starší / poškozené schéma)
        console.warn("[extractCloseExportSource] enriched SELECT failed, fallback:", e);
        smRows = db
          .prepare("SELECT * FROM stock_movements ORDER BY id ASC")
          .all() as Record<string, unknown>[];
      }
      for (const obj of smRows) {
        const created = String(obj.created_at || "");
        // Snapshot uzávěrky je typicky už jen ten den — přesto filtruj, kdyby šlo o plnější DB.
        if (created) {
          const dayMatch =
            localDayKey(created) === closeDate ||
            created.startsWith(closeDate) ||
            created.includes(closeDate);
          if (!dayMatch) continue;
        }

        const batchNumber =
          str(obj.batch_number) ||
          str(obj._batch_number) ||
          str(obj._product_lot) ||
          null;
        const batchDocument =
          str(obj.batch_document) ||
          str(obj._batch_document) ||
          str(obj.batch_doc_number) ||
          null;

        const supplierName =
          str(obj.supplier_name) ||
          str(obj._batch_sup_name) ||
          str(obj._prod_sup_name) ||
          null;
        const supplierAddress =
          str(obj.supplier_address) ||
          str(obj._batch_sup_address) ||
          str(obj._prod_sup_address) ||
          null;
        const supplierIc =
          str(obj.supplier_ic) ||
          str(obj._batch_sup_ic) ||
          str(obj._prod_sup_ic) ||
          null;
        const supplierCountry =
          str(obj.supplier_country) ||
          str(obj._batch_sup_country) ||
          str(obj._prod_sup_country) ||
          null;

        const userName = str(obj.user_name) || str(obj._user_name) || null;

        dayMovements.push({
          id: Number(obj.id || 0),
          product_id: Number(obj.product_id || 0),
          product_name: String(obj.product_name || ""),
          delta: Number(obj.delta || 0),
          kind: String(obj.kind || ""),
          created_at: created,
          transaction_id: obj.transaction_id == null ? null : Number(obj.transaction_id),
          document_number: str(obj.document_number),
          batch_number: batchNumber,
          batch_document: batchDocument,
          batch_doc_number: str(obj.batch_doc_number),
          stock_after: obj.stock_after == null ? null : Number(obj.stock_after),
          supplier_name: supplierName,
          supplier_address: supplierAddress,
          supplier_ic: supplierIc,
          supplier_country: supplierCountry,
          user_name: userName,
          subtype: str(obj._subtype) ?? str(obj.subtype),
          form: str(obj._form) ?? str(obj.form),
          package_size: str(obj._package_size) ?? str(obj.package_size),
        });
      }
    }

    // products katalog z .wsbak
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
        subtype: m.subtype ?? null,
        form: m.form ?? null,
        package_size: m.package_size ?? null,
        lot_number: m.batch_number || null,
      });
    }

    const catalogById = new Map<number, Record<string, unknown>>();
    if (has("products")) {
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

    // Doplň šarži na pohyby z katalogu (příjem nemá batch — šarže = products.lot_number)
    for (const m of dayMovements) {
      if (!m.batch_number) {
        const cat = catalogById.get(m.product_id);
        const lot = cat?.lot_number != null ? String(cat.lot_number).trim() : "";
        if (lot) m.batch_number = lot;
        else if (m.product_id) {
          const det = detailByProductId.get(m.product_id);
          if (det?.lot_number) m.batch_number = det.lot_number;
        }
      }
      const cat = catalogById.get(m.product_id);
      if (cat) {
        if (!m.subtype && cat.subtype != null) m.subtype = String(cat.subtype);
        if (!m.form && cat.form != null) m.form = String(cat.form);
        if (!m.package_size && cat.package_size != null) {
          m.package_size = String(cat.package_size);
        }
      }
    }

    const suppliers: CloseExportSource["suppliers"] = [];
    if (has("suppliers")) {
      try {
        const rows = db.prepare("SELECT * FROM suppliers").all() as Record<string, unknown>[];
        for (const s of rows) {
          suppliers.push({
            id: Number(s.id),
            name: String(s.name || ""),
            address: s.address == null ? undefined : String(s.address),
            ic: s.ic == null ? undefined : String(s.ic),
            country:
              s.country == null || s.country === undefined
                ? undefined
                : String(s.country),
          });
        }
      } catch {
        /* ignore */
      }
    }

    // Shop settings z .wsbak pokud existují
    let shopLocation = settings.shop_location || "WellSale";
    let ico = settings.ico || "";
    let shopAddress = settings.shop_address || "";
    let receiptPrefix = settings.receipt_prefix || "TX";
    if (has("settings")) {
      try {
        const rows = db.prepare("SELECT key, value FROM settings").all() as {
          key?: string;
          value?: string;
        }[];
        const map = new Map(rows.map((r) => [String(r.key || ""), String(r.value ?? "")]));
        if (map.get("shop_location")) shopLocation = map.get("shop_location")!;
        if (map.get("ico")) ico = map.get("ico")!;
        if (map.get("shop_address")) shopAddress = map.get("shop_address")!;
        if (map.get("receipt_prefix")) receiptPrefix = map.get("receipt_prefix")!;
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
        shop_location: shopLocation,
        shop_address: shopAddress,
        ico,
        receipt_prefix: receiptPrefix,
        supplier_country: settings.supplier_country,
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
