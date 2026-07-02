// Client-side backup download helpers.
//
// Backups are stored encrypted as .wsbak (AES-256-GCM, key derived from the
// license key). We offer two downloads:
//  - the raw .wsbak (only WellSale can open it)
//  - a decrypted .db (plain SQLite, openable by any SQLite viewer)
import { getBackupDownloadUrl, type Backup } from "@/lib/api";
import { decryptWsbak } from "@/lib/wsbak-decrypt";

function saveBytes(data: BlobPart, filename: string) {
  const blob = new Blob([data], { type: "application/octet-stream" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function baseName(name: string): string {
  return name.replace(/\.(wsbak|db)$/i, "");
}

async function fetchBackupBytes(backup: Backup): Promise<ArrayBuffer> {
  const r = await getBackupDownloadUrl(backup.id);
  if (!r.ok || !r.downloadUrl) throw new Error("Nelze získat odkaz ke stažení");
  const resp = await fetch(r.downloadUrl);
  if (!resp.ok) throw new Error("Stažení souboru selhalo");
  return resp.arrayBuffer();
}

// Encrypted backup, exactly as stored. Unreadable without WellSale.
export async function downloadEncryptedBackup(backup: Backup): Promise<void> {
  const buf = await fetchBackupBytes(backup);
  const name = /\.(wsbak|db)$/i.test(backup.file_name)
    ? backup.file_name
    : `${backup.file_name}.wsbak`;
  saveBytes(buf, name);
}

// Decrypted SQLite database (.db), openable by any SQLite viewer.
export async function downloadDecryptedDb(backup: Backup): Promise<void> {
  const buf = await fetchBackupBytes(backup);
  let dbBytes: BlobPart;
  if (backup.file_name.toLowerCase().endsWith(".db")) {
    // Already a plain SQLite file — no decryption needed.
    dbBytes = buf;
  } else {
    const res = await decryptWsbak(buf, backup.license_key);
    if (!res.success || !res.data) {
      throw new Error(res.error || "Dešifrování selhalo");
    }
    dbBytes = res.data;
  }
  saveBytes(dbBytes, `${baseName(backup.file_name)}.db`);
}
