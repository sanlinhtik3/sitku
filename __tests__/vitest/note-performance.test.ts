import { describe, expect, it, vi } from "vitest";
import type { NoteFile } from "../../src/repositories/contracts/notes";
import {
  isMatchingLocalWriteEcho,
  rememberLocalNoteWrite,
  shouldAnimateNoteSwitch,
  type LocalWriteMarker,
} from "../../src/pages/workspace/notePerformance";

function note(path: string, content: string): NoteFile {
  return { path, title: path, content, contentHash: `hash:${content}` };
}

describe("note editor performance policy", () => {
  it("suppresses a watcher echo only when disk content matches the local save", async () => {
    const markers = new Map<string, LocalWriteMarker>();
    rememberLocalNoteWrite(markers, "Inbox.md", "local draft", 1_000);
    const readNote = vi.fn(async () => note("Inbox.md", "local draft"));

    await expect(isMatchingLocalWriteEcho(["Inbox.md"], markers, readNote, 1_100)).resolves.toBe(true);
    expect(readNote).toHaveBeenCalledTimes(1);

    readNote.mockResolvedValue(note("Inbox.md", "external edit"));
    await expect(isMatchingLocalWriteEcho(["Inbox.md"], markers, readNote, 1_200)).resolves.toBe(false);
  });

  it("never hides structural, unknown, or expired watcher events", async () => {
    const markers = new Map<string, LocalWriteMarker>();
    rememberLocalNoteWrite(markers, "Inbox.md", "local draft", 1_000);
    const readNote = vi.fn(async () => note("Inbox.md", "local draft"));

    await expect(isMatchingLocalWriteEcho(["*"], markers, readNote, 1_100)).resolves.toBe(false);
    await expect(isMatchingLocalWriteEcho(["Other.md"], markers, readNote, 1_100)).resolves.toBe(false);
    await expect(isMatchingLocalWriteEcho(["Inbox.md"], markers, readNote, 5_000)).resolves.toBe(false);
  });

  it("uses document-level transitions only for mobile navigation", () => {
    expect(shouldAnimateNoteSwitch(true, true, false)).toBe(true);
    expect(shouldAnimateNoteSwitch(false, true, false)).toBe(false);
    expect(shouldAnimateNoteSwitch(true, false, false)).toBe(false);
    expect(shouldAnimateNoteSwitch(true, true, true)).toBe(false);
  });
});
