// Client-side release Setup.exe download — same as backup: getPresigned → navigate to S3.

import { getReleaseDownloadUrl, type AppRelease } from "@/lib/api";

function triggerNavigationDownload(url: string) {
  const a = document.createElement("a");
  a.href = url;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
}

/** POST download-url → open S3 presigned URL (no file body through Next). */
export async function downloadReleaseSetup(release: AppRelease): Promise<void> {
  const r = await getReleaseDownloadUrl({ id: release.id });
  if (!r.ok || !r.downloadUrl) {
    throw new Error("Nelze získat odkaz ke stažení instalátoru");
  }
  triggerNavigationDownload(r.downloadUrl);
}
