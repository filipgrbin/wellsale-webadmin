// SQLite parser for decrypted WSBAK files
// Uses sql.js to read SQLite database in browser

import initSqlJs, { type Database } from "sql.js";

export interface ProductSalesInfo {
  name: string;
  quantity: number;
}

export interface UzaverkaPayload {
  total_revenue: number;
  total_items: number;
  tx_count: number;
  cash_total: number;
  qr_total: number;
  perProduct?: Record<string, number>;
}

export interface UzaverkaRecord {
  id: number;
  datum: string;
  cislo: string;
  celkem_trzba: number;
  celkem_hotovost: number;
  celkem_karta: number;
  celkem_sleva: number;
  pocet_prodeju: number;
  uzivatel?: string;
  // New fields from close_date table
  close_date?: string;
  total_revenue?: number;
  total_items?: number;
  tx_count?: number;
  cash_total?: number;
  qr_total?: number;
  payload_json?: UzaverkaPayload;
}

export interface ProdejRecord {
  id: number;
  datum: string;
  cislo_dokladu: string;
  celkem: number;
  platba_typ: string;
  sleva: number;
  poznamka?: string;
}

export interface ProdejPolozka {
  id: number;
  prodej_id: number;
  referenceId?: string;
  nazev: string;
  mnozstvi: number;
  cena_jednotka: number;
  cena_celkem: number;
  dph_sazba: number;
}

export interface ParsedBackupData {
  uzaverky: UzaverkaRecord[];
  prodeje: ProdejRecord[];
  polozky: ProdejPolozka[];
  stats: {
    totalSales: number;
    totalRevenue: number;
    totalCash: number;
    totalCard: number;
  };
  tables: string[];
  rawTables?: Record<string, {
    columns: string[];
    rows: Array<Record<string, unknown>>;
    rowCount: number;
  }>;
}

let sqlPromise: Promise<typeof initSqlJs> | null = null;

async function getSql() {
  if (!sqlPromise) {
    sqlPromise = initSqlJs({
      locateFile: () => `https://cdn.jsdelivr.net/npm/sql.js@1.14.1/dist/sql-wasm.wasm`,
    });
  }
  return sqlPromise;
}

