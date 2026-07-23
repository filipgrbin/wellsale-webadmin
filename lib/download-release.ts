// Client-side release Setup.exe download (same pattern as encrypted backups).
// Next /api/admin/releases/download → POST download-url → 302 to S3 (no body through Next).

import type { AppRelease } from "@/lib/api";

function triggerNavigationDownload(url: string) {
  const a = document.createElement("a");
  a.href = url;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
}

/**
 * Same as .wsbak backups: navigate to Next proxy → 302 → S3.
 * Probes first so API errors become a toast instead of a raw JSON page.
 */
export async function downloadReleaseSetup(release: AppRelease): Promise<void> {
  const path = `/api/admin/releases/download?id=${release.id}`;
  const probe = await fetch(path, { method: "GET", redirect: "manual" });

  // Next 302 to S3
  if (probe.status >= 300 && probe.status < 400) {
    const loc = probe.headers.get("location");
    if (loc) {
      triggerNavigationDownload(loc);
      return;
    }
  }

  if (probe.ok) {
    triggerNavigationDownload(path);
    return;
  }

  let message = `Stahování selhalo (${probe.status})`;
  try {
    const body = await probe.json();
    message = body.error || body.reason || body.message || message;
  } catch {
    // ignore
  }
  throw new Error(message);
}
