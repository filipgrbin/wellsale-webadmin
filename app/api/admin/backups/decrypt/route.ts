import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "https://ikehhqxu7b.execute-api.eu-central-1.amazonaws.com";
const ADMIN_KEY = process.env.NEXT_PUBLIC_ADMIN_KEY || "SUPER_SECRET_ADMIN_NKEY";

const MAGIC = Buffer.from("WSBAK\x01\x00\x00", "binary");

interface ParsedBackupData {
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
  }>;
  polozky: Array<{
    id: number;
    prodej_id: number;
    nazev: string;
    mnozstvi: number;
    cena_jednotka: number;
    cena_celkem: number;
  }>;
  tables: string[];
  // Raw table data for non-uzaverka backups
  rawTables?: Record<string, {
    columns: string[];
    rows: Array<Record<string, unknown>>;
    rowCount: number;
  }>;
}

function decryptWsbak(encryptedBuffer: Buffer, licenseKey: string): Buffer {
  // Verify magic
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

// Parse SQLite using better-sqlite3 (native module)
async function parseSqliteBasic(sqliteBuffer: Buffer): Promise<ParsedBackupData> {
  // Check SQLite magic
  const magic = sqliteBuffer.slice(0, 16).toString("utf8");
  if (!magic.startsWith("SQLite format 3")) {
    throw new Error("Invalid SQLite file - bad header");
  }

  // Write buffer to temp file for better-sqlite3
  const fs = await import("fs/promises");
  const path = await import("path");
  const os = await import("os");
  
  const tempDir = os.tmpdir();
  const tempFile = path.join(tempDir, `backup-${Date.now()}.db`);
  
  await fs.writeFile(tempFile, sqliteBuffer);
  
  // Use dynamic import for better-sqlite3
  const Database = (await import("better-sqlite3")).default;
  const db = new Database(tempFile, { readonly: true });

  const result: ParsedBackupData = {
    stats: { totalSales: 0, totalRevenue: 0, totalCash: 0, totalCard: 0 },
    uzaverky: [],
    prodeje: [],
    polozky: [],
    tables: [],
    rawTables: {},
  };

  try {
    // Get table names
    const tablesResult = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as { name: string }[];
    result.tables = tablesResult.map((row) => row.name);

    // Parse daily_closes table
    if (result.tables.some(t => t.toLowerCase() === "daily_closes")) {
      try {
        const closesRows = db.prepare("SELECT * FROM daily_closes ORDER BY rowid DESC LIMIT 100").all() as Record<string, unknown>[];
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

    // Parse transactions table
    if (result.tables.some(t => t.toLowerCase() === "transactions")) {
      try {
        const txRows = db.prepare("SELECT * FROM transactions ORDER BY rowid DESC LIMIT 500").all() as Record<string, unknown>[];
        result.prodeje = txRows.map((obj, index) => {
          return {
            id: Number(obj.id || index + 1),
            cislo_dokladu: String(obj.receipt_number || obj.id || index + 1),
            datum: String(obj.created_at || obj.date || ""),
            celkem: Number(obj.total || obj.amount || 0),
            platba_typ: String(obj.payment_method || obj.payment_type || "unknown"),
          };
        });
      } catch (e) {
        console.error("Failed to parse transactions:", e);
      }
    }

    // Parse transaction_items table
    if (result.tables.some(t => t.toLowerCase() === "transaction_items")) {
      try {
        const itemsRows = db.prepare("SELECT * FROM transaction_items ORDER BY rowid DESC LIMIT 2000").all() as Record<string, unknown>[];
        result.polozky = itemsRows.map((obj, index) => {
          // Map correct column names: name_snapshot, price_snapshot, qty
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

    // Calculate stats from uzaverky or prodeje
    if (result.uzaverky.length > 0) {
      const latest = result.uzaverky[0];
      // Try payload_json first for most accurate data
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

    // Parse ALL tables generically for raw data display
    for (const tableName of result.tables) {
      try {
        const rows = db.prepare(`SELECT * FROM "${tableName}" ORDER BY rowid DESC LIMIT 100`).all() as Record<string, unknown>[];
        
        // Get columns from first row or empty
        const columns = rows.length > 0 ? Object.keys(rows[0]) : [];
        
        // Get total row count
        const countRow = db.prepare(`SELECT COUNT(*) as cnt FROM "${tableName}"`).get() as { cnt: number } | undefined;
        const totalCount = countRow?.cnt || rows.length;
        
        result.rawTables![tableName] = {
          columns,
          rows,
          rowCount: totalCount,
        };
      } catch (e) {
        console.error(`Failed to parse table ${tableName}:`, e);
      }
    }

    return result;
  } finally {
    db.close();
    // Clean up temp file
    try {
      const fs = await import("fs/promises");
      await fs.unlink(tempFile);
    } catch {
      // ignore cleanup errors
    }
  }
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");

  if (!id) {
    return NextResponse.json({ error: "Missing backup ID" }, { status: 400 });
  }

  const adminKey = request.headers.get("x-admin-key") || ADMIN_KEY;
  if (!adminKey) {
    return NextResponse.json({ error: "Missing admin key" }, { status: 401 });
  }

  try {
    // First get the backup info to get the license key
    const backupResponse = await fetch(`${API_BASE}/api/admin/backups/get?id=${id}`, {
      headers: {
        "x-admin-key": adminKey,
      },
    });

    if (!backupResponse.ok) {
      const errorData = await backupResponse.json().catch(() => ({}));
      console.error("[v0] Failed to get backup info:", errorData);
      return NextResponse.json(
        { error: "Failed to get backup info" },
        { status: backupResponse.status }
      );
    }

    const backupInfo = await backupResponse.json();
    console.log("[v0] Backup info:", JSON.stringify(backupInfo, null, 2));
    
    if (!backupInfo.ok || !backupInfo.backup) {
      return NextResponse.json({ error: "Backup not found" }, { status: 404 });
    }

    const licenseKey = backupInfo.backup.license_key;
    if (!licenseKey) {
      return NextResponse.json({ error: "No license key found for backup" }, { status: 400 });
    }

    // Get download URL
    const urlResponse = await fetch(`${API_BASE}/api/admin/backups/download-url`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-admin-key": adminKey,
      },
      body: JSON.stringify({ id: Number(id) }),
    });

    if (!urlResponse.ok) {
      const errorData = await urlResponse.json().catch(() => ({}));
      console.error("[v0] Failed to get download URL:", errorData);
      return NextResponse.json(
        { error: "Failed to get download URL" },
        { status: urlResponse.status }
      );
    }

    const urlData = await urlResponse.json();
    console.log("[v0] Download URL response:", JSON.stringify(urlData, null, 2));
    
    if (!urlData.ok || !urlData.downloadUrl) {
      return NextResponse.json({ error: "No download URL returned" }, { status: 400 });
    }

    // Download the encrypted file
    const fileResponse = await fetch(urlData.downloadUrl);
    if (!fileResponse.ok) {
      console.error("[v0] Failed to download file:", fileResponse.status, fileResponse.statusText);
      return NextResponse.json({ error: "Failed to download backup file" }, { status: 500 });
    }

    const encryptedBuffer = Buffer.from(await fileResponse.arrayBuffer());
    console.log("[v0] Downloaded encrypted file, size:", encryptedBuffer.length);

    // Decrypt the file using the license key from the backup
    const decryptedBuffer = decryptWsbak(encryptedBuffer, licenseKey);
    console.log("[v0] Decrypted file, size:", decryptedBuffer.length);

    // Parse SQLite and return JSON data
    const parsedData = await parseSqliteBasic(decryptedBuffer);
    console.log("[v0] Parsed data tables:", parsedData.tables);

    return NextResponse.json({
      ok: true,
      data: parsedData,
    });
  } catch (error) {
    console.error("[v0] Decrypt error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Decryption failed" },
      { status: 500 }
    );
  }
}
