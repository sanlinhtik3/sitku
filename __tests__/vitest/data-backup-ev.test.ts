import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  noteReady: vi.fn(async () => undefined),
  noteRecords: vi.fn(async () => [["Inbox.md", { path: "Inbox.md", content: "Hello" }]]),
  noteFolders: vi.fn(() => ["Inbox"]),
  noteReplace: vi.fn(async () => undefined),
  financeReady: vi.fn(async () => undefined),
  financeExport: vi.fn(async () => ({ transactions: [{ id: "tx" }], accounts: [{ id: "account" }] })),
  financeImport: vi.fn(async () => undefined),
  consultantReady: vi.fn(async () => undefined),
  consultantExport: vi.fn(async () => ({ posts: [{ id: "post" }], revenue: [{ id: "revenue" }] })),
  consultantImport: vi.fn(async () => undefined),
  evExport: vi.fn(async () => ({
    format: "sitku-ev-memory" as const,
    schemaVersion: 1 as const,
    exportedAt: "2026-08-09T00:00:00.000Z",
    checksum: "verified",
    data: {
      schemaVersion: 1 as const,
      sessions: [{ id: "session", status: "completed" as const, startedAt: "2026-08-09T00:00:00.000Z", createdAt: "2026-08-09T00:00:00.000Z", updatedAt: "2026-08-09T00:00:01.000Z" }],
      messages: [], summaries: [], memories: [],
    },
  })),
  evImport: vi.fn(async () => ({ imported: 1, skipped: 0 })),
}));

vi.mock("@/repositories/local/noteStore", () => ({
  noteStore: { ready: mocks.noteReady, getAllRecords: mocks.noteRecords, folders: mocks.noteFolders, replaceAll: mocks.noteReplace },
}));
vi.mock("@/repositories/local/financeStore", () => ({
  financeStore: { ready: mocks.financeReady, exportRaw: mocks.financeExport, importRaw: mocks.financeImport },
}));
vi.mock("@/repositories/local/consultantStore", () => ({
  consultantStore: { ready: mocks.consultantReady, exportRaw: mocks.consultantExport, importRaw: mocks.consultantImport },
}));
vi.mock("@/features/ev-voice/memory/memoryService", () => ({
  exportEvMemoryBackup: mocks.evExport,
  importEvMemoryBackup: mocks.evImport,
}));

import { buildBackup, importBackup } from "@/lib/dataBackup";

describe("unified E.V memory backup", () => {
  beforeEach(() => vi.clearAllMocks());

  it("exports E.V memory and restores it through the verified memory importer", async () => {
    const backup = await buildBackup();
    expect(backup.version).toBe(2);
    expect(backup.evMemory?.data.sessions).toHaveLength(1);

    const summary = await importBackup(backup);
    expect(mocks.evImport).toHaveBeenCalledWith(backup.evMemory);
    expect(summary).toEqual(expect.objectContaining({
      notes: 1, transactions: 1, posts: 1, evSessions: 1, evMessages: 0,
    }));
  });

  it("keeps version-one backups compatible when E.V memory is absent", async () => {
    const backup = await buildBackup();
    const legacy = { ...backup, version: 1, evMemory: undefined };
    const summary = await importBackup(legacy);
    expect(mocks.evImport).not.toHaveBeenCalled();
    expect(summary.evSessions).toBe(0);
  });
});
