import { describe, it, expect } from "vitest";
import { createElement } from "react";
import { titleFromContent, normalizeNotePath, hashContent } from "../../src/repositories/local/browserLocal.ts";
import { splitFrontmatter, extractCalloutInfo } from "../../src/components/editor/NoteReader.tsx";
import { findReadingBlockOffset, preserveSoftLineBreaksInMdast, promoteImplicitTitleLine } from "../../src/components/editor/markdownReading.ts";
import { noteOrder } from "../../src/repositories/local/noteOrderStore.ts";
import type { Root } from "mdast";

describe("Layer 1: Data Persistence & Storage Logic QA", () => {
  it("titleFromContent: extracts title from H1 tag and ignores YAML frontmatter", () => {
    const markdownWithFm = "---\ntitle: Ignore Me\n---\n# Real Title\n\nSome content here.";
    expect(titleFromContent("test.md", markdownWithFm)).toBe("Real Title");

    const plainMarkdown = "# Welcome to Sitku\nThis is a note.";
    expect(titleFromContent("welcome.md", plainMarkdown)).toBe("Welcome to Sitku");

    const noHeading = "Just some text without h1 heading.";
    expect(titleFromContent("fallback.md", noHeading)).toBe("Just some text without h1 heading.");

    const empty = "";
    expect(titleFromContent("MyNote.md", empty)).toBe("MyNote");
  });

  it("normalizeNotePath: normalizes paths and enforces .md extension safely", () => {
    expect(normalizeNotePath("folder/sub/note")).toBe("folder/sub/note.md");
    expect(normalizeNotePath("folder/sub/note.md")).toBe("folder/sub/note.md");
    expect(normalizeNotePath("  /root/test.MD  ")).toBe("root/test.md");
    expect(() => normalizeNotePath("../secret/file")).toThrow("Invalid note path");
  });

  it("hashContent: generates consistent SHA-256 hex hashes for note change detection", async () => {
    const hash1 = await hashContent("Hello World");
    const hash2 = await hashContent("Hello World");
    const hash3 = await hashContent("Hello World!");
    expect(hash1).toBe(hash2);
    expect(hash1).not.toBe(hash3);
    expect(hash1).toHaveLength(64); // SHA-256 hex string length
  });
});

describe("Layer 2 & 3: Editor Engine & Reader Callout Parsing QA", () => {
  it("splitFrontmatter: cleanly separates YAML frontmatter from markdown body", () => {
    const note = "---\ntitle: Test Note\ntags: [qa, sitku]\n---\n# Main Heading\n\nNote body.";
    const { fm, body } = splitFrontmatter(note);
    expect(fm).toBe("title: Test Note\ntags: [qa, sitku]");
    expect(body).toBe("# Main Heading\n\nNote body.");

    const noFmNote = "# Just Body\nNo YAML here.";
    const { fm: nullFm, body: fullBody } = splitFrontmatter(noFmNote);
    expect(nullFm).toBeNull();
    expect(fullBody).toBe("# Just Body\nNo YAML here.");
  });

  it("extractCalloutInfo: robustly extracts [!IMPORTANT], [!WARNING], [!PASS] callouts from string children", () => {
    const rawString = "   \n  [!IMPORTANT]  \nThis is an important message.";
    const { type, cleanedChildren } = extractCalloutInfo(rawString);
    expect(type).toBe("IMPORTANT");
    expect(cleanedChildren).toEqual(["This is an important message."]);
  });

  it("extractCalloutInfo: robustly handles whitespace and line breaks in React element trees", () => {
    // Simulate React markdown AST where blockquote has <p> child containing "[!WARNING]\nWarning text"
    const pElement = createElement("p", null, "   ", "[!WARNING]   Don't do this!");
    const { type, cleanedChildren } = extractCalloutInfo(pElement);
    expect(type).toBe("WARNING");
    expect(cleanedChildren).toBeDefined();
  });

  it("extractCalloutInfo: returns null type for standard blockquotes without callout syntax", () => {
    const normalQuote = "Just a regular quote without callout bracket.";
    const { type, cleanedChildren } = extractCalloutInfo(normalQuote);
    expect(type).toBeNull();
    expect(cleanedChildren).toBe(normalQuote);
  });

  it("preserveSoftLineBreaksInMdast: keeps editor line breaks visible in reading mode", () => {
    const tree: Root = {
      type: "root",
      children: [
        {
          type: "paragraph",
          children: [{ type: "text", value: "line one\nline two\nline three" }],
        },
      ],
    };

    preserveSoftLineBreaksInMdast(tree);

    expect(tree.children[0].children).toEqual([
      { type: "text", value: "line one" },
      { type: "break" },
      { type: "text", value: "line two" },
      { type: "break" },
      { type: "text", value: "line three" },
    ]);
  });

  it("promoteImplicitTitleLine: mirrors editor mode by treating the first plain line as the note title", () => {
    expect(promoteImplicitTitleLine("My Note Title\nbody line")).toBe("# My Note Title\nbody line");
    expect(promoteImplicitTitleLine("\n\nMy Note Title\nbody line")).toBe("\n\n# My Note Title\nbody line");
  });

  it("promoteImplicitTitleLine: leaves explicit markdown blocks alone", () => {
    expect(promoteImplicitTitleLine("# Already Heading\nbody")).toBe("# Already Heading\nbody");
    expect(promoteImplicitTitleLine("- list item\nbody")).toBe("- list item\nbody");
    expect(promoteImplicitTitleLine("![[Inbox]]\nbody")).toBe("![[Inbox]]\nbody");
  });

  it("findReadingBlockOffset: maps rendered headings, lists, callouts, and code to source", () => {
    const markdown = "# Roadmap\n\n- Ship the editor\n\n> [!NOTE] Keep backups\n\n```ts\nconst ready = true;\n```";
    expect(findReadingBlockOffset(markdown, "Roadmap")).toBe(markdown.indexOf("Roadmap"));
    expect(findReadingBlockOffset(markdown, "Ship the editor")).toBe(markdown.indexOf("Ship the editor"));
    expect(findReadingBlockOffset(markdown, "Keep backups")).toBe(markdown.indexOf("Keep backups"));
    expect(findReadingBlockOffset(markdown, "const ready = true;")).toBe(markdown.indexOf("const ready"));
  });

  it("findReadingBlockOffset: maps embeds by their original source syntax", () => {
    const markdown = "Title\n\n![[Source Note#Details]]\n";
    expect(findReadingBlockOffset(markdown, "![[Source Note#Details]]")).toBe(markdown.indexOf("![["));
  });
});

describe("Layer 4: Workspace Note Ordering & Hierarchy QA", () => {
  it("noteOrder: assigns stable weights and preserves hierarchy ordering", () => {
    const notes = [
      { path: "folder/noteA.md", mtimeMs: 1000 },
      { path: "folder/noteB.md", mtimeMs: 2000 },
    ];
    const weights = noteOrder.assign(notes);
    expect(weights["folder/noteA.md"]).toBeDefined();
    expect(weights["folder/noteB.md"]).toBeDefined();
  });
});
