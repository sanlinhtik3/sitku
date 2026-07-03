// ═══ Conversation export utilities ═══
// Build Markdown / JSON downloads from chat history. Uses file-saver
// (already a dependency) so the same code works in browser + PWA.
import { saveAs } from "file-saver";

export interface ExportableMessage {
  role: string;
  content: string | null;
  created_at: string;
  is_error?: boolean | null;
  attachments?: unknown;
}

export interface ExportableSession {
  id: string;
  title?: string | null;
  created_at?: string;
}

function safeFilename(title: string): string {
  // Strip filesystem-unsafe chars; collapse whitespace; cap length.
  return (title || "chat")
    .replace(/[\\/:*?"<>|]+/g, "")
    .replace(/\s+/g, "-")
    .slice(0, 80)
    .toLowerCase() || "chat";
}

function formatTimestamp(iso: string): string {
  try {
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? iso : d.toISOString().replace("T", " ").slice(0, 19);
  } catch {
    return iso;
  }
}

export function buildMarkdown(session: ExportableSession, messages: ExportableMessage[]): string {
  const title = session.title || "Untitled chat";
  const lines: string[] = [];
  lines.push(`# ${title}`);
  lines.push("");
  lines.push(`**Session:** \`${session.id}\``);
  if (session.created_at) lines.push(`**Started:** ${formatTimestamp(session.created_at)}`);
  lines.push(`**Messages:** ${messages.length}`);
  lines.push("");
  lines.push("---");
  lines.push("");
  for (const msg of messages) {
    const role = msg.role === "assistant" ? "🐝 BeeBot" : msg.role === "user" ? "You" : msg.role;
    const ts = formatTimestamp(msg.created_at);
    lines.push(`## ${role}  \n*${ts}*`);
    lines.push("");
    if (msg.is_error) lines.push("> ⚠️ Error");
    lines.push(msg.content?.trim() || "_(no content)_");
    lines.push("");
  }
  return lines.join("\n");
}

export function buildJSON(session: ExportableSession, messages: ExportableMessage[]): string {
  return JSON.stringify(
    {
      session: { id: session.id, title: session.title || null, created_at: session.created_at || null },
      exported_at: new Date().toISOString(),
      message_count: messages.length,
      messages: messages.map((m) => ({
        role: m.role,
        content: m.content,
        created_at: m.created_at,
        is_error: !!m.is_error,
        attachments: m.attachments ?? null,
      })),
    },
    null,
    2,
  );
}

export function exportSessionAsMarkdown(session: ExportableSession, messages: ExportableMessage[]): void {
  const md = buildMarkdown(session, messages);
  const blob = new Blob([md], { type: "text/markdown;charset=utf-8" });
  saveAs(blob, `${safeFilename(session.title || session.id)}.md`);
}

export function exportSessionAsJSON(session: ExportableSession, messages: ExportableMessage[]): void {
  const json = buildJSON(session, messages);
  const blob = new Blob([json], { type: "application/json;charset=utf-8" });
  saveAs(blob, `${safeFilename(session.title || session.id)}.json`);
}
