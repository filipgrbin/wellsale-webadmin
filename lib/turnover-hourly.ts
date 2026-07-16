import { decryptBackupOnServer, type Backup } from "@/lib/api";
import {
  extractCloseDate,
  normalizeCloseDate,
  pickLatestUzaverkaBackupsForDay,
  type HourlySalePoint,
} from "@/lib/turnover-utils";

function isDecryptableBackup(fileName: string): boolean {
  return fileName.endsWith(".wsbak") || fileName.endsWith(".db");
}

/** Load individual sale timestamps from uzaverka backups for intraday chart. */
export async function fetchHourlySalesForChart(
  backups: Backup[],
  day: string,
  opts?: { licenseKey?: string; branchIds?: number[] | null }
): Promise<HourlySalePoint[]> {
  const dayBackups = pickLatestUzaverkaBackupsForDay(backups, day, opts).filter((b) =>
    isDecryptableBackup(b.file_name)
  );

  if (dayBackups.length === 0) return [];

  const results = await Promise.all(
    dayBackups.map(async (backup) => {
      const backupCloseDate = extractCloseDate(backup) ?? day;
      try {
        const data = await decryptBackupOnServer(backup.id);
        return data.prodeje
          .filter((p) => {
            const d = normalizeCloseDate(p.datum);
            if (d) return d === day;
            return backupCloseDate === day;
          })
          .map((p) => ({
            branchId: backup.branch_id,
            timestamp: p.datum,
            revenue: Number(p.celkem) || 0,
          }));
      } catch {
        return [];
      }
    })
  );

  return results.flat();
}
