const API_BASE = process.env.NEXT_PUBLIC_API_URL || "https://ikehhqxu7b.execute-api.eu-central-1.amazonaws.com";
const ADMIN_KEY = process.env.NEXT_PUBLIC_ADMIN_KEY || "SUPER_SECRET_ADMIN_NKEY";

interface ApiOptions {
  method?: "GET" | "POST";
  body?: unknown;
  params?: Record<string, string>;
}

async function apiRequest<T>(endpoint: string, options: ApiOptions = {}): Promise<T> {
  const { method = "GET", body, params } = options;
  
  let url = `${API_BASE}${endpoint}`;
  if (params) {
    const searchParams = new URLSearchParams(params);
    url += `?${searchParams.toString()}`;
  }

  const response = await fetch(url, {
    method,
    headers: {
      "Content-Type": "application/json",
      "x-admin-key": ADMIN_KEY,
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });

  const data = await response.json();
  
  if (!response.ok) {
    throw new Error(data.reason || "API request failed");
  }

  return data;
}

// License Types
export interface License {
  license_key: string;
  owner_name: string;
  owner_email: string;
  license_type: "lifetime" | "temporary";
  valid_until: string | null;
  max_machines: number;
  revoked: boolean;
  revoked_reason: string | null;
  notes: string | null;
  login_code: string | null;
  created_at: string;
  last_seen_at: string | null;
  last_seen_ip: string | null;
  branches_count?: number;
  machines_count?: number;
  backups_count?: number;
}

export interface Branch {
  id: number;
  license_key: string;
  name: string;
  code: string;
  address: string | null;
  created_at: string;
  archived_at: string | null;
  ico: string | null;
  dic: string | null;
  // secret is the branch's DB encryption key — highly sensitive.
  secret: string;
  // Hardware binding (admin-managed). hwid is null until a branch binds to a machine.
  hwid: string | null;
  hwid_bound_at: string | null;
  backups_count?: number;
  machines_count?: number;
}

export interface Machine {
  id: number;
  license_key: string;
  install_id: string;
  hostname: string;
  last_seen_at: string | null;
  last_seen_ip: string | null;
  branch_id: number | null;
  created_at: string;
}

// License API
export async function getLicenses(): Promise<{ ok: boolean; licenses: License[] }> {
  return apiRequest("/api/admin/licenses");
}

export async function getLicense(key: string): Promise<{ ok: boolean; license: License }> {
  return apiRequest("/api/admin/licenses/get", { params: { key } });
}

export async function createLicense(data: {
  licenseKey?: string;
  ownerName: string;
  ownerEmail: string;
  type: "lifetime" | "temporary";
  validUntil?: string;
  maxMachines: number;
  notes?: string;
  loginCode?: string;
}): Promise<{ ok: boolean; license: License }> {
  return apiRequest("/api/admin/licenses/create", { method: "POST", body: data });
}

export async function updateLicense(
  licenseKey: string,
  fields: Partial<{
    owner_name: string;
    owner_email: string;
    license_type: string;
    valid_until: string | null;
    max_machines: number;
    notes: string;
    login_code: string;
  }>
): Promise<{ ok: boolean; license: License }> {
  return apiRequest("/api/admin/licenses/update", {
    method: "POST",
    body: { licenseKey, fields },
  });
}

export async function deleteLicense(licenseKey: string): Promise<{ ok: boolean; deleted: string }> {
  return apiRequest("/api/admin/licenses/delete", {
    method: "POST",
    body: { licenseKey },
  });
}

export async function revokeLicense(
  licenseKey: string,
  reason: string
): Promise<{ ok: boolean; license: License }> {
  return apiRequest("/api/admin/licenses/revoke", {
    method: "POST",
    body: { licenseKey, reason },
  });
}

export async function unrevokeLicense(licenseKey: string): Promise<{ ok: boolean; license: License }> {
  return apiRequest("/api/admin/licenses/unrevoke", {
    method: "POST",
    body: { licenseKey },
  });
}

// Branch API
export async function getBranches(licenseKey?: string, includeArchived = false): Promise<{ ok: boolean; branches: Branch[] }> {
  const params: Record<string, string> = {};
  if (licenseKey) params.licenseKey = licenseKey;
  if (includeArchived) params.includeArchived = "1";
  return apiRequest("/api/admin/branches", { params });
}

export async function createBranch(data: {
  licenseKey: string;
  name: string;
  code?: string;
  address?: string;
}): Promise<{ ok: boolean; branch: Branch }> {
  return apiRequest("/api/admin/branches/create", { method: "POST", body: data });
}

export async function updateBranch(
  id: number,
  fields: Partial<{
    name: string;
    code: string;
    address: string;
    archived_at: string | null;
    hwid: string | null;
    hwid_bound_at: string | null;
    secret: string;
    ico: string | null;
    dic: string | null;
  }>
): Promise<{ ok: boolean; branch: Branch }> {
  return apiRequest("/api/admin/branches/update", {
    method: "POST",
    body: { id, fields },
  });
}

// Branch HWID management (admin only). Both go through the branches/update
// endpoint — the backend must whitelist `hwid` / `hwid_bound_at` in its fields.
export async function setBranchHwid(id: number, hwid: string): Promise<{ ok: boolean; branch: Branch }> {
  return updateBranch(id, { hwid, hwid_bound_at: new Date().toISOString() });
}

export async function clearBranchHwid(id: number): Promise<{ ok: boolean; branch: Branch }> {
  return updateBranch(id, { hwid: null, hwid_bound_at: null });
}

export async function deleteBranch(id: number, hard = false): Promise<{ ok: boolean }> {
  return apiRequest("/api/admin/branches/delete", {
    method: "POST",
    body: { id, hard },
  });
}

// Machine API
export async function getMachines(licenseKey?: string): Promise<{ ok: boolean; machines: Machine[] }> {
  const params: Record<string, string> = {};
  if (licenseKey) params.licenseKey = licenseKey;
  return apiRequest("/api/admin/machines", { params });
}

export async function deleteMachine(id: number): Promise<{ ok: boolean }> {
  return apiRequest("/api/admin/machines/delete", {
    method: "POST",
    body: { id },
  });
}

// Admin-only machine edit. Requires a new backend endpoint
// (POST /api/admin/machines/update) whitelisting install_id/hostname/branch_id.
export async function updateMachine(
  id: number,
  fields: Partial<{
    install_id: string;
    hostname: string;
    branch_id: number | null;
  }>
): Promise<{ ok: boolean; machine: Machine }> {
  return apiRequest("/api/admin/machines/update", {
    method: "POST",
    body: { id, fields },
  });
}

// Admin-only manual machine create. Requires a new backend endpoint
// (POST /api/admin/machines/create).
export async function createMachine(data: {
  license_key: string;
  install_id: string;
  hostname?: string;
  branch_id?: number | null;
}): Promise<{ ok: boolean; machine: Machine }> {
  return apiRequest("/api/admin/machines/create", { method: "POST", body: data });
}

// Helper to generate license key format
export function generateLicenseKey(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  const pick = (n: number) =>
    Array.from({ length: n }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
  return `${pick(4)}-${pick(4)}-${pick(4)}-${pick(3)}`;
}

// Backup Types
export interface Backup {
  id: number;
  license_key: string;
  branch_id: number;
  s3_key: string;
  file_name: string;
  kind: string;
  size_bytes: number;
  uploaded_at: string;
  metadata_json: Record<string, unknown> | null;
  branch_name?: string;
  branch_code?: string;
  license_owner?: string;
}

export interface BackupStats {
  totals: {
    total_count: number;
    total_bytes: number;
    oldest: string | null;
    newest: string | null;
  };
  byKind: Array<{ kind: string; count: number; bytes: number }>;
  recent: Backup[];
}

// Backup API
export async function getBackups(params?: {
  licenseKey?: string;
  branchId?: number;
  kind?: string;
  from?: string;
  to?: string;
  limit?: number;
  offset?: number;
}): Promise<{ ok: boolean; backups: Backup[]; total: number; limit: number; offset: number }> {
  const queryParams: Record<string, string> = {};
  if (params?.licenseKey) queryParams.licenseKey = params.licenseKey;
  if (params?.branchId) queryParams.branchId = String(params.branchId);
  if (params?.kind) queryParams.kind = params.kind;
  if (params?.from) queryParams.from = params.from;
  if (params?.to) queryParams.to = params.to;
  if (params?.limit) queryParams.limit = String(params.limit);
  if (params?.offset) queryParams.offset = String(params.offset);
  return apiRequest("/api/admin/backups", { params: queryParams });
}

export async function getBackup(id: number): Promise<{ ok: boolean; backup: Backup }> {
  return apiRequest("/api/admin/backups/get", { params: { id: String(id) } });
}

export async function getBackupsStats(params?: {
  licenseKey?: string;
  branchId?: number;
}): Promise<{ ok: boolean } & BackupStats> {
  const queryParams: Record<string, string> = {};
  if (params?.licenseKey) queryParams.licenseKey = params.licenseKey;
  if (params?.branchId) queryParams.branchId = String(params.branchId);
  return apiRequest("/api/admin/backups/stats", { params: queryParams });
}

export async function getBackupDownloadUrl(id: number): Promise<{
  ok: boolean;
  downloadUrl: string;
  fileName: string;
  expiresIn: number;
}> {
  return apiRequest("/api/admin/backups/download-url", { method: "POST", body: { id } });
}

export async function deleteBackup(id: number): Promise<{
  ok: boolean;
  deletedId: number;
  deletedKey: string;
}> {
  return apiRequest("/api/admin/backups/delete", { method: "POST", body: { id } });
}

export async function deleteBackupsBulk(ids: number[]): Promise<{
  ok: boolean;
  deletedCount: number;
  failedCount: number;
  deleted: number[];
  failed: Array<{ id: number; s3Key: string; error: string }>;
}> {
  return apiRequest("/api/admin/backups/delete-bulk", { method: "POST", body: { ids } });
}

// Branch DB Key API
export async function getBranchDbKey(id: number): Promise<{
  ok: boolean;
  branch: { id: number; name: string; code: string; license_key: string };
  dbKey: string;
  warning: string;
}> {
  return apiRequest("/api/admin/branch/show-key", { params: { id: String(id) } });
}

// Direct backup download (returns binary data)
export async function downloadBackupDirect(id: number): Promise<ArrayBuffer> {
  const response = await fetch(`/api/admin/backups/download?id=${id}`, {
    headers: {
      "x-admin-key": ADMIN_KEY,
    },
  });
  
  if (!response.ok) {
    throw new Error("Failed to download backup");
  }
  
  return response.arrayBuffer();
}

// Decrypt and parse backup on server (returns parsed JSON data)
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

// Fault / outage reports (fault_log table). Reported by the POS app via
// POST /api/fault/report; the admin panel reads them back per branch.
//
// A single audit row inside json_payload. The POS attaches a selection of
// rows from two different logs: the structured "audit" log (rows have these
// fields) and the plain-text "main"/updater log (just `[datetime] ... text`
// lines). normalizeFaultLogs() in components/branch-faults.tsx splits them.
export interface FaultAuditRow {
  id?: number;
  actor?: string;
  action?: string;
  details?: string;
  category?: string;
  created_at?: string;
}

// List row (GET /api/admin/faults). Lightweight — no json_payload; attachments
// are fetched per-fault via getFault().
export interface FaultLog {
  id: number;
  license_key: string;
  branch_id: number;
  issue_start: string | null;
  issue_end: string | null;
  reason: string;
  resolution: string | null;
  reported_by: string | null;
  signature: string | null;
  cert_thumbprint: string | null;
  local_id: number | null;
  created_at: string;
  resolved?: boolean;
  branch_name?: string;
  branch_code?: string;
  license_owner?: string;
}

// Full fault (GET /api/admin/faults/get). The backend extracts the two
// attachments from json_payload into top-level arrays for us.
export interface FaultDetail extends FaultLog {
  audit_rows: FaultAuditRow[];
  log_lines: string[];
  json_payload?: unknown;
}

// Admin-only fault list. GET /api/admin/faults?licenseKey=&branchId=
export async function getFaults(params?: {
  licenseKey?: string;
  branchId?: number;
  from?: string;
  to?: string;
  limit?: number;
  offset?: number;
}): Promise<{ ok: boolean; faults: FaultLog[]; total: number; limit: number; offset: number }> {
  const queryParams: Record<string, string> = {};
  if (params?.licenseKey) queryParams.licenseKey = params.licenseKey;
  if (params?.branchId) queryParams.branchId = String(params.branchId);
  if (params?.from) queryParams.from = params.from;
  if (params?.to) queryParams.to = params.to;
  if (params?.limit) queryParams.limit = String(params.limit);
  if (params?.offset) queryParams.offset = String(params.offset);
  return apiRequest("/api/admin/faults", { params: queryParams });
}

// Single fault with attachments. GET /api/admin/faults/get?id=
export async function getFault(id: number): Promise<{ ok: boolean; fault: FaultDetail }> {
  return apiRequest("/api/admin/faults/get", { params: { id: String(id) } });
}

export async function decryptBackupOnServer(id: number): Promise<ParsedBackupData> {
  const response = await fetch(`/api/admin/backups/decrypt?id=${id}`, {
    headers: {
      "x-admin-key": ADMIN_KEY,
    },
  });
  
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: "Unknown error" }));
    throw new Error(error.error || "Failed to decrypt backup");
  }
  
  const result = await response.json();
  if (!result.ok) {
    throw new Error(result.error || "Decryption failed");
  }
  
  return result.data;
}
