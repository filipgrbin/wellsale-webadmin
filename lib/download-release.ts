// Client-side release Setup.exe download (same pattern as encrypted backups).
// Next /api/admin/releases/download → POST download-url → 302 to S3 (no body through Next).

import { getReleaseDownloadUrl, type AppRelease } from "@/lib/api";

function triggerNavigationDownload(url: string) {
  const a = document.createElement("a");
  a.href = url;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
}

/** Prefer Next 302 → S3 (no CORS). Falls back to direct presigned URL. */
export async function downloadReleaseSetup(release: AppRelease): Promise<void> {
  // Same-origin navigation like .wsbak backups — Next resolves the presign and redirects.
  triggerNavigationDownload(`/api/admin/releases/download?id=${release.id}`);
}

/**
 * Resolve presigned URL in JS (for clearer errors), then navigate to S3.
 * Use when the Next redirect path fails or you need the file name.
 */
export async function downloadReleaseSetupViaPresign(
  release: AppRelease
): Promise<void> {
  const r = await getReleaseDownloadUrl({ id: release.id });
  if (!r.ok || !r.downloadUrl) {
    throw new Error("Nelze získat odkaz ke stažení instalátoru");
  }
  triggerNavigationDownload(r.downloadUrl);
}
