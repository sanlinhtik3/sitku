import type { AgentTask, MemoryRepository, NoteFile, NotesRepository, TaskRepository } from "@/repositories/contracts";
import { financeStore } from "@/repositories/local/financeStore";
import { amountFromText, firstWords, parseVoiceCommandText, safeTitle, type Intent, type JarvisAction } from "../core/intentParser";
import type { VoiceActionResult } from "../core/commands";
import { referencesPriorConversation } from "../core/conversationContext";
import { EvOperatorAgent, isOperatorTask } from "@/features/ev-voice/operator";
import {
  captureWorkspaceTruth,
  runWorkspaceNoteAction,
  stableContentHash,
} from "@/features/ev-voice/workspace/workspaceContext";

export async function execAction(
  repos: { notes: NotesRepository; tasks: TaskRepository; memories: MemoryRepository; operator?: EvOperatorAgent },
  action: JarvisAction,
  title?: string,
  intent?: Intent,
): Promise<VoiceActionResult> {
  const { notes, tasks, memories, operator } = repos;
  const transcript = intent?.transcript?.trim() || "";
  const payload = intent?.payload || {};
  const rawTitle = title || payload.target || firstWords(transcript, 7);
  const t = safeTitle(String(rawTitle || "")) || `Voice ${Date.now()}`;
  const content = String(payload.content || "").trim();

  if (action === "open_cfo" || (action === "open_dashboard" && dashboardTarget(intent) === "cfo")) {
    window.location.hash = "cfo";
    return { result: "Opened revenue dashboard", reply: "Revenue dashboard ဖွင့်ပြီးပါပြီ။" };
  }
  if (action === "open_consultant" || (action === "open_dashboard" && dashboardTarget(intent) === "consultant")) {
    window.location.hash = "consultant";
    return { result: "Opened consultant dashboard", reply: "Consultant dashboard ဖွင့်ပြီးပါပြီ။" };
  }
  if (action === "open_dashboard") {
    window.location.hash = "cfo";
    return { result: "Opened dashboard", reply: "Dashboard ဖွင့်ပြီးပါပြီ။" };
  }
  if (action === "close") {
    if (window.location.hash) window.location.hash = "";
    const url = new URL(window.location.href);
    if (url.searchParams.has("_s")) {
      url.searchParams.delete("_s");
      window.history.pushState(null, "", url.toString());
    }
    return { result: "Closed active room", reply: "ပိတ်ပြီးပါပြီ။" };
  }
  if (action === "save_to_inbox") {
    const saved = await notes.writeNote({
      path: `Inbox/${t}.md`,
      content: `# ${t}\n\n${content || transcript}\n\n---\nCaptured: ${new Date().toISOString()}\n`,
    });
    return { result: `Saved inbox item: ${saved.title}`, reply: `Inbox ထဲ "${saved.title}" သိမ်းပြီးပါပြီ။` };
  }
  if (action === "create_note") {
    if (!content && referencesPriorConversation(transcript)) {
      throw new Error("INVALID_INPUT: referenced conversation content is unavailable; no empty note was created");
    }
    const requestedPath = voiceNotePath(String(payload.path || t));
    const duplicate = await resolveNote(notes, requestedPath, false).catch((error) => {
      if (isMissingTarget(error)) return null;
      throw error;
    });
    if (duplicate) throw new Error(`CONFLICT: note already exists: ${duplicate.path}`);
    const noteContent = content || `# ${titleFromVoicePath(requestedPath)}\n\n`;
    const receipt = await runWorkspaceNoteAction("createNote", { path: requestedPath, content: noteContent });
    const saved = await verifyWrittenNote(notes, receipt.path, noteContent);
    await verifyActivePath(receipt.path);
    return { result: `Created and opened note: ${saved.path}`, reply: `"${saved.title}" note ဖန်တီးပြီး ဖွင့်ထားပါတယ်။` };
  }
  if (action === "open_note") {
    const hit = await resolveNote(notes, noteTarget(intent, title), true);
    await runWorkspaceNoteAction("openNote", { path: hit.path });
    await verifyActivePath(hit.path);
    return { result: `Opened note: ${hit.title}`, reply: `"${hit.title}" note ဖွင့်ပြီးပါပြီ။` };
  }
  if (action === "update_note" || action === "append_note") {
    if (!content) throw new Error("INVALID_INPUT: note content is required");
    const hit = await resolveNote(notes, noteTarget(intent, title), true);
    const active = await captureWorkspaceTruth();
    const sourceContent = active?.activeFile?.path === hit.path ? active.activeFile.content : hit.content;
    const expectedContentHash = active?.activeFile?.path === hit.path
      ? active.activeFile.contentHash
      : (hit.contentHash || stableContentHash(hit.content));
    const nextContent = action === "append_note"
      ? `${sourceContent.replace(/\s+$/, "")}\n\n${content}\n`
      : content;
    await runWorkspaceNoteAction("updateNote", {
      path: hit.path,
      content: nextContent,
      expectedContentHash,
    });
    const saved = await verifyWrittenNote(notes, hit.path, nextContent);
    return {
      result: `${action === "append_note" ? "Appended to" : "Updated"} note: ${saved.path}`,
      reply: `"${saved.title}" note ကို ${action === "append_note" ? "စာထပ်ထည့်" : "ပြင်ဆင်"}ပြီးပါပြီ။`,
    };
  }
  if (action === "rename_note") {
    const hit = await resolveNote(notes, noteTarget(intent, title), true);
    const newTitle = safeTitle(String(payload.newTitle || ""));
    if (!newTitle) throw new Error("INVALID_INPUT: new note title is required");
    const parent = hit.path.includes("/") ? hit.path.slice(0, hit.path.lastIndexOf("/") + 1) : "";
    const newPath = `${parent}${voiceNotePath(newTitle)}`;
    const existing = await resolveNote(notes, newPath, false).catch((error) => {
      if (isMissingTarget(error)) return null;
      throw error;
    });
    if (existing && existing.path !== hit.path) throw new Error(`CONFLICT: note already exists: ${existing.path}`);
    await runWorkspaceNoteAction("renameNote", { path: hit.path, newPath });
    if (await notes.readNote(hit.path)) throw new Error(`ACTION_VERIFICATION_FAILED: old note still exists: ${hit.path}`);
    const renamed = await notes.readNote(newPath);
    if (!renamed) throw new Error(`ACTION_VERIFICATION_FAILED: renamed note missing: ${newPath}`);
    await verifyActivePath(newPath);
    return { result: `Renamed note: ${hit.path} -> ${newPath}`, reply: `Note ကို "${renamed.title}" လို့ အမည်ပြောင်းပြီးပါပြီ။` };
  }
  if (action === "delete_note") {
    const hit = await resolveNote(notes, noteTarget(intent, title), true);
    const snapshot = await captureWorkspaceTruth();
    const expectedContentHash = snapshot?.activeFile?.path === hit.path
      ? snapshot.activeFile.contentHash
      : (hit.contentHash || stableContentHash(hit.content));
    await runWorkspaceNoteAction("deleteNote", { path: hit.path, expectedContentHash });
    if (await notes.readNote(hit.path)) throw new Error(`ACTION_VERIFICATION_FAILED: deleted note still exists: ${hit.path}`);
    return { result: `Deleted note: ${hit.path}`, reply: `"${hit.title}" note ကို ဖျက်ပြီးပါပြီ။` };
  }
  if (action === "summarize_note") {
    const hit = await resolveNote(notes, noteTarget(intent, title), true);
    return { result: `Summarized note: ${hit.title}`, reply: summarizeContent(hit.title, hit.content) };
  }
  if (action === "create_task") {
    const task = await tasks.upsertTask({ title: t, metadata: { source: "voice", transcript } });
    return { result: `Created task: ${task.title}`, reply: `"${task.title}" task ထည့်ပြီးပါပြီ။` };
  }
  if (action === "list_today_tasks") {
    const list = await tasks.listTasks();
    const active = list.filter((task) => !isOperatorTask(task) && task.status !== "completed" && task.status !== "cancelled").slice(0, 8);
    const lines = active.map((task, i) => `${i + 1}. ${task.title}`);
    return {
      result: `Listed ${active.length} active tasks`,
      reply: lines.length ? `ဒီနေ့ task တွေ:\n${lines.join("\n")}` : "ဒီနေ့ active task မတွေ့သေးပါ။",
    };
  }
  if (action === "complete_task") {
    const task = await findTask(tasks, t);
    if (!task) throw new Error(`task not found: ${t}`);
    await tasks.upsertTask({ ...task, status: "completed", metadata: { ...(task.metadata || {}), completedBy: "voice" } });
    return { result: `Completed task: ${task.title}`, reply: `"${task.title}" completed လုပ်ပြီးပါပြီ။` };
  }
  if (action === "daily_review") {
    const [noteList, taskList] = await Promise.all([
      notes.queryByDate?.({ dateRange: "today", action: "modified", limit: 5 }) || notes.listNotes({ limit: 5, sortBy: "mtime", sortOrder: "desc" }),
      tasks.listTasks().catch(() => [] as AgentTask[]),
    ]);
    const userTasks = taskList.filter((task) => !isOperatorTask(task));
    const done = userTasks.filter((task) => task.status === "completed").length;
    const active = userTasks.filter((task) => task.status !== "completed" && task.status !== "cancelled").slice(0, 3);
    return {
      result: "Generated daily review",
      reply: [
        `ဒီနေ့ note ${noteList.length} ခု update ဖြစ်ထားပါတယ်။ Task completed ${done} ခု။`,
        active.length ? `နောက် action: ${active[0].title}` : "နောက် action တစ်ခု သတ်မှတ်မလား?",
      ].join("\n"),
    };
  }
  if (action === "get_vault_stats") {
    const entries = await notes.listEntries();
    const noteCount = entries.filter((entry) => entry.kind === "note").length;
    const folderCount = entries.filter((entry) => entry.kind === "folder").length;
    return {
      result: `Active vault contains ${noteCount} Markdown files and ${folderCount} folders.`,
      reply: `လက်ရှိ vault ထဲမှာ Markdown file ${noteCount} ခုနဲ့ folder ${folderCount} ခု ရှိပါတယ်။`,
    };
  }
  if (action === "delegate_operator_task") {
    if (!operator) throw new Error("E.V Operator is unavailable in this runtime.");
    const request = String(payload.content || transcript || title || "").trim();
    const idempotencyKey = String(payload.idempotencyKey || `ev-operator:${payload.turnId || Date.now()}`);
    const job = await operator.start({ request, idempotencyKey, turnId: String(payload.turnId || "") || undefined });
    return {
      result: `Operator ${job.id} started in background.`,
      reply: "Operator ကို background မှာ စတင်ခိုင်းထားပါတယ်။ စကားဆက်ပြောလို့ရပါတယ်။ ပြီးရင် E.V က report ပြန်ပေးပါမယ်။",
    };
  }
  if (action === "get_operator_status") {
    if (!operator) throw new Error("E.V Operator is unavailable in this runtime.");
    const jobId = String(payload.jobId || payload.target || "").trim();
    const job = jobId ? await operator.get(jobId) : await operator.latest();
    if (!job) return { result: "No Operator jobs found.", reply: "Operator task မရှိသေးပါဘူး။" };
    const detail = job.result || job.error?.message || "Result မရသေးပါ။";
    return { result: `Operator ${job.id}: ${job.status}. ${detail}`, reply: `Operator task က ${job.status} ဖြစ်ပါတယ်။ ${detail}` };
  }
  if (action === "cancel_operator_task") {
    if (!operator) throw new Error("E.V Operator is unavailable in this runtime.");
    const jobId = String(payload.jobId || payload.target || "").trim();
    const job = await operator.cancel(jobId || undefined);
    return { result: `Operator ${job.id} is ${job.status}.`, reply: "Operator task ကို ရပ်လိုက်ပါပြီ။" };
  }
  if (action === "revenue_update") {
    const amount = typeof payload.amount === "number" ? payload.amount : amountFromText(transcript);
    const source = String(payload.source || "voice");
    if (!amount || amount <= 0) throw new Error("revenue amount is required");
    const accounts = await financeStore.listAccounts("local-user");
    const account = accounts.find((item) => item.is_default) || accounts[0];
    const categories = await financeStore.listCategories("local-user");
    const category = categories.find((item) => item.type === "income" && item.name === "Business")
      || categories.find((item) => item.type === "income");
    const saved = await financeStore.addTransaction("local-user", {
      type: "income",
      amount,
      account_id: account?.id || "",
      currency: account?.currency || "THB",
      category_id: category?.id || null,
      description: content || transcript || "Voice revenue update",
      source,
      transaction_date: typeof payload.date === "string" ? payload.date : undefined,
    });
    window.dispatchEvent(new CustomEvent("beebot:finance-changed"));
    return { result: `Added revenue: ${saved.amount} ${saved.currency}`, reply: `${saved.amount} ${saved.currency} ဝင်ငွေ ထည့်ပြီးပါပြီ။` };
  }
  if (action === "coach_mode") {
    await memories.upsertMemory({
      content: "User opened Coach Mode from voice.",
      category: "voice_mode",
      tags: ["coach", "voice"],
      importance: 0.4,
    }).catch(() => undefined);
    return { result: "Entered coach mode", reply: "Coach mode ဖွင့်ထားပါတယ်။ အခု အခက်ဆုံးတစ်ခုက ဘာလဲ?" };
  }
  if (action === "ceo_mode") {
    return {
      result: "Entered CEO mode",
      reply: "CEO mode ဖွင့်ထားပါတယ်။ ဒီနေ့ goal ဘာလဲ? ဘာပြီးသွားလဲ? ဘာ block ဖြစ်နေလဲ?",
    };
  }
  return { result: "No action", reply: intent?.reply || "ဟုတ်ကဲ့။" };
}

