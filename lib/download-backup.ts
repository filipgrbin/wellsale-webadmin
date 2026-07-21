// Client-side backup download helpers.
//
// Backups are stored encrypted as .wsbak (AES-256-GCM, key derived from the
// license key). We offer two downloads:
//  - the raw .wsbak (only WellSale can open it)
//  - a decrypted .db (plain SQLite, openable by any SQLite viewer)
//
// Large files must NOT go through the Next.js proxy (platform 413). Encrypted
// downloads use a top-level navigation to the S3 presigned URL (no CORS).
// Decrypted downloads fetch the presigned URL in the browser (needs S3 CORS),
// then decrypt locally — with a small-file proxy fallback.
import { getBackupDownloadUrl, downloadBackupDirect, type Backup } from "@/lib/api";
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

function triggerDirectUrlDownload(url: string, filename: string) {
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
}

async function fetchBackupBytes(backup: Backup): Promise<ArrayBuffer> {
  const r = await getBackupDownloadUrl(backup.id);
  if (!r.ok || !r.downloadUrl) throw new Error("Nelze získat odkaz ke stažení");

  // Prefer direct S3 (no Next size limit). Requires bucket CORS for webadmin.
  try {
    const resp = await fetch(r.downloadUrl);
    if (resp.ok) return resp.arrayBuffer();
  } catch {
    // CORS or network — fall through to same-origin proxy
  }

  try {
    return await downloadBackupDirect(backup.id);
  } catch {
    throw new Error(
      "Stažení selhalo (CORS na S3 nebo soubor je moc velký pro proxy). " +
        "Pro .wsbak použijte přímé stažení; na bucketu nastavte CORS pro webadmin.wellsale.cz."
    );
  }
}

/** Encrypted .wsbak — open S3 URL directly (works without CORS / without proxy). */
export async function downloadEncryptedBackup(backup: Backup): Promise<void> {
  const r = await getBackupDownloadUrl(backup.id);
  if (!r.ok || !r.downloadUrl) throw new Error("Nelze získat odkaz ke stažení");

  const name = /\.(wsbak|db)$/i.test(backup.file_name)
    ? backup.file_name
    : `${backup.file_name}.wsbak`;

  triggerDirectUrlDownload(r.downloadUrl, name);
}

/** Decrypted SQLite .db — fetch bytes then decrypt in the browser. */
export async function downloadDecryptedDb(backup: Backup): Promise<void> {
  const buf = await fetchBackupBytes(backup);
  let dbBytes: BlobPart;
  if (backup.file_name.toLowerCase().endsWith(".db")) {
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
