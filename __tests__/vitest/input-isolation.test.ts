import { describe, expect, it } from "vitest";
import { chatDraftStorageKey } from "../../src/components/agent-chat/ChatInput";
import { editorContentAttributes } from "../../src/components/editor/LiveMarkdownEditor";

describe("input isolation", () => {
  it("keeps independent chat surfaces in separate draft slots", () => {
    expect(chatDraftStorageKey()).toBe("sitku-draft:main");
    expect(chatDraftStorageKey("embedded-note")).toBe("sitku-draft:embedded-note");
    expect(chatDraftStorageKey("thread:42")).toBe("sitku-draft:thread:42");
    expect(chatDraftStorageKey("memory")).toBe("sitku-draft:memory");
  });

  it("disables background writing services without disabling optional spellcheck", () => {
    const attributes = editorContentAttributes(true, "Start writing");

    expect(attributes).toMatchObject({
      spellcheck: "true",
      autocomplete: "off",
      autocorrect: "off",
      autocapitalize: "off",
      writingsuggestions: "false",
      "data-gramm": "false",
      "data-gramm_editor": "false",
      "data-enable-grammarly": "false",
      "data-placeholder": "Start writing",
      "aria-label": "Note editor",
    });
  });
});
