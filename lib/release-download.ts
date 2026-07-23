import type { AppRelease } from "@/lib/api";
import { compareAppVersions } from "@/lib/app-capabilities";

/** Marker at the start of release_notes → eligible for subadmin Setup.exe download. */
export const WEB_DOWNLOAD_TAG = "[DOWN]";

export function stripWebDownloadTag(notes: string | null | undefined): string {
  return String(notes || "")
    .replace(/^\s*\[DOWN\]\s*/i, "")
    .replace(/^\s+/, "");
}

/** Ensures notes start with [DOWN] (preserves the rest). */
export function withWebDownloadTag(notes: string | null | undefined): string {
  const body = stripWebDownloadTag(notes).trim();
  return body ? `${WEB_DOWNLOAD_TAG}\n${body}` : WEB_DOWNLOAD_TAG;
}

export function releaseHasWebDownloadTag(notes: string | null | undefined): boolean {
  return /^\s*\[DOWN\]/i.test(String(notes || ""));
}

/**
 * Official web download candidate:
 * - release_notes start with [DOWN]
 * - rollout_percent === 100 (partial rollouts stay updater-only)
 * - channel stable (beta ignored)
 *
 * Does NOT require `active` — so a full 100% build can stay downloadable
 * while a newer build rolls out at 50% via auto-update.
 * Among matches, highest semver wins.
 *
 * If `forceVersion` is set (branches.update_force_version), that release wins
 * when it exists in the list — no [DOWN] / rollout checks.
 */
export function pickWebDownloadRelease(
  releases: AppRelease[] | null | undefined,
  forceVersion?: string | null
): AppRelease | null {
  const list = releases ?? [];
  const pinned = String(forceVersion || "").trim();
  if (pinned) {
    const hit = list.find((r) => String(r.version) === pinned);
    if (hit) return hit;
    return null;
  }

  const candidates = list.filter((r) => {
    if (!releaseHasWebDownloadTag(r.release_notes)) return false;
    if (Number(r.rollout_percent) < 100) return false;
    const ch = String(r.channel || "stable").toLowerCase();
    if (ch && ch !== "stable") return false;
    return true;
  });

  if (!candidates.length) return null;

  candidates.sort((a, b) => compareAppVersions(b.version, a.version));
  return candidates[0] ?? null;
}