// No-key fallback for open-ended questions. Known commands are parsed and executed by the engine
// before reaching this function, so local actions do not require Gemini.
export async function offlineRoute(raw: string): Promise<string> {
  const t = raw.toLowerCase().trim();
  const has = (...k: string[]) => k.some((w) => t.includes(w));
  if (has("time", "clock", "အချိန်", "နာရီ")) return `အခု ${new Date().toLocaleTimeString()} ဖြစ်ပါတယ်။`;
  if (has("date", "today", "ရက်စွဲ", "ဘယ်နေ့")) return `ဒီနေ့ ${new Date().toLocaleDateString()} ဖြစ်ပါတယ်။`;
  const parsed = parseVoiceCommandText(raw);
  if (parsed.action !== "none") return parsed.reply;
  return "ဒီမေးခွန်းကို AI နဲ့ဆွေးနွေးဖို့ Gemini key လိုပါတယ်။ Local command တွေကိုတော့ ဆက်သုံးနိုင်ပါတယ်။";
}

export async function resolveNote(notes: NotesRepository, query: string, allowActive: boolean): Promise<NoteFile> {
  const raw = query.trim();
  const snapshot = allowActive ? await captureWorkspaceTruth() : null;
  if (!raw && snapshot?.activeFile) {
    return {
      path: snapshot.activeFile.path,
      title: snapshot.activeFile.title,
      content: snapshot.activeFile.content,
      contentHash: snapshot.activeFile.contentHash,
      mtimeMs: snapshot.activeFile.mtimeMs,
    };
  }
  if (!raw) throw new Error("INVALID_INPUT: note name is required and no active note is open");
  const q = normalizeNoteLookup(raw);
  const list = await notes.listNotes({ limit: 500 });
  const exactPath = list.filter((note) => normalizeNoteLookup(note.path) === q || normalizeNoteLookup(stripMd(note.path)) === q);
  if (exactPath.length === 1) return hydrateNote(notes, exactPath[0]);
  const exactTitle = list.filter((note) => normalizeNoteLookup(note.title) === q || normalizeNoteLookup(stripMd(note.path.split("/").pop() || "")) === q);
  if (exactTitle.length === 1) return hydrateNote(notes, exactTitle[0]);
  const partial = list.filter((note) => normalizeNoteLookup(note.title).includes(q) || normalizeNoteLookup(note.path).includes(q));
  if (partial.length === 1) return hydrateNote(notes, partial[0]);
  if (partial.length > 1 || exactTitle.length > 1 || exactPath.length > 1) {
    const candidates = (partial.length ? partial : exactTitle.length ? exactTitle : exactPath)
      .slice(0, 5)
      .map((note) => note.path)
      .join(", ");
    throw new Error(`AMBIGUOUS_TARGET: multiple notes match "${raw}": ${candidates}`);
  }
  throw new Error(`FILE_NOT_FOUND: note not found: ${raw}`);
}

