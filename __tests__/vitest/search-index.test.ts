import { describe, expect, it } from "vitest";
import { buildSearchIndex, patchSearchIndex, querySearchIndex } from "../../src/repositories/local/searchIndex";
import { BrowserSearchRepository } from "../../src/repositories/local/browserLocal";
import type { NoteFile, NotesRepository } from "../../src/repositories/contracts/notes";

describe("local search index", () => {
  const index = buildSearchIndex([
    {
      path: "Founder/Review.md",
      title: "Daily Review",
      content: "# Daily Review\n\n## CEO Notes\n\n- [ ] Ship finder\n\n#focus",
    },
  ]);

  it("returns heading-level finder results without losing markdown-note results", () => {
    const results = querySearchIndex(index, "ceo", 9);
    expect(results.some((result) => result.source === "heading" && result.title === "CEO Notes")).toBe(true);
    expect(results.every((result) => result.path === "Founder/Review.md")).toBe(true);
  });

  it("returns tag results for local deterministic search", () => {
    const results = querySearchIndex(index, "focus", 9);
    expect(results.some((result) => result.source === "tag" && result.title === "#focus")).toBe(true);
  });

  it("ranks exact titles ahead of prefixes, substrings, and body matches", () => {
    const ranked = buildSearchIndex([
      { path: "exact.md", title: "Project", content: "notes" },
      { path: "prefix.md", title: "Project Atlas", content: "notes" },
      { path: "substring.md", title: "The Project Archive", content: "notes" },
      { path: "body.md", title: "Archive", content: "The project is active." },
    ]);

    const paths = querySearchIndex(ranked, "project", 10)
      .filter((result) => result.source === "note")
      .map((result) => result.path);
    expect(paths).toEqual(["exact.md", "prefix.md", "substring.md", "body.md"]);
  });

  it("matches non-contiguous tokens and tolerates common transposition typos", () => {
    const ranked = buildSearchIndex([
      { path: "review.md", title: "Daily Founder Review", content: "Weekly operating notes" },
      { path: "other.md", title: "Daily Log", content: "Unrelated review later" },
    ]);

    expect(querySearchIndex(ranked, "founder daily", 10)[0]?.path).toBe("review.md");
    expect(querySearchIndex(ranked, "daliy reveiw", 10)[0]?.path).toBe("review.md");
  });

  it("supports typo-tolerant body search without enabling noisy short-token fuzziness", () => {
    const ranked = buildSearchIndex([
      { path: "launch.md", title: "Plan", content: "Coordinate the production launch checklist." },
    ]);

    expect(querySearchIndex(ranked, "prodction", 10)[0]?.path).toBe("launch.md");
    expect(querySearchIndex(ranked, "prd", 10)).toEqual([]);
  });

  it("normalizes and prefix-matches Burmese tokens locally", () => {
    const ranked = buildSearchIndex([
      { path: "မြန်မာ.md", title: "မြန်မာ စီမံကိန်း", content: "နေ့စဉ် မှတ်စုများ" },
    ]);

    expect(querySearchIndex(ranked, "စီမံ", 10)[0]?.path).toBe("မြန်မာ.md");
    expect(querySearchIndex(ranked, "နေ့စဉ်", 10)[0]?.path).toBe("မြန်မာ.md");
  });

  it("bounds indexed content tokens to keep per-keystroke fuzzy work predictable", () => {
    const words = Array.from({ length: 1600 }, (_, i) => `token${i}`).join(" ");
    expect(buildSearchIndex([{ path: "large.md", title: "Large", content: words }])[0].contentTokens).toHaveLength(1200);
  });

  it("patches changed and deleted notes without rebuilding unchanged documents", () => {
    const patched = patchSearchIndex(index, [
      { path: "Inbox.md", title: "Inbox", content: "# Inbox\n\nNew idea" },
    ], ["Founder/Review.md"]);

    expect(querySearchIndex(patched, "new idea", 9)[0]?.path).toBe("Inbox.md");
    expect(querySearchIndex(patched, "ceo", 9)).toEqual([]);
  });

  it("reads only changed notes after the initial search index build", async () => {
    const docs = new Map<string, NoteFile>([
      ["A.md", { path: "A.md", title: "Alpha", content: "first draft", mtimeMs: 1 }],
      ["B.md", { path: "B.md", title: "Beta", content: "stable note", mtimeMs: 1 }],
    ]);
    let listCalls = 0;
    let readCalls = 0;
    const notes = {
      async listNotes() { listCalls += 1; return [...docs.values()].map((doc) => ({ ...doc, content: "" })); },
      async readNote(path: string) { readCalls += 1; return docs.get(path) ?? null; },
    } as unknown as NotesRepository;
    const search = new BrowserSearchRepository(notes);

    expect((await search.search("first"))[0]?.path).toBe("A.md");
    docs.set("A.md", { path: "A.md", title: "Alpha", content: "updated phrase", mtimeMs: 2 });
    await search.rebuildNoteIndex(["A.md"]);
    expect((await search.search("updated phrase"))[0]?.path).toBe("A.md");

    expect(listCalls).toBe(1);
    expect(readCalls).toBe(3);
  });
});
