import type { NoteFile } from "@/repositories/contracts/notes";

export interface LocalWriteMarker {
  content: string;
  expiresAt: number;
}

export const LOCAL_WRITE_ECHO_TTL_MS = 3_000;

export function rememberLocalNoteWrite(
  markers: Map<string, LocalWriteMarker>,
  path: string,
  content: string,
  now = Date.now(),
) {
  markers.set(path, {
    content,
    expiresAt: now + LOCAL_WRITE_ECHO_TTL_MS,
  });
}

export async function isMatchingLocalWriteEcho(
  paths: string[],
  markers: Map<string, LocalWriteMarker>,
  readNote: (path: string) => Promise<NoteFile | null>,
  now = Date.now(),
) {
  for (const [path, marker] of markers) {
    if (marker.expiresAt < now) markers.delete(path);
  }
  if (!paths.length || paths.includes("*")) return false;

  for (const path of paths) {
    const marker = markers.get(path);
    if (!marker || marker.expiresAt < now) return false;
    const note = await readNote(path).catch(() => null);
    if (!note || note.content !== marker.content) return false;
  }
  return true;
}

export function shouldAnimateNoteSwitch(
  isMobile: boolean,
  supportsViewTransitions: boolean,
  prefersReducedMotion: boolean,
) {
  return isMobile && supportsViewTransitions && !prefersReducedMotion;
}