async function hydrateNote(notes: NotesRepository, note: NoteFile): Promise<NoteFile> {
  return note.content ? note : (await notes.readNote(note.path)) || note;
}

function noteTarget(intent?: Intent, title?: string): string {
  return String(intent?.payload?.path || intent?.payload?.target || intent?.target || title || "").trim();
}

function normalizeNoteLookup(value: string): string {
  return value.normalize("NFKC").replace(/\\/g, "/").replace(/^\/+|\/+$/g, "").trim().toLocaleLowerCase();
}

function stripMd(value: string): string {
  return value.replace(/\.md$/i, "");
}

function voiceNotePath(value: string): string {
  const cleaned = value
    .normalize("NFKC")
    .replace(/\\/g, "/")
    .split("/")
    .map((part) => safeTitle(stripMd(part)))
    .filter(Boolean)
    .join("/");
  if (!cleaned) throw new Error("INVALID_INPUT: note title is required");
  return `${cleaned}.md`;
}

function titleFromVoicePath(path: string): string {
  return stripMd(path.split("/").pop() || path);
}

function isMissingTarget(error: unknown): boolean {
  return error instanceof Error && error.message.startsWith("FILE_NOT_FOUND:");
}

async function verifyWrittenNote(notes: NotesRepository, path: string, expectedContent: string): Promise<NoteFile> {
  const saved = await notes.readNote(path);
  if (!saved) throw new Error(`ACTION_VERIFICATION_FAILED: note was not persisted: ${path}`);
  if (stableContentHash(saved.content) !== stableContentHash(expectedContent)) {
    throw new Error(`ACTION_VERIFICATION_FAILED: persisted note content does not match: ${path}`);
  }
  return saved;
}