export async function parseBackupSqlite(data: Uint8Array): Promise<ParsedBackupData> {
  const SQL = await getSql();
  const db = new SQL.Database(data);
  
  // Get all tables
  const tables = db.exec("SELECT name FROM sqlite_master WHERE type='table'");
  const tableNames = tables[0]?.values?.map(v => String(v[0])) || [];
  console.log("[v0] SQLite tables found:", tableNames);
  
  const result: ParsedBackupData = {
    uzaverky: [],
    prodeje: [],
    polozky: [],
    stats: {
      totalSales: 0,
      totalRevenue: 0,
      totalCash: 0,
      totalCard: 0,
    },
    tables: tableNames,
    rawTables: {},
  };
  
  // Try to parse daily_closes table first (the main format for uzaverka files)
  if (tableNames.some(t => t.toLowerCase() === "daily_closes")) {
    try {
      console.log("[v0] Parsing daily_closes table...");
      const closeDateResult = db.exec(`SELECT * FROM daily_closes ORDER BY rowid DESC LIMIT 100`);
      if (closeDateResult[0]) {
        const cols = closeDateResult[0].columns;
        console.log("[v0] daily_closes columns:", cols);
        result.uzaverky = closeDateResult[0].values.map((row, index) => {
          const obj: Record<string, unknown> = {};
          cols.forEach((col, i) => {
            obj[col] = row[i];
          });
          
          // Parse payload_json if exists
          let payload: UzaverkaPayload | undefined;
          if (obj.payload_json) {
            try {
              payload = JSON.parse(String(obj.payload_json));
            } catch {
              console.warn("[v0] Failed to parse payload_json");
            }
          }
          
          return {
            id: Number(obj.id) || index + 1,
            datum: String(obj.close_date || ""),
            cislo: String(index + 1),
            celkem_trzba: Number(obj.total_revenue || 0),
            celkem_hotovost: Number(obj.cash_total || 0),
            celkem_karta: Number(obj.qr_total || 0),
            celkem_sleva: 0,
            pocet_prodeju: Number(obj.tx_count || 0),
            close_date: String(obj.close_date || ""),
            total_revenue: Number(obj.total_revenue || 0),
            total_items: Number(obj.total_items || 0),
            tx_count: Number(obj.tx_count || 0),
            cash_total: Number(obj.cash_total || 0),
            qr_total: Number(obj.qr_total || 0),
            payload_json: payload,
          } as UzaverkaRecord;
        });
        console.log("[v0] Parsed", result.uzaverky.length, "uzaverky from daily_closes");
      }
    } catch (e) {
      console.warn("[v0] Failed to parse daily_closes:", e);
    }
  }
  
  // Fallback: Try to parse uzaverky (closures/settlements) - old format
  if (result.uzaverky.length === 0 && tableNames.some(t => t.toLowerCase().includes("uzaverk") || t.toLowerCase().includes("closure"))) {
    const uzaverkyTable = tableNames.find(t => t.toLowerCase().includes("uzaverk") || t.toLowerCase().includes("closure"));
    if (uzaverkyTable) {
      try {
        const uzaverkyResult = db.exec(`SELECT * FROM "${uzaverkyTable}" ORDER BY id DESC LIMIT 100`);
        if (uzaverkyResult[0]) {
          const cols = uzaverkyResult[0].columns;
          result.uzaverky = uzaverkyResult[0].values.map((row) => {
            const obj: Record<string, unknown> = {};
            cols.forEach((col, i) => {
              obj[col] = row[i];
            });
            return {
              id: Number(obj.id || obj.ID || 0),
              datum: String(obj.datum || obj.date || obj.created_at || ""),
              cislo: String(obj.cislo || obj.number || obj.id || ""),
              celkem_trzba: Number(obj.celkem_trzba || obj.total || obj.trzba || 0),
              celkem_hotovost: Number(obj.celkem_hotovost || obj.hotovost || obj.cash || 0),
              celkem_karta: Number(obj.celkem_karta || obj.karta || obj.card || 0),
              celkem_sleva: Number(obj.celkem_sleva || obj.sleva || obj.discount || 0),
              pocet_prodeju: Number(obj.pocet_prodeju || obj.pocet || obj.count || 0),
              uzivatel: String(obj.uzivatel || obj.user || ""),
            } as UzaverkaRecord;
          });
        }
      } catch (e) {
        console.warn("Failed to parse uzaverky:", e);
      }
    }
  }
  
  // Try to parse transactions table (new format)
  if (tableNames.some(t => t.toLowerCase() === "transactions")) {
    try {
      console.log("[v0] Parsing transactions table...");
      const txResult = db.exec(`SELECT * FROM transactions ORDER BY rowid DESC LIMIT 500`);
      if (txResult[0]) {
        const cols = txResult[0].columns;
        console.log("[v0] transactions columns:", cols);
        result.prodeje = txResult[0].values.map((row, index) => {
          const obj: Record<string, unknown> = {};
          cols.forEach((col, i) => {
            obj[col] = row[i];
          });
          return {
            id: Number(obj.id || index + 1),
            datum: String(obj.created_at || ""),
            cislo_dokladu: String(obj.id || index + 1),
            celkem: Number(obj.total || 0),
            platba_typ: String(obj.payment_method || "unknown"),
            sleva: 0,
            poznamka: "",
          } as ProdejRecord;
        });
        console.log("[v0] Parsed", result.prodeje.length, "transactions");
      }
    } catch (e) {
      console.warn("[v0] Failed to parse transactions:", e);
    }
  }
  
  // Fallback: Try to parse prodeje (sales) - old format
  if (result.prodeje.length === 0) {
    const salesTable = tableNames.find(t => 
      t.toLowerCase().includes("prodej") || 
      t.toLowerCase().includes("sale") ||
      t.toLowerCase().includes("receipt") ||
      t.toLowerCase().includes("doklad")
    );
    
    if (salesTable) {
      try {
        const salesResult = db.exec(`SELECT * FROM "${salesTable}" ORDER BY id DESC LIMIT 500`);
        if (salesResult[0]) {
          const cols = salesResult[0].columns;
          result.prodeje = salesResult[0].values.map((row) => {
            const obj: Record<string, unknown> = {};
            cols.forEach((col, i) => {
              obj[col] = row[i];
            });
            return {
              id: Number(obj.id || obj.ID || 0),
              datum: String(obj.datum || obj.date || obj.created_at || ""),
              cislo_dokladu: String(obj.cislo_dokladu || obj.cislo || obj.number || obj.id || ""),
              celkem: Number(obj.celkem || obj.total || obj.suma || 0),
              platba_typ: String(obj.platba_typ || obj.platba || obj.payment_type || "cash"),
              sleva: Number(obj.sleva || obj.discount || 0),
              poznamka: String(obj.poznamka || obj.note || ""),
            } as ProdejRecord;
          });
        }
      } catch (e) {
        console.warn("[v0] Failed to parse prodeje:", e);
      }
    }
  }
  
  // Try to parse transaction_items table (new format)
  if (tableNames.some(t => t.toLowerCase() === "transaction_items")) {
    try {
      console.log("[v0] Parsing transaction_items table...");
      const itemsResult = db.exec(`SELECT * FROM transaction_items ORDER BY rowid DESC LIMIT 2000`);
      if (itemsResult[0]) {
        const cols = itemsResult[0].columns;
        console.log("[v0] transaction_items columns:", cols);
        result.polozky = itemsResult[0].values.map((row, index) => {
          const obj: Record<string, unknown> = {};
          cols.forEach((col, i) => {
            obj[col] = row[i];
          });
          
          // Map correct column names: name_snapshot, price_snapshot, qty
          const qty = Number(
            obj.qty ||
              obj.quantity ||
              obj.count ||
              obj.mnozstvi ||
              1
          );
          const unitPrice = Number(
            obj.price_snapshot ||
              obj.price ||
              obj.unit_price ||
              obj.cena_jednotka ||
              obj.item_price ||
              0
          );
          
          return {
            id: Number(obj.id || index + 1),
            prodej_id: Number(
              obj.transaction_id ||
                obj.sale_id ||
                obj.receipt_id ||
                obj.order_id ||
                obj.prodej_id ||
                0
            ),
            referenceId: String(
              obj.receipt_number ||
                obj.sale_number ||
                obj.order_number ||
                obj.transaction_number ||
                obj.document_number ||
                ""
            ).trim() || undefined,
            nazev: String(
              obj.name_snapshot ||
                obj.product_name ||
                obj.name ||
                obj.title ||
                "Unknown"
            ),
            mnozstvi: qty,
            cena_jednotka: unitPrice,
            cena_celkem: qty * unitPrice,
            dph_sazba: 0,
          } as ProdejPolozka;
        });
        console.log("[v0] Parsed", result.polozky.length, "transaction_items");
      }
    } catch (e) {
      console.warn("[v0] Failed to parse transaction_items:", e);
    }
  }
  
  // Fallback: Try to parse polozky (items) - old format
  if (result.polozky.length === 0) {
    const itemsTable = tableNames.find(t => 
      t.toLowerCase().includes("polozk") || 
      t.toLowerCase().includes("item") ||
      t.toLowerCase().includes("radek")
    );
    
    if (itemsTable && itemsTable !== "transaction_items") {
      try {
        const itemsResult = db.exec(`SELECT * FROM "${itemsTable}" ORDER BY id DESC LIMIT 1000`);
        if (itemsResult[0]) {
          const cols = itemsResult[0].columns;
          result.polozky = itemsResult[0].values.map((row) => {
            const obj: Record<string, unknown> = {};
            cols.forEach((col, i) => {
              obj[col] = row[i];
            });
            return {
              id: Number(obj.id || obj.ID || 0),
              prodej_id: Number(
                obj.prodej_id ||
                  obj.sale_id ||
                  obj.receipt_id ||
                  obj.order_id ||
                  obj.transaction_id ||
                  0
              ),
              referenceId: String(
                obj.receipt_number ||
                  obj.cislo_dokladu ||
                  obj.sale_number ||
                  obj.order_number ||
                  obj.document_number ||
                  ""
              ).trim() || undefined,
              nazev: String(
                obj.nazev || obj.name || obj.title || obj.product_name || ""
              ),
              mnozstvi: Number(
                obj.mnozstvi || obj.quantity || obj.qty || obj.count || 1
              ),
              cena_jednotka: Number(
                obj.cena_jednotka ||
                  obj.price ||
                  obj.unit_price ||
                  obj.item_price ||
                  0
              ),
              cena_celkem: Number(
                obj.cena_celkem || obj.total || obj.cena || obj.price || 0
              ),
              dph_sazba: Number(obj.dph_sazba || obj.vat || obj.dph || 0),
            } as ProdejPolozka;
          });
        }
      } catch (e) {
        console.warn("[v0] Failed to parse polozky:", e);
      }
    }
  }
  
  // Calculate stats - prefer close_date data if available
  if (result.uzaverky.length > 0 && result.uzaverky[0].total_revenue !== undefined) {
    // Use close_date table data
    const latestUzaverka = result.uzaverky[0];
    result.stats.totalSales = latestUzaverka.tx_count || 0;
    result.stats.totalRevenue = latestUzaverka.total_revenue || 0;
    result.stats.totalCash = latestUzaverka.cash_total || 0;
    result.stats.totalCard = latestUzaverka.qr_total || 0;
  } else {
    // Fallback to prodeje data
    result.stats.totalSales = result.prodeje.length;
    result.stats.totalRevenue = result.prodeje.reduce((sum, p) => sum + p.celkem, 0);
    result.stats.totalCash = result.prodeje
      .filter(p => p.platba_typ.toLowerCase().includes("hotov") || p.platba_typ.toLowerCase() === "cash")
      .reduce((sum, p) => sum + p.celkem, 0);
  result.stats.totalCard = result.prodeje
  .filter(p => p.platba_typ.toLowerCase().includes("kart") || p.platba_typ.toLowerCase() === "card")
  .reduce((sum, p) => sum + p.celkem, 0);
  }
  
  // Load raw table data for all tables (limit to 100 rows per table)
  for (const tableName of tableNames) {
    try {
      const countResult = db.exec(`SELECT COUNT(*) FROM "${tableName}"`);
      const rowCount = Number(countResult[0]?.values?.[0]?.[0] || 0);
      
      const tableResult = db.exec(`SELECT * FROM "${tableName}" LIMIT 100`);
      if (tableResult[0]) {
        const columns = tableResult[0].columns;
        const rows = tableResult[0].values.map((row) => {
          const obj: Record<string, unknown> = {};
          columns.forEach((col, i) => {
            obj[col] = row[i];
          });
          return obj;
        });
        
        result.rawTables![tableName] = {
          columns,
          rows,
          rowCount,
        };
      }
    } catch (e) {
      console.warn(`[v0] Failed to load table ${tableName}:`, e);
    }
  }
  
  db.close();
  
  return result;
}

export function getTablesList(data: Uint8Array): string[] {
  let db: Database | null = null;
  try {
    const SQL = (window as unknown as { SQL: typeof initSqlJs }).SQL;
    if (!SQL) return [];
    db = new SQL.Database(data);
    const tables = db.exec("SELECT name FROM sqlite_master WHERE type='table'");
    return tables[0]?.values?.map(v => String(v[0])) || [];
  } catch {
    return [];
  } finally {
    db?.close();
  }
}
