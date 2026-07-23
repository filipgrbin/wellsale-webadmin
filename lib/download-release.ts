// Release Setup.exe download — identical idea to backup download-url:
// ask API for a short-lived S3 URL, then navigate the browser there.

import { getReleaseDownloadUrl, type AppRelease } from "@/lib/api";

/** GET /api/admin/releases?downloadId=… → open S3 (never through Next). */
export async function downloadReleaseSetup(release: AppRelease): Promise<void> {
  const r = await getReleaseDownloadUrl({ id: release.id, version: release.version });
  if (!r?.ok || !r.downloadUrl) {
    throw new Error("Nelze získat odkaz ke stažení instalátoru");
  }
  // Top-level navigation — same as clicking a normal download link
  window.location.assign(r.downloadUrl);
}
