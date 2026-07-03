// ── Unified data backup / restore ───────────────────────────────────────────
// The realistic safety net against browser eviction (see storageDurability): a
// single JSON file the user can save OUTSIDE browser storage and re-import on any
// device. Covers the three local stores — notes, FlowState finance, and the Agent
// Consultant. Read-only export is always safe; import is guarded + validated.

import { noteStore, type NoteRecord } from "@/repositories/local/noteStore";
import { financeStore } from "@/repositories/local/financeStore";
import { consultantStore } from "@/repositories/local/consultantStore";

const BACKUP_VERSION = 1;

export interface BeebotBackup {
  app: "beebot";
  version: number;
  exportedAt: string;
  notes: { notes: [string, NoteRecord][]; folders: string[] };
  finance: Awaited<ReturnType<typeof financeStore.exportRaw>>;
  consultant: Awaited<ReturnType<typeof consultantStore.exportRaw>>;
}

export interface BackupSummary {
  notes: number; folders: number;
  transactions: number; accounts: number;
  posts: number; revenue: number;
}

function summarize(b: BeebotBackup): BackupSummary {
  return {
    notes: b.notes?.notes?.length ?? 0,
    folders: b.notes?.folders?.length ?? 0,
    transactions: b.finance?.transactions?.length ?? 0,
    accounts: b.finance?.accounts?.length ?? 0,
    posts: b.consultant?.posts?.length ?? 0,
    revenue: b.consultant?.revenue?.length ?? 0,
  };
}

/** Gather every local store into one canonical snapshot. */
export async function buildBackup(): Promise<BeebotBackup> {
  await Promise.all([noteStore.ready(), financeStore.ready(), consultantStore.ready()]);
  // NOTE: noteStore.allNotes() returns meta only (1M-note RAM discipline). To
  // include content in the backup we read full records directly from disk.
  const [noteRecords, finance, consultant] = await Promise.all([
    noteStore.getAllRecords(),
    financeStore.exportRaw(),
    consultantStore.exportRaw(),
  ]);
  return {
    app: "beebot",
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    notes: { notes: noteRecords, folders: noteStore.folders() },
    finance,
    consultant,
  };
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/** Build a backup and download it as a timestamped JSON file. Returns its summary. */
export async function exportAndDownload(): Promise<BackupSummary> {
  const backup = await buildBackup();
  const stamp = backup.exportedAt.replace(/[:.]/g, "-").slice(0, 19);
  triggerDownload(
    new Blob([JSON.stringify(backup)], { type: "application/json" }),
    `beebot-backup-${stamp}.json`,
  );
  return summarize(backup);
}

/** Parse + structurally validate an uploaded backup file. Throws on bad input. */
export async function readBackupFile(file: File): Promise<BeebotBackup> {
  let parsed: unknown;
  try { parsed = JSON.parse(await file.text()); }
  catch { throw new Error("Not a valid backup file (could not parse JSON)."); }
  const b = parsed as Partial<BeebotBackup>;
  if (!b || b.app !== "beebot" || typeof b.version !== "number") {
    throw new Error("This file is not a BeeBot backup.");
  }
  if (b.version > BACKUP_VERSION) {
    throw new Error(`Backup is from a newer app version (v${b.version}). Update the app first.`);
  }
  return parsed as BeebotBackup;
}

/**
 * Restore from a validated backup, REPLACING current local data. Each store does a
 * guarded reconcile (id-preserving), so re-running is idempotent. Returns a summary.
 */
export async function importBackup(backup: BeebotBackup): Promise<BackupSummary> {
  if (backup.notes) {
    await noteStore.replaceAll(new Map(backup.notes.notes), backup.notes.folders ?? []);
  }
  if (backup.finance) await financeStore.importRaw(backup.finance);
  if (backup.consultant) await consultantStore.importRaw(backup.consultant);
  return summarize(backup);
}
