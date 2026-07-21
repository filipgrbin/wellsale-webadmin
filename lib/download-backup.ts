// Client-side backup download helpers.
//
// Large backups must never be proxied through Next (edge returns 413).
//
//  - .wsbak: same-origin /api/admin/backups/download → 302 → S3 (navigation, no CORS)
//  - .db:    fetch presigned S3 URL in the browser (needs bucket CORS), then decrypt
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

function triggerNavigationDownload(url: string) {
  // Top-level navigation / iframe-less assign — not a CORS fetch.
  const a = document.createElement("a");
  a.href = url;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
}

/** Encrypted .wsbak — redirect through Next to S3 (no file body on webadmin). */
export async function downloadEncryptedBackup(backup: Backup): Promise<void> {
  triggerNavigationDownload(`/api/admin/backups/download?id=${backup.id}`);
}

/**
 * Decrypted .db — must read bytes in JS, so fetch S3 directly (bucket CORS required).
 * Does not use the Next download proxy (that path 413s on large files).
 */
export async function downloadDecryptedDb(backup: Backup): Promise<void> {
  const r = await getBackupDownloadUrl(backup.id);
  if (!r.ok || !r.downloadUrl) throw new Error("Nelze získat odkaz ke stažení");

  let buf: ArrayBuffer;
  try {
    const resp = await fetch(r.downloadUrl);
    if (!resp.ok) {
      throw new Error(`S3 odpovědělo ${resp.status}`);
    }
    buf = await resp.arrayBuffer();
  } catch (e) {
    const detail = e instanceof Error ? e.message : "neznámá chyba";
    throw new Error(
      `Nelze stáhnout ze S3 (${detail}). ` +
        `Na bucketu wellsale-cloud-storage-krejtom musí být CORS pro https://webadmin.wellsale.cz (GET + HEAD). ` +
        `Zakódovaný .wsbak jde stáhnout bez CORS.`
    );
  }

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
