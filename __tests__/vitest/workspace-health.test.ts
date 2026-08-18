import { describe, expect, it } from "vitest";
import { buildWorkspaceHealthSnapshot, describeStorageBackend } from "../../src/features/notes/health/workspaceHealth";

describe("workspace health", () => {
  it("marks a local device folder as healthy when permission is available", () => {
    const snapshot = buildWorkspaceHealthSnapshot({
      activeVault: { name: "Sitku", path: "/vault", noteCount: 42 },
      noteCount: 42,
      entryCount: 58,
      activeNoteTitle: "Daily Review",
      isDirty: false,
      isSaving: false,
      isLoading: false,
      needsReopenFolder: false,
      fsaSupported: true,
      versionsCount: 3,
      emergencyRecoveryAvailable: false,
      lastSearchRebuildAt: null,
      recentErrors: [],
    });

    expect(snapshot.saveStatus).toBe("Saved");
    expect(snapshot.storageBackend).toBe("Device folder");
    expect(snapshot.vaultStatus).toContain("42 notes");
    expect(snapshot.searchStatus).toBe("Auto-syncs on search");
    expect(snapshot.recoveryStatus).toBe("3 saved versions");
  });

  it("surfaces permission and recovery risk clearly", () => {
    const snapshot = buildWorkspaceHealthSnapshot({
      activeVault: { name: "Sitku", path: "/vault" },
      noteCount: 10,
      entryCount: 12,
      activeNoteTitle: "Inbox",
      isDirty: true,
      isSaving: false,
      isLoading: false,
      needsReopenFolder: true,
      fsaSupported: true,
      versionsCount: 0,
      emergencyRecoveryAvailable: true,
      lastSearchRebuildAt: Date.now(),
      recentErrors: [
        { at: 1, area: "save", message: "Save failed" },
        { at: 2, area: "search", message: "Search failed" },
        { at: 3, area: "storage", message: "Storage failed" },
        { at: 4, area: "save", message: "Older error" },
      ],
    });

    expect(snapshot.saveStatus).toBe("Unsaved changes");
    expect(snapshot.storageBackend).toBe("Device folder needs permission");
    expect(snapshot.vaultStatus).toBe("Reconnect folder to restore file access");
    expect(snapshot.searchStatus).toBe("Rebuilt in this session");
    expect(snapshot.recoveryStatus).toBe("Emergency draft available");
    expect(snapshot.recentErrors).toHaveLength(3);
  });

  it("describes browser local storage without file system support", () => {
    expect(describeStorageBackend({
      activeVault: { path: "browser-local-preview" },
      needsReopenFolder: false,
      fsaSupported: false,
    })).toBe("Browser local vault");
  });
});
