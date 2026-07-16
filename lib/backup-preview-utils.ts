import { formatPosStamp } from "@/lib/transaction-timestamp";

export function formatBackupDateTime(date?: string | null): string {
  if (!date) return "-";
  const formatted = formatPosStamp(String(date));
  if (formatted) return formatted;

  const parsed = new Date(String(date));
  if (!isNaN(parsed.getTime())) {
    return parsed.toLocaleString("cs-CZ", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    });
  }
  const fallback = String(date).replace("T", " ").replace("Z", "");
  const parsedFallback = new Date(fallback);
  return !isNaN(parsedFallback.getTime())
    ? parsedFallback.toLocaleString("cs-CZ", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
      })
    : String(date);
}

export function formatPaymentType(value?: string | null): string {
  const lower = String(value || "").trim().toLowerCase();
  if (lower === "cash" || lower.includes("hotov")) return "Hotově";
  if (lower === "qr" || lower.includes("kart") || lower.includes("card")) return "QR";
  return String(value || "Neznámá");
}

export function parseJson(value: unknown): unknown {
  if (value === null || value === undefined) return undefined;
  if (typeof value === "object") return value;
  if (typeof value === "string") {
    try {
      return JSON.parse(value);
    } catch {
      return value;
    }
  }
  return value;
}

export function getValueString(value: unknown): string {
  if (value === null || value === undefined) return "-";
  if (typeof value === "object") {
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }
  return String(value);
}

export function getProductCardFields(row: Record<string, unknown>) {
  const name = String(
    row.name ||
      row.title ||
      row.nazev ||
      row.product_name ||
      row.name_snapshot ||
      row.display_name ||
      "Produkt"
  );
  const price = Number(
    row.price ||
      row.cena ||
      row.price_snapshot ||
      row.cena_jednotka ||
      row.unit_price ||
      0
  );
  const quantity = Number(
    row.stock ||
      row.quantity ||
      row.mnozstvi ||
      row.inventory ||
      row.count ||
      row.stock_count ||
      0
  );
  const limit = Number(
    row.low_stock_threshold ||
      row.reorder_level ||
      row.min_stock ||
      row.warning_threshold ||
      row.alert_at ||
      row.limit ||
      0
  );
  return { name, price, quantity, limit };
}

export function getSaleCardFields(row: Record<string, unknown>) {
  const date = String(
    row.created_at ||
      row.datum ||
      row.date ||
      row.time ||
      row.timestamp ||
      row.receipt_date ||
      ""
  );
  const total = Number(
    row.total ||
      row.celkem ||
      row.sum ||
      row.suma ||
      row.celkem_total ||
      row.price ||
      row.amount ||
      0
  );
  const payment = formatPaymentType(
    String(
      row.payment_method ||
        row.payment_type ||
        row.platba_typ ||
        row.platba ||
        row.method ||
        row.payment ||
        row.type ||
        ""
    )
  );
  return { date, total, payment };
}

export function getClosureCardFields(row: Record<string, unknown>) {
  const payloadRaw = parseJson(row.payload_json || row.payload || row.data || row.meta);
  const payload = typeof payloadRaw === "object" && payloadRaw !== null ? (payloadRaw as Record<string, unknown>) : undefined;
  const date = String(
    row.close_date ||
      row.datum ||
      row.date ||
      row.created_at ||
      payload?.date ||
      payload?.created_at ||
      ""
  );
  const total = Number(
    payload?.total_revenue || payload?.total || row.total_revenue || row.celkem_trzba || 0
  );
  const cashTotal = Number(
    payload?.cash_total || row.cash_total || row.celkem_hotovost || 0
  );
  const qrTotal = Number(
    payload?.qr_total || row.qr_total || row.celkem_karta || 0
  );
  const txCount = Number(
    payload?.tx_count || row.tx_count || row.pocet_prodeju || 0
  );
  const totalItems = Number(
    payload?.total_items || row.total_items || 0
  );
  return { date, total, cashTotal, qrTotal, txCount, totalItems, payload };
}

export function getUserCardFields(row: Record<string, unknown>) {
  const name = String(
    row.name ||
      row.username ||
      row.user_name ||
      row.display_name ||
      row.email ||
      "Uživatel"
  );
  const role = String(
    row.role || row.user_role || row.type || row.role_name || "Neznámá role"
  );
  const created = String(
    row.created_at || row.createdAt || row.created || row.timestamp || ""
  );
  const pin = String(row.pin || row.pincode || row.pin_code || "");
  const rawPermissions = parseJson(
    row.permissions || row.perms || row.permission || row.permisions || row.roles
  );
  const permissions = Array.isArray(rawPermissions)
    ? rawPermissions.map((item) => String(item))
    : typeof rawPermissions === "object" && rawPermissions !== null
    ? [JSON.stringify(rawPermissions)]
    : typeof rawPermissions === "string"
    ? rawPermissions.split(/[,;\s]+/).filter(Boolean)
    : [];
  return { name, role, created, pin, permissions };
}

export function getTableDisplayName(tableName: string): string {
  const name = tableName.toLowerCase();
  if (name === "transactions") return "Prodeje";
  if (name === "transaction_items") return "Položky prodejů";
  if (name === "stock_movements") return "Skladové pohyby";
  if (name === "products") return "Produkty";
  if (name === "categories") return "Kategorie";
  if (name === "daily_closes") return "Uzávěrky";
  if (name === "users") return "Uživatelé";
  if (name === "audit_log") return "Historie změn";
  if (name.includes("setting")) return "Nastavení";
  return tableName;
}

export function isTransactionEventsTable(tableName: string): boolean {
  const name = tableName.toLowerCase();
  return name.includes("transaction_event") || name.includes("transactionevents") || name.includes("events");
}
