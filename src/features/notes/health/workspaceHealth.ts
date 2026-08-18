export type WorkspaceHealthError = {
  at: number;
  area: "save" | "search" | "storage";
  message: string;
};

export type WorkspaceHealthInput = {
  activeVault: { name?: string; path?: string; noteCount?: number } | null;
  noteCount: number;
  entryCount: number;
  activeNoteTitle: string | null;
  isDirty: boolean;
  isSaving: boolean;
  isLoading: boolean;
  needsReopenFolder: boolean;
  fsaSupported: boolean;
  versionsCount: number;
  emergencyRecoveryAvailable: boolean;
  lastSearchRebuildAt: number | null;
  recentErrors: WorkspaceHealthError[];
};

export type WorkspaceHealthSnapshot = {
  saveStatus: "Saving" | "Unsaved changes" | "Saved" | "No note selected";
  storageBackend: string;
  vaultStatus: string;
  searchStatus: string;
  recoveryStatus: string;
  recentErrors: WorkspaceHealthError[];
};

export function describeStorageBackend(input: Pick<WorkspaceHealthInput, "activeVault" | "needsReopenFolder" | "fsaSupported">) {
  if (input.needsReopenFolder) return "Device folder needs permission";
  const vaultPath = input.activeVault?.path || "";
  if (vaultPath && vaultPath !== "browser-local-preview") return "Device folder";
  if (input.fsaSupported) return "Browser local vault, device-folder ready";
  return "Browser local vault";
}

export function buildWorkspaceHealthSnapshot(input: WorkspaceHealthInput): WorkspaceHealthSnapshot {
  const saveStatus = input.isSaving
    ? "Saving"
    : input.isDirty
      ? "Unsaved changes"
      : input.activeNoteTitle
        ? "Saved"
        : "No note selected";

  const vaultStatus = input.needsReopenFolder
    ? "Reconnect folder to restore file access"
    : input.isLoading
      ? "Loading workspace"
      : `${input.noteCount.toLocaleString()} notes, ${input.entryCount.toLocaleString()} entries`;

  const searchStatus = input.lastSearchRebuildAt
    ? "Rebuilt in this session"
    : input.noteCount > 0
      ? "Auto-syncs on search"
      : "Ready";

  const recoveryStatus = input.emergencyRecoveryAvailable
    ? "Emergency draft available"
    : input.versionsCount > 0
      ? `${input.versionsCount.toLocaleString()} saved versions`
      : input.isDirty
        ? "Current draft is still in memory"
        : "No recovery needed";

  return {
    saveStatus,
    storageBackend: describeStorageBackend(input),
    vaultStatus,
    searchStatus,
    recoveryStatus,
    recentErrors: input.recentErrors.slice(0, 3),
  };
}
