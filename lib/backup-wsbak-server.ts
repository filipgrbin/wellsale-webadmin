import crypto from "crypto";
import { extractTransactionTimestamp } from "@/lib/transaction-timestamp";
import { parseStockMovementRow, parseTransactionStockMeta, type StockMovementRecord } from "@/lib/stock-movement-utils";

const MAGIC = Buffer.from("WSBAK\x01\x00\x00", "binary");

export interface ParsedBackupData {
  stats: {
    totalSales: number;
    totalRevenue: number;
    totalCash: number;
    totalCard: number;
  };
  uzaverky: Array<{
    id: number;
    datum: string;
    close_date?: string;
    total_revenue?: number;
    total_items?: number;
    tx_count?: number;
    cash_total?: number;
    qr_total?: number;
    payload_json?: {
      total_revenue: number;
      total_items: number;
      tx_count: number;
      cash_total: number;
      qr_total: number;
      perProduct?: Record<string, number>;
    };
  }>;
  prodeje: Array<{
    id: number;
    cislo_dokladu: string;
    datum: string;
    celkem: number;
    platba_typ: string;
    signed?: boolean;
    signerName?: string | null;
    signatureFingerprint?: string | null;
    movementNumber?: string | null;
    stockMovementId?: number | null;
  }>;
  polozky: Array<{
    id: number;
    prodej_id: number;
    nazev: string;
    mnozstvi: number;
    cena_jednotka: number;
    cena_celkem: number;
  }>;
  stockMovements: StockMovementRecord[];
  tables: string[];
  rawTables?: Record<
    string,
    {
      columns: string[];
      rows: Array<Record<string, unknown>>;
      rowCount: number;
    }
  >;
}

export function decryptWsbakBuffer(encryptedBuffer: Buffer, licenseKey: string): Buffer {
  if (!encryptedBuffer.slice(0, 8).equals(MAGIC)) {
    throw new Error("Invalid file format - bad magic header");
  }

  const salt = encryptedBuffer.slice(8, 24);
  const iv = encryptedBuffer.slice(24, 36);
  const tag = encryptedBuffer.slice(encryptedBuffer.length - 16);
  const ciphertext = encryptedBuffer.slice(36, encryptedBuffer.length - 16);

  const passphrase = `wellsale-backup:${licenseKey}`;
  const key = crypto.pbkdf2Sync(passphrase, salt, 100_000, 32, "sha256");

  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);

  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}

function transactionsOrderClause(columns: string[]): string {
  const lower = new Set(columns.map((c) => c.toLowerCase()));
  if (lower.has("created_at")) return "created_at ASC";
  if (lower.has("date")) return "date ASC";
  if (lower.has("timestamp")) return "timestamp ASC";
  return "rowid ASC";
}

