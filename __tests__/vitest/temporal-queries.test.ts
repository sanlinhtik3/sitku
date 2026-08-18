import { describe, it, expect, beforeEach } from "vitest";
import { noteStore } from "../../src/repositories/local/noteStore";
import { BrowserNotesRepository } from "../../src/repositories/local/browserLocal";

describe("Temporal Query Engine & ctimeMs Support", () => {
  let notes: BrowserNotesRepository;

  beforeEach(async () => {
    notes = new BrowserNotesRepository();
    const allPaths = [...noteStore.allMetas().keys()];
    if (allPaths.length > 0) {
      await noteStore.deletePaths(allPaths);
    }
  });

  it("captures ctimeMs and mtimeMs in noteStore and retrieves them via listNotes and getMeta", async () => {
    const now = Date.now();
    await noteStore.putNote("test.md", { path: "test.md", content: "# Test Note\nHello world", title: "Test Note", ctimeMs: now, mtimeMs: now });
    
    const meta = noteStore.getMeta("test.md");
    expect(meta).not.toBeUndefined();
    expect(meta!.ctimeMs).toBeDefined();
    expect(meta!.mtimeMs).toBeDefined();
    expect(meta!.ctimeMs).toBe(now);
    expect(meta!.mtimeMs).toBe(now);

    const list = await notes.listNotes();
    expect(list).toHaveLength(1);
    expect(list[0].ctimeMs).toBe(now);
    expect(list[0].mtimeMs).toBe(now);
  });

  it("listNotes filters by createdAfter and modifiedAfter", async () => {
    const oldTime = Date.now() - 10 * 24 * 60 * 60 * 1000; // 10 days ago
    const recentTime = Date.now() - 1 * 24 * 60 * 60 * 1000; // 1 day ago

    await noteStore.putNote("old.md", { path: "old.md", content: "# Old Note", title: "Old Note", ctimeMs: oldTime, mtimeMs: oldTime });
    await noteStore.putNote("recent.md", { path: "recent.md", content: "# Recent Note", title: "Recent Note", ctimeMs: recentTime, mtimeMs: recentTime });

    const allNotes = await notes.listNotes();
    expect(allNotes).toHaveLength(2);

    const filteredCreated = await notes.listNotes({ createdAfter: Date.now() - 5 * 24 * 60 * 60 * 1000 });
    expect(filteredCreated).toHaveLength(1);
    expect(filteredCreated[0].path).toBe("recent.md");

    const filteredModified = await notes.listNotes({ modifiedAfter: Date.now() - 5 * 24 * 60 * 60 * 1000 });
    expect(filteredModified).toHaveLength(1);
    expect(filteredModified[0].path).toBe("recent.md");
  });

  it("listNotes sorts correctly by ctime and mtime", async () => {
    const time1 = 1000;
    const time2 = 2000;
    const time3 = 3000;

    await noteStore.putNote("note1.md", { path: "note1.md", content: "# Note 1", title: "Note 1", ctimeMs: time2, mtimeMs: time1 });
    await noteStore.putNote("note2.md", { path: "note2.md", content: "# Note 2", title: "Note 2", ctimeMs: time1, mtimeMs: time3 });
    await noteStore.putNote("note3.md", { path: "note3.md", content: "# Note 3", title: "Note 3", ctimeMs: time3, mtimeMs: time2 });

    const sortedByCtimeAsc = await notes.listNotes({ sortBy: "ctime", sortOrder: "asc" });
    expect(sortedByCtimeAsc.map(n => n.path)).toEqual(["note2.md", "note1.md", "note3.md"]);

    const sortedByMtimeDesc = await notes.listNotes({ sortBy: "mtime", sortOrder: "desc" });
    expect(sortedByMtimeDesc.map(n => n.path)).toEqual(["note2.md", "note3.md", "note1.md"]);
  });

  it("queryByDate correctly queries notes by relative dateRange and action", async () => {
    const now = Date.now();
    const twoDaysAgo = now - 2 * 24 * 60 * 60 * 1000;
    const twentyDaysAgo = now - 20 * 24 * 60 * 60 * 1000;

    await noteStore.putNote("today.md", { path: "today.md", content: "# Today Note", title: "Today Note", ctimeMs: now, mtimeMs: now });
    await noteStore.putNote("two_days.md", { path: "two_days.md", content: "# Two Days Ago", title: "Two Days Ago", ctimeMs: twoDaysAgo, mtimeMs: twoDaysAgo });
    await noteStore.putNote("twenty_days.md", { path: "twenty_days.md", content: "# Twenty Days Ago", title: "Twenty Days Ago", ctimeMs: twentyDaysAgo, mtimeMs: twentyDaysAgo });

    const todayNotes = await notes.queryByDate({ dateRange: "today", action: "created" });
    expect(todayNotes).toHaveLength(1);
    expect(todayNotes[0].path).toBe("today.md");

    const weekNotes = await notes.queryByDate({ dateRange: "this_week", action: "modified" });
    expect(weekNotes).toHaveLength(2);
    expect(weekNotes.map(n => n.path)).toContain("today.md");
    expect(weekNotes.map(n => n.path)).toContain("two_days.md");

    const monthNotes = await notes.queryByDate({ dateRange: "this_month", action: "modified" });
    expect(monthNotes).toHaveLength(3);
  });

  it("stores emergency recovery content as plain text", () => {
    const values = new Map<string, string>();
    const previous = globalThis.localStorage;
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: {
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => values.set(key, value),
        removeItem: (key: string) => values.delete(key),
      },
    });
    try {
      notes.emergencySaveSync("Recovery.md", "# Recovery\n\nunsaved draft");
      const recovery = JSON.parse(values.get("beebot.emergency_recovery") || "null");
      expect(recovery.content).toBe("# Recovery\n\nunsaved draft");
      expect(typeof recovery.content).toBe("string");
    } finally {
      Object.defineProperty(globalThis, "localStorage", { configurable: true, value: previous });
    }
  });
});
