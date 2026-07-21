/**
 * POS app capability registry.
 *
 * Webadmin must not assume every branch runs the newest app. Features that
 * depend on a minimum POS version should use these helpers and degrade
 * gracefully (empty state + short notice), never hard-fail the whole page.
 *
 * When you ship a new POS feature that webadmin consumes, add a capability
 * here with the first version that supports it, then gate UI/API expectations
 * with `branchSupports` / `summarizeCapability`.
 */

export type AppCapabilityId =
  | "livePosSync"
  | "liveStockMovements"
  | "uzaverkaTillMeta";

export interface AppCapability {
  id: AppCapabilityId;
  /** Inclusive minimum POS semver (e.g. "1.6.0"). Null = always treated as available when unknown. */
  minVersion: string | null;
  /** Short Czech note for operators. */
  label: string;
}

/**
 * Bump minVersion when a feature first ships in a release.
 * livePosSync: cloud TX + stock sync (pos_transactions / pos_stock_movements).
 */
export const APP_CAPABILITIES: Record<AppCapabilityId, AppCapability> = {
  livePosSync: {
    id: "livePosSync",
    minVersion: "1.6.0",
    label: "Live transakce a sklad (cloud sync)",
  },
  liveStockMovements: {
    id: "liveStockMovements",
    minVersion: "1.6.0",
    label: "Live skladové pohyby",
  },
  uzaverkaTillMeta: {
    id: "uzaverkaTillMeta",
    minVersion: null,
    label: "Metadata uzávěrky (tržba / hotovost)",
  },
};

/** Parse "1.6.0", "v1.6.0-beta", "1.6" → [1,6,0]. */
export function parseAppVersion(raw: string | null | undefined): number[] | null {
  if (!raw || !String(raw).trim()) return null;
  const m = String(raw).trim().replace(/^v/i, "").match(/(\d+)(?:\.(\d+))?(?:\.(\d+))?/);
  if (!m) return null;
  return [Number(m[1]) || 0, Number(m[2]) || 0, Number(m[3]) || 0];
}

export function compareAppVersions(a: string | null | undefined, b: string | null | undefined): number {
  const pa = parseAppVersion(a);
  const pb = parseAppVersion(b);
  if (!pa && !pb) return 0;
  if (!pa) return -1;
  if (!pb) return 1;
  for (let i = 0; i < 3; i++) {
    if (pa[i] !== pb[i]) return pa[i] - pb[i];
  }
  return 0;
}

export function versionGte(version: string | null | undefined, minVersion: string): boolean {
  return compareAppVersions(version, minVersion) >= 0;
}

/**
 * Unknown / missing version → treat as unsupported for gated features
 * (safer: don't pretend live sync works).
 * Capability with minVersion null → always supported.
 */
export function branchSupports(
  appVersion: string | null | undefined,
  capability: AppCapabilityId
): boolean {
  const cap = APP_CAPABILITIES[capability];
  if (!cap.minVersion) return true;
  if (!appVersion) return false;
  return versionGte(appVersion, cap.minVersion);
}

export interface CapabilitySummary {
  capability: AppCapabilityId;
  supported: Array<{ id: number; code?: string; name?: string; version: string | null }>;
  unsupported: Array<{ id: number; code?: string; name?: string; version: string | null }>;
  /** True when at least one branch can use the feature. */
  anySupported: boolean;
  /** True when every known branch supports it (unknown versions count as unsupported). */
  allSupported: boolean;
  notice: string | null;
}

export function summarizeCapability(
  branches: Array<{
    id: number;
    code?: string;
    name?: string;
    app_version?: string | null;
    archived_at?: string | null;
  }>,
  capability: AppCapabilityId
): CapabilitySummary {
  const active = branches.filter((b) => !b.archived_at);
  const supported: CapabilitySummary["supported"] = [];
  const unsupported: CapabilitySummary["unsupported"] = [];

  for (const b of active) {
    const row = {
      id: b.id,
      code: b.code,
      name: b.name,
      version: b.app_version ?? null,
    };
    if (branchSupports(b.app_version, capability)) supported.push(row);
    else unsupported.push(row);
  }

  let notice: string | null = null;
  if (unsupported.length > 0 && supported.length > 0) {
    notice = `${unsupported.length} prodejen má starší verzi pokladny — u nich se některé údaje nemusí zobrazit. Doporučujeme aktualizaci.`;
  } else if (unsupported.length > 0 && supported.length === 0) {
    notice =
      "Prodejny mají starší verzi pokladny — tato sekce může zůstat prázdná, dokud se pokladny neaktualizují.";
  }

  return {
    capability,
    supported,
    unsupported,
    anySupported: supported.length > 0,
    allSupported: unsupported.length === 0 && active.length > 0,
    notice,
  };
}