export async function parseSqliteBackupBuffer(sqliteBuffer: Buffer): Promise<ParsedBackupData> {
  const magic = sqliteBuffer.slice(0, 16).toString("utf8");
  if (!magic.startsWith("SQLite format 3")) {
    throw new Error("Invalid SQLite file - bad header");
  }

  const fs = await import("fs/promises");
  const path = await import("path");
  const os = await import("os");

  const tempFile = path.join(os.tmpdir(), `backup-${Date.now()}-${Math.random().toString(36).slice(2)}.db`);
  await fs.writeFile(tempFile, sqliteBuffer);

  const Database = (await import("better-sqlite3")).default;
  const db = new Database(tempFile, { readonly: true });

  const result: ParsedBackupData = {
    stats: { totalSales: 0, totalRevenue: 0, totalCash: 0, totalCard: 0 },
    uzaverky: [],
    prodeje: [],
    polozky: [],
    stockMovements: [],
    tables: [],
    rawTables: {},
  };

  try {
    const tablesResult = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as {
      name: string;
    }[];
    result.tables = tablesResult.map((row) => row.name);

    if (result.tables.some((t) => t.toLowerCase() === "daily_closes")) {
      try {
        const closesRows = db
          .prepare("SELECT * FROM daily_closes ORDER BY rowid DESC LIMIT 100")
          .all() as Record<string, unknown>[];
        result.uzaverky = closesRows.map((obj, index) => {
          let payload = undefined;
          if (obj.payload_json) {
            try {
              payload = JSON.parse(String(obj.payload_json));
            } catch {
              // ignore
            }
          }

          return {
            id: index + 1,
            datum: String(obj.close_date || obj.created_at || ""),
            close_date: String(obj.close_date || ""),
            total_revenue: Number(obj.total_revenue || 0),
            total_items: Number(obj.total_items || 0),
            tx_count: Number(obj.tx_count || 0),
            cash_total: Number(obj.cash_total || 0),
            qr_total: Number(obj.qr_total || 0),
            payload_json: payload,
          };
        });
      } catch (e) {
        console.error("Failed to parse daily_closes:", e);
      }
    }

    if (result.tables.some((t) => t.toLowerCase() === "transactions")) {
      try {
        const sample = db.prepare("SELECT * FROM transactions LIMIT 1").get() as
          | Record<string, unknown>
          | undefined;
        const orderBy = sample ? transactionsOrderClause(Object.keys(sample)) : "rowid ASC";
        const txRows = db
          .prepare(`SELECT * FROM transactions ORDER BY ${orderBy} LIMIT 5000`)
          .all() as Record<string, unknown>[];
        result.prodeje = txRows.map((obj, index) => {
          const stockMeta = parseTransactionStockMeta(obj);
          return {
            id: Number(obj.id || index + 1),
            cislo_dokladu: String(obj.receipt_number || obj.id || index + 1),
            datum: extractTransactionTimestamp(obj),
            celkem: Number(obj.total || obj.amount || 0),
            platba_typ: String(obj.payment_method || obj.payment_type || "unknown"),
            ...stockMeta,
          };
        });
      } catch (e) {
        console.error("Failed to parse transactions:", e);
      }
    }

    if (result.tables.some((t) => t.toLowerCase() === "transaction_items")) {
      try {
        const itemsRows = db
          .prepare("SELECT * FROM transaction_items ORDER BY rowid DESC LIMIT 2000")
          .all() as Record<string, unknown>[];
        result.polozky = itemsRows.map((obj, index) => {
          const qty = Number(obj.qty || obj.quantity || 1);
          const unitPrice = Number(obj.price_snapshot || obj.unit_price || obj.price || 0);

          return {
            id: Number(obj.id || index + 1),
            prodej_id: Number(obj.transaction_id || 0),
            nazev: String(obj.name_snapshot || obj.product_name || obj.name || "Unknown"),
            mnozstvi: qty,
            cena_jednotka: unitPrice,
            cena_celkem: qty * unitPrice,
          };
        });
      } catch (e) {
        console.error("Failed to parse transaction_items:", e);
      }
    }

    if (result.tables.some((t) => t.toLowerCase() === "stock_movements")) {
      try {
        const movementRows = db
          .prepare("SELECT * FROM stock_movements ORDER BY rowid ASC LIMIT 5000")
          .all() as Record<string, unknown>[];
        result.stockMovements = movementRows.map((row, index) =>
          parseStockMovementRow(row, index)
        );
      } catch (e) {
        console.error("Failed to parse stock_movements:", e);
      }
    }

    if (result.uzaverky.length > 0) {
      const latest = result.uzaverky[0];
      if (latest.payload_json) {
        result.stats.totalSales = latest.payload_json.tx_count || latest.tx_count || 0;
        result.stats.totalRevenue = latest.payload_json.total_revenue || latest.total_revenue || 0;
        result.stats.totalCash = latest.payload_json.cash_total || latest.cash_total || 0;
        result.stats.totalCard = latest.payload_json.qr_total || latest.qr_total || 0;
      } else {
        result.stats.totalSales = latest.tx_count || 0;
        result.stats.totalRevenue = latest.total_revenue || 0;
        result.stats.totalCash = latest.cash_total || 0;
        result.stats.totalCard = latest.qr_total || 0;
      }
    } else if (result.prodeje.length > 0) {
      result.stats.totalSales = result.prodeje.length;
      result.stats.totalRevenue = result.prodeje.reduce((sum, p) => sum + p.celkem, 0);
    }

    for (const tableName of result.tables) {
      try {
        const rows = db
          .prepare(`SELECT * FROM "${tableName}" ORDER BY rowid DESC LIMIT 100`)
          .all() as Record<string, unknown>[];

        const columns = rows.length > 0 ? Object.keys(rows[0]) : [];
        const countRow = db
          .prepare(`SELECT COUNT(*) as cnt FROM "${tableName}"`)
          .get() as { cnt: number } | undefined;

        result.rawTables![tableName] = {
          columns,
          rows,
          rowCount: countRow?.cnt || rows.length,
        };
      } catch (e) {
        console.error(`Failed to parse table ${tableName}:`, e);
      }
    }

    return result;
  } finally {
    db.close();
    try {
      await fs.unlink(tempFile);
    } catch {
      // ignore
    }
  }
}

export async function decryptBackupFileBuffer(
  encryptedBuffer: Buffer,
  licenseKey: string
): Promise<ParsedBackupData> {
  const decrypted = decryptWsbakBuffer(encryptedBuffer, licenseKey);
  return parseSqliteBackupBuffer(decrypted);
}

export interface BackupInfoRow {
  id: number;
  license_key: string;
  branch_id: number;
  file_name: string;
}

export async function fetchAndDecryptBackupById(
  id: number,
  adminKey: string,
  apiBase: string
): Promise<{ backup: BackupInfoRow; data: ParsedBackupData }> {
  const backupResponse = await fetch(`${apiBase}/api/admin/backups/get?id=${id}`, {
    headers: { "x-admin-key": adminKey },
  });

  if (!backupResponse.ok) {
    throw new Error("Failed to get backup info");
  }

  const backupInfo = await backupResponse.json();
  if (!backupInfo.ok || !backupInfo.backup) {
    throw new Error("Backup not found");
  }

  const licenseKey = backupInfo.backup.license_key;
  if (!licenseKey) {
    throw new Error("No license key found for backup");
  }

  const urlResponse = await fetch(`${apiBase}/api/admin/backups/download-url`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-admin-key": adminKey,
    },
    body: JSON.stringify({ id }),
  });

  if (!urlResponse.ok) {
    throw new Error("Failed to get download URL");
  }

  const urlData = await urlResponse.json();
  if (!urlData.ok || !urlData.downloadUrl) {
    throw new Error("No download URL returned");
  }

  const fileResponse = await fetch(urlData.downloadUrl);
  if (!fileResponse.ok) {
    throw new Error("Failed to download backup file");
  }

  const encryptedBuffer = Buffer.from(await fileResponse.arrayBuffer());
  const data = await decryptBackupFileBuffer(encryptedBuffer, licenseKey);

  return {
    backup: {
      id: backupInfo.backup.id,
      license_key: backupInfo.backup.license_key,
      branch_id: backupInfo.backup.branch_id,
      file_name: backupInfo.backup.file_name,
    },
    data,
  };
}
