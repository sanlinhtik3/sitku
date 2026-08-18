export type VoiceMode = "command" | "conversation" | "dictation" | "question" | "system_control";

export type VoiceIntentName =
  | "save_to_inbox"
  | "create_note"
  | "open_note"
  | "update_note"
  | "append_note"
  | "rename_note"
  | "delete_note"
  | "summarize_note"
  | "create_task"
  | "list_today_tasks"
  | "complete_task"
  | "daily_review"
  | "get_vault_stats"
  | "explain_last_failure"
  | "delegate_operator_task"
  | "get_operator_status"
  | "cancel_operator_task"
  | "revenue_update"
  | "open_dashboard"
  | "coach_mode"
  | "ceo_mode"
  | "open_cfo"
  | "open_consultant"
  | "close"
  | "none";

export type VoiceSkill =
  | "inbox_skill"
  | "notes_skill"
  | "tasks_skill"
  | "dashboard_skill"
  | "money_skill"
  | "coach_skill"
  | "ceo_skill"
  | "system_skill"
  | "terminal_skill"
  | "conversation_skill";

export type VoiceActionStatus = "idle" | "confirming" | "running" | "completed" | "failed" | "cancelled";

export interface VoiceActionPayload {
  content?: string;
  target?: string;
  amount?: number;
  source?: string;
  date?: string;
  [key: string]: unknown;
}

export interface VoiceActionResult {
  result?: string;
  reply?: string;
}

export interface VoiceActionHistoryItem {
  id: string;
  turnId?: string;
  idempotencyKey?: string;
  timestamp: string;
  intent: string;
  skill: VoiceSkill;
  result: string;
  status: VoiceActionStatus;
}

export interface VoiceActionHistoryDisplayItem extends VoiceActionHistoryItem {
  occurrences: number;
}

export const SKILL_BY_INTENT: Record<VoiceIntentName, VoiceSkill> = {
  save_to_inbox: "inbox_skill",
  create_note: "notes_skill",
  open_note: "notes_skill",
  update_note: "notes_skill",
  append_note: "notes_skill",
  rename_note: "notes_skill",
  delete_note: "notes_skill",
  summarize_note: "notes_skill",
  create_task: "tasks_skill",
  list_today_tasks: "tasks_skill",
  complete_task: "tasks_skill",
  daily_review: "ceo_skill",
  get_vault_stats: "notes_skill",
  explain_last_failure: "system_skill",
  delegate_operator_task: "system_skill",
  get_operator_status: "system_skill",
  cancel_operator_task: "system_skill",
  revenue_update: "money_skill",
  open_dashboard: "dashboard_skill",
  coach_mode: "coach_skill",
  ceo_mode: "ceo_skill",
  open_cfo: "money_skill",
  open_consultant: "coach_skill",
  close: "system_skill",
  none: "conversation_skill",
};

const IMPORTANT_INTENTS = new Set<VoiceIntentName>([
  "save_to_inbox",
  "create_note",
  "update_note",
  "append_note",
  "rename_note",
  "delete_note",
  "create_task",
  "complete_task",
  "revenue_update",
]);

const HISTORY_STORE = "beebot-jarvis-action-history";
const MAX_STORED_HISTORY = 100;

export function voiceSkillForIntent(intent: string | undefined): VoiceSkill {
  return SKILL_BY_INTENT[(intent || "none") as VoiceIntentName] || "conversation_skill";
}

export function voiceIntentNeedsConfirmation(intent: string | undefined): boolean {
  return IMPORTANT_INTENTS.has((intent || "none") as VoiceIntentName);
}

export function voiceModeForIntent(intent: string | undefined): VoiceMode {
  const name = (intent || "none") as VoiceIntentName;
  if (name === "none") return "conversation";
  if (name === "save_to_inbox") return "dictation";
  if (name === "open_dashboard" || name === "open_cfo" || name === "open_consultant" || name === "close") return "system_control";
  if (name === "coach_mode" || name === "ceo_mode" || name === "daily_review" || name === "explain_last_failure" || name === "delegate_operator_task" || name === "get_operator_status" || name === "cancel_operator_task") return "conversation";
  return "command";
}

export function voiceStateLabel(status: VoiceActionStatus, phase?: string): string {
  if (phase === "recording") return "Listening";
  if (phase === "thinking") return "Thinking";
  if (phase === "confirm") return "Confirming";
  if (phase === "running_skill") return "Running Skill";
  if (status === "confirming") return "Confirming";
  if (status === "running") return "Running Skill";
  if (status === "completed") return "Completed";
  if (status === "failed") return "Failed";
  if (status === "cancelled") return "Cancelled";
  return "Ready";
}

export function loadVoiceActionHistory(): VoiceActionHistoryItem[] {
  if (typeof localStorage === "undefined") return [];
  try {
    const value = JSON.parse(localStorage.getItem(HISTORY_STORE) || "[]");
    return Array.isArray(value) ? value.slice(0, MAX_STORED_HISTORY) : [];
  } catch {
    return [];
  }
}

export function saveVoiceActionHistory(history: VoiceActionHistoryItem[]): void {
  if (typeof localStorage === "undefined") return;
  try { localStorage.setItem(HISTORY_STORE, JSON.stringify(history.slice(0, MAX_STORED_HISTORY))); }
  catch { /* History must never block the requested action. */ }
}

/** Keep the journal truthful while making immediate retry noise readable. */
export function compactVoiceActionHistory(history: VoiceActionHistoryItem[]): VoiceActionHistoryDisplayItem[] {
  return history.reduce<VoiceActionHistoryDisplayItem[]>((rows, item) => {
    const previous = rows.at(-1);
    const previousAt = previous ? Date.parse(previous.timestamp) : Number.NaN;
    const itemAt = Date.parse(item.timestamp);
    const isImmediateDuplicate = Boolean(
      previous
      && previous.intent === item.intent
      && previous.status === item.status
      && previous.result === item.result
      && Number.isFinite(previousAt)
      && Number.isFinite(itemAt)
      && Math.abs(previousAt - itemAt) <= 60_000,
    );
    if (isImmediateDuplicate && previous) {
      previous.occurrences += 1;
      return rows;
    }
    rows.push({ ...item, occurrences: 1 });
    return rows;
  }, []);
}

export function lowConfidenceClarifier(text: string | undefined): string {
  const burmese = /[\u1000-\u109f]/.test(text || "");
  return burmese
    ? "သိပ်မသေချာသေးပါဘူး။ သိမ်းမလား၊ task လုပ်မလား၊ ဒါမှမဟုတ် ပြန်ရှာပေးရမလား?"
    : "I am not sure yet. Do you want me to save this, search this, or create a task?";
}
