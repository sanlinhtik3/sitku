import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { EditorState } from "@codemirror/state";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { syntaxTree } from "@codemirror/language";
import { describe, expect, it } from "vitest";
import { NoteReader } from "../../src/components/editor/NoteReader.tsx";
import { docStructureField } from "../../src/components/editor/cm/livePreview.tsx";
import { getImplicitTitleLineIndex } from "../../src/components/editor/markdownReading.ts";
import { markdownParityFixtures, type MarkdownParityFixture } from "../fixtures/markdownParity.ts";

function editorState(markdownText: string) {
  return EditorState.create({
    doc: markdownText,
    extensions: [markdown({ base: markdownLanguage }), docStructureField],
  });
}

function syntaxNames(state: EditorState) {
  const names = new Set<string>();
  syntaxTree(state).iterate({ enter: (node) => { names.add(node.name); } });
  return names;
}

function renderReader(fixture: MarkdownParityFixture) {
  return renderToStaticMarkup(createElement(NoteReader, {
    content: fixture.markdown,
    getNoteContent: (target: string) => fixture.embeddedContent?.[target] ?? null,
  }));
}

describe("Markdown parity: editor and reading mode share one fixture catalog", () => {
  for (const fixture of markdownParityFixtures) {
    it(`${fixture.feature} has equivalent editor structure and reading output`, () => {
      const state = editorState(fixture.markdown);
      const structure = state.field(docStructureField);
      const names = syntaxNames(state);
      const html = renderReader(fixture);

      switch (fixture.feature) {
        case "heading":
          expect(getImplicitTitleLineIndex(fixture.markdown)).toBe(0);
          expect(names).toContain("ATXHeading2");
          expect(html).toMatch(/<h1[^>]*>Project Alpha<\/h1>/);
          expect(html).toMatch(/<h2[^>]*>Goals<\/h2>/);
          break;
        case "line-break":
          expect(state.doc.lines).toBe(5);
          expect(html.match(/<br\s*\/>/g)?.length).toBe(2);
          break;
        case "list":
          expect(names).toContain("BulletList");
          expect(names).toContain("OrderedList");
          expect(html).toContain("<ul");
          expect(html).toContain("<ol");
          break;
        case "table":
          expect(structure.tableRanges).toEqual([[3, 5]]);
          expect(html).toContain("<table");
          expect(html).toContain("Notes");
          break;
        case "callout":
          expect(structure.lineCalloutType.get(3)).toBe("note");
          expect(structure.lineCalloutType.get(4)).toBe("note");
          expect(html).toContain("<blockquote");
          expect(html).toContain("Note</span>");
          break;
        case "code":
          expect(structure.fencedRanges).toEqual([[3, 5]]);
          expect(html).toContain("typescript</span>");
          expect(html).toContain("const ready = true;");
          break;
        case "math":
          expect(structure.mathRanges).toEqual([[3, 5]]);
          expect(html).toContain("class=\"katex\"");
          expect(html).toMatch(/mathnormal[^>]*>m<\/span>/);
          expect(html).toMatch(/mathnormal[^>]*>c<\/span>/);
          break;
        case "embed":
          expect([...structure.embedLineNumbers]).toEqual([3]);
          expect(html).toContain("Source Note");
          expect(html).toContain("Embedded knowledge.");
          break;
      }
    });
  }

  it("does not style a leading markdown block as an implicit editor title", () => {
    expect(getImplicitTitleLineIndex("- first item\n- second item")).toBe(-1);
    expect(getImplicitTitleLineIndex("| A | B |\n| - | - |")).toBe(-1);
    expect(getImplicitTitleLineIndex("![[Source Note]]")).toBe(-1);
  });

  it("finds the implicit title after frontmatter", () => {
    expect(getImplicitTitleLineIndex("---\nstatus: active\n---\nProject Alpha\nBody")).toBe(3);
  });
});