async function verifyActivePath(path: string): Promise<void> {
  const snapshot = await captureWorkspaceTruth();
  if (!snapshot || snapshot.activeFile?.path !== path) {
    throw new Error(`ACTION_VERIFICATION_FAILED: note did not become active: ${path}`);
  }
}

async function findTask(tasks: TaskRepository, query: string): Promise<AgentTask | null> {
  const q = query.trim().toLowerCase();
  const list = (await tasks.listTasks()).filter((task) => !isOperatorTask(task));
  return (
    list.find((task) => task.title.toLowerCase() === q) ||
    list.find((task) => task.title.toLowerCase().includes(q)) ||
    null
  );
}

function summarizeContent(title: string, content: string): string {
  const plain = content
    .replace(/^---[\s\S]*?---/m, "")
    .replace(/^#+\s+/gm, "")
    .replace(/\s+/g, " ")
    .trim();
  const summary = plain.slice(0, 220) || "အကြောင်းအရာမရှိသေးပါ။";
  return `"${title}" summary: ${summary}${plain.length > 220 ? "..." : ""}`;
}

function dashboardTarget(intent?: Intent): "cfo" | "consultant" | "" {
  const raw = `${intent?.target || ""} ${intent?.payload?.target || ""} ${intent?.transcript || ""}`.toLowerCase();
  if (/consultant|coach/.test(raw)) return "consultant";
  if (/cfo|money|revenue|income|dashboard/.test(raw)) return "cfo";
  return "";
}
