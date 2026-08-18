import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { teamChecksum } from "../../src/repositories/local/teamRepository";

const read = (file: string) => readFileSync(resolve(file), "utf8");

describe("TeamRepository contract parity", () => {
  it("uses the same deterministic checksum for recovery and conflict detection", () => {
    const state = { schemaVersion: 2, company: { name: "Sitku" }, tasks: [] } as never;
    expect(teamChecksum(state)).toBe(teamChecksum(JSON.parse(JSON.stringify(state))));
    expect(teamChecksum(state)).not.toBe(teamChecksum({ ...state, tasks: [{ id: "changed" }] } as never));
  });

  it("keeps browser workspace and attachment writes in IndexedDB with a recovery envelope", () => {
    const source = read("src/repositories/local/teamRepository.ts");
    expect(source).toContain('const DB_NAME = "sitku-team-os"');
    expect(source).toContain('const ATTACHMENT_STORE = "attachments"');
    expect(source).toContain("expectedRevision");
    expect(source).toContain("checksum mismatch");
    expect(source).toContain("recovery fallback");
  });

  it("uses SQLite WAL-compatible atomic transactions and filesystem attachment writes on desktop", () => {
    const runtime = read("electron/local-runtime.mjs");
    const preload = read("electron/preload.cjs");
    expect(runtime).toContain("CREATE TABLE IF NOT EXISTS team_workspace");
    expect(runtime).toContain('this.db.exec("BEGIN IMMEDIATE")');
    expect(runtime).toContain('this.db.exec("COMMIT")');
    expect(runtime).toContain('this.db.exec("ROLLBACK")');
    expect(runtime).toContain('"team", "attachments"');
    expect(preload).toContain('"putAttachment"');
    expect(preload).toContain('"getAttachment"');
  });

  it("preserves the legacy source and migration backup", () => {
    const store = read("src/repositories/local/teamStore.ts");
    expect(store).toContain('const LEGACY_KEY = "sitku.consultant.team.v1"');
    expect(store).toContain("migration-backup");
    expect(store).not.toContain("localStorage.removeItem(LEGACY_KEY)");
  });
});
