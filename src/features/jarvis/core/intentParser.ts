import {
  voiceIntentNeedsConfirmation,
  voiceModeForIntent,
  voiceSkillForIntent,
  type VoiceActionPayload,
  type VoiceIntentName,
  type VoiceMode,
  type VoiceSkill,
} from "./commands";
import { referencesPriorConversation } from "./conversationContext";

export type JarvisAction = VoiceIntentName;
export interface Intent {
  action: JarvisAction;
  title?: string;
  target?: string;
  mode?: VoiceMode;
  skill?: VoiceSkill;
  confidence?: number;
  requiresConfirmation?: boolean;
  payload?: VoiceActionPayload;
  reply: string;
  transcript?: string;
}

export const safeTitle = (s: string) => s.replace(/[\\/:*?"<>|]/g, "").trim();

interface ParsedNoteMutation {
  target: string;
  content: string;
}

function parseAppendNoteMutation(text: string): ParsedNoteMutation | null {
  const english = text.match(/^(?:append|add)\s+(.+?)\s+to\s+(?:the\s+)?note\s+(.+)$/i)
    || text.match(/^(?:append|add)\s+to\s+(?:the\s+)?note\s+([^:]+):\s*(.+)$/i);
  if (english) {
    const targetFirst = /^\s*(?:append|add)\s+to\s+/i.test(text);
    return targetFirst
      ? { target: english[1].trim(), content: english[2].trim() }
      : { target: english[2].trim(), content: english[1].trim() };
  }

  const burmese = text.match(/^(.+?)\s*(?:note|မှတ်စု)\s*(?:ထဲ|မှာ)\s*(.+?)\s*(?:ထပ်ထည့်|ထပ်ရေး)\s*$/i);
  return burmese ? { target: burmese[1].trim(), content: burmese[2].trim() } : null;
}

function parseUpdateNoteMutation(text: string): ParsedNoteMutation | null {
  const english = text.match(/^(?:update|replace)\s+(?:the\s+)?note\s+(.+?)\s+(?:with|to)\s+(.+)$/i);
  if (english) return { target: english[1].trim(), content: english[2].trim() };

  const burmese = text.match(/^(.+?)\s*(?:note|မှတ်စု)\s*ကို\s*(.+?)\s*(?:နဲ့|ဖြင့်)\s*(?:ပြင်|အစားထိုး)\s*$/i);
  return burmese ? { target: burmese[1].trim(), content: burmese[2].trim() } : null;
}

export function parseVoiceCommandText(raw: string): Intent {
  const text = raw.trim();
  const lower = text.toLowerCase();
  let action: JarvisAction = "none";
  let title = "";
  let reply = "";
  let mode: VoiceMode = "conversation";
  let payload: VoiceActionPayload | undefined;
  const has = (...terms: string[]) => terms.some((term) => lower.includes(term.toLowerCase()) || text.includes(term));
  const appendMutation = parseAppendNoteMutation(text);
  const updateMutation = parseUpdateNoteMutation(text);
  const referentialCreateNote = referencesPriorConversation(text)
    && /(?:note|မှတ်စု)(?:\s*file|\s*ဖိုင်)?[^။.!?]*(?:အသစ်|ဖန်တီး|create|new)/iu.test(text)
    && /(?:သိမ်း|မှတ်|ထည့်|ရေး|save|put|add)/iu.test(text);

  if (has("revenue dashboard", "income dashboard", "ဝင်ငွေ dashboard", "dashboard ပြ", "ဒက်ရှ်ဘုတ်")) {
    action = "open_dashboard";
    reply = "Dashboard ဖွင့်ပေးမယ်။";
  } else if (has("why did the action fail", "why action failed", "last action error", "ဘာကြောင့် action မအောင်မြင်", "ဘာလို့ action မအောင်မြင်", "မအောင်မြင်တာ ဘာကြောင့်")) {
    action = "explain_last_failure";
    reply = "နောက်ဆုံး action log ကို စစ်ပေးမယ်။";
  } else if (has("cancel operator", "stop operator", "operator ကိုရပ်", "operator task ရပ်")) {
    action = "cancel_operator_task";
    reply = "Operator task ကို ရပ်ပေးမယ်။";
  } else if (has("operator status", "operator task status", "operator အခြေအနေ")) {
    action = "get_operator_status";
    reply = "Operator task အခြေအနေကို စစ်ပေးမယ်။";
  } else if (has("delegate to operator", "ask operator", "operator ကိုခိုင်း", "sub agent ကိုခိုင်း")) {
    action = "delegate_operator_task";
    payload = { content: text };
    reply = "Operator ကို အလုပ်ခွဲပေးမယ်။";
  } else if (has("how many files", "file count", "files count", "how many notes", "note count", "ဖိုင် ဘယ်နှစ်", "ဖိုင်အရေအတွက်", "note ဘယ်နှစ်")) {
    action = "get_vault_stats";
    reply = "လက်ရှိ vault ထဲက file နဲ့ folder အရေအတွက်ကို စစ်ပေးမယ်။";
  } else if (has("today task", "today tasks", "ဒီနေ့ task", "task တွေပြ", "tasks တွေပြ")) {
    action = "list_today_tasks";
    reply = "ဒီနေ့ task တွေ ပြပေးမယ်။";
  } else if (has("task") && has("completed လုပ်", "complete task", "task complete", "task ပြီးပြီလုပ်")) {
    action = "complete_task";
    title = text.replace(/completed|complete|ပြီးပြီ|ပြီး/gi, "").trim();
    reply = `ဒီ task ကို completed လုပ်မယ်။ OK?`;
  } else if (has("task အသစ်", "task ထည့်", "add task", "create task")) {
    action = "create_task";
    title = text.replace(/task|အသစ်|ထည့်|add|create/gi, "").trim();
    reply = `Task "${title || "Voice Task"}" ထည့်မယ်။ OK?`;
  } else if (has("daily review", "ဒီနေ့ review", "review လုပ်")) {
    action = "daily_review";
    reply = "ဒီနေ့ review စမယ်။";
  } else if (has("ceo mode", "CEO mode")) {
    action = "ceo_mode";
    reply = "CEO mode ဖွင့်ထားပါတယ်။ ဒီနေ့ goal ဘာလဲ?";
  } else if (has("coach", "stress", "ဘာလုပ်သင့်", "focus")) {
    action = "coach_mode";
    reply = "Coach mode ဖွင့်ထားပါတယ်။ အခု အရေးကြီးဆုံးခံစားချက်တစ်ခု ပြောပါ။";
  } else if (has("revenue", "income", "ဝင်ငွေ")) {
    const amount = amountFromText(text);
    if (amount) {
      action = "revenue_update";
      payload = { amount, content: text };
      reply = `${amount} ဝင်ငွေ ထည့်မယ်။ OK?`;
    } else {
      mode = "question";
      reply = "ဝင်ငွေ amount ဘယ်လောက် ထည့်ရမလဲ?";
    }
  } else if (has("cfo")) {
    action = "open_cfo";
    reply = "Personal CFO ဖွင့်ပေးမယ်။";
  } else if (has("consultant")) {
    action = "open_consultant";
    reply = "Consultant dashboard ဖွင့်ပေးမယ်။";
  } else if (has("close", "ပိတ်")) {
    action = "close";
    reply = "လက်ရှိ screen ကိုပိတ်ပေးမယ်။";
  } else if (has("summarize note", "summary လုပ်", "summarize လုပ်")) {
    action = "summarize_note";
    title = text.replace(/summarize note|summary လုပ်|summarize လုပ်|note/gi, "").trim();
    reply = `"${title || "ဒီ note"}" ကို summarize လုပ်ပေးမယ်။`;
  } else if (has("delete note", "note ဖျက်", "မှတ်စုဖျက်")) {
    action = "delete_note";
    title = text.replace(/delete note|note|မှတ်စု|ဖျက်/gi, "").trim();
    reply = `"${title || "လက်ရှိ note"}" ကိုဖျက်မယ်။ အတည်ပြုပါ။`;
  } else if (has("rename note", "note အမည်ပြောင်း", "မှတ်စုအမည်ပြောင်း")) {
    action = "rename_note";
    const parts = text.split(/\s+(?:to|as|အဖြစ်|လို့)\s+/i);
    title = (parts[0] || "").replace(/rename note|note|မှတ်စု|အမည်ပြောင်း/gi, "").trim();
    payload = { target: title, newTitle: parts[1]?.trim() || "" };
    reply = `"${title || "လက်ရှိ note"}" အမည်ပြောင်းမယ်။ အတည်ပြုပါ။`;
  } else if (appendMutation || has("append to note", "add to note", "note ထဲ ထပ်ထည့်", "note မှာ ထပ်ရေး", "မှတ်စုထဲထပ်ထည့်")) {
    if (appendMutation?.target && appendMutation.content) {
      action = "append_note";
      title = appendMutation.target;
      payload = appendMutation;
      reply = `"${title}" ထဲ စာထပ်ထည့်မယ်။ အတည်ပြုပါ။`;
    } else {
      mode = "question";
      reply = "ဘယ် note ထဲကို ဘာစာထပ်ထည့်ရမလဲ တိတိကျကျ ပြောပေးပါ။";
    }
  } else if (updateMutation || has("update note", "replace note", "note ပြင်", "မှတ်စုပြင်")) {
    if (updateMutation?.target && updateMutation.content) {
      action = "update_note";
      title = updateMutation.target;
      payload = updateMutation;
      reply = `"${title}" ကိုပြင်မယ်။ အတည်ပြုပါ။`;
    } else {
      mode = "question";
      reply = "ဘယ် note ကို ဘာ content နဲ့ပြင်ရမလဲ တိတိကျကျ ပြောပေးပါ။";
    }
  } else if (referentialCreateNote) {
    const explicitTitle = text.match(/["“”']([^"“”']{1,80})["“”']/u)?.[1]
      || text.match(/([^။.!?]{1,80}?)\s*(?:ဆိုတဲ့|လို့)\s*(?:note|မှတ်စု)/iu)?.[1];
    action = "create_note";
    title = explicitTitle?.trim() || "E.V Discussion";
    reply = `Note "${title}" ဖန်တီးပြီး ဆွေးနွေးထားတဲ့ content ကို ထည့်မယ်။ အတည်ပြုပါ။`;
  } else if (has("open a new note", "open new note", "new note ဖွင့်", "note ဖိုင်အသစ်ဖွင့်", "note အသစ်ဖွင့်")) {
    action = "create_note";
    title = text.replace(/open a new note|open new note|new note|note|ဖိုင်|အသစ်|ဖွင့်/gi, "").trim();
    reply = `Note "${title || "Voice Note"}" ဖန်တီးပြီး ဖွင့်မယ်။ အတည်ပြုပါ။`;
  } else if (has("note ဖွင့်", "open note")) {
    action = "open_note";
    title = text.replace(/open note|note|ဖွင့်/gi, "").trim();
    reply = `"${title || "ဒီ note"}" ဖွင့်ပေးမယ်။`;
  } else if (has("note အသစ်", "create note", "new note")) {
    action = "create_note";
    title = text.replace(/create note|new note|note အသစ်|note|အသစ်/gi, "").trim();
    reply = `Note "${title || "Voice Note"}" ဖန်တီးမယ်။ OK?`;
  } else if (has("inbox", "သိမ်း", "မှတ်ထား", "နောက်မှပြန်ကြည့်", "note this")) {
    action = "save_to_inbox";
    const dictated = text.replace(/^(ဒီ idea ကို\s+inbox ထဲ\s+|inbox ထဲ\s+|မှတ်ထား\s*|သိမ်း\s*|note this\s*)/i, "").trim();
    title = firstWords(dictated, 7);
    payload = { content: dictated };
    mode = "dictation";
    reply = `သိမ်းမယ်။ Title ကို "${title || "Voice Inbox"}" လို့ထားမယ်။ OK?`;
  } else if (has("ဘာလဲ", "ဘာလို့", "ဘယ်လို", "?")) {
    mode = "question";
    reply = "ကူညီပါမယ်။ Context တစ်ကြောင်းပေးပါ၊ တစ်ဆင့်ချင်းပြန်ရှင်းမယ်။";
  }

  if (action !== "none" && mode === "conversation") mode = voiceModeForIntent(action);

  const intent: Intent = {
    action,
    title: safeTitle(title),
    transcript: raw,
    reply,
    confidence: action === "none" ? 0.6 : 0.75,
    requiresConfirmation: voiceIntentNeedsConfirmation(action),
    skill: voiceSkillForIntent(action),
    mode,
    payload,
  };
  return intent;
}

/** Zero-network replies for tiny social turns. This removes a whole model round-trip after STT. */
export function fastLocalConversation(text: string, base: Intent): Intent | null {
  const value = text.trim().replace(/[.!?။]+$/g, "").trim();
  if (/^(hey|hi|hello|hey jarvis|hi jarvis|hello jarvis)$/i.test(value)) {
    return { ...base, reply: "Yes, I'm listening.", confidence: 1, transcript: text };
  }
  if (/^(မင်္ဂလာပါ|ဟယ်လို|ဟိုင်း|ဂျာဗစ်|ဟေး ဂျာဗစ်)$/i.test(value)) {
    return { ...base, reply: "ဟုတ်ကဲ့၊ နားထောင်နေပါတယ်။", confidence: 1, transcript: text };
  }
  if (/^(thanks|thank you|thanks jarvis)$/i.test(value)) {
    return { ...base, reply: "You're welcome.", confidence: 1, transcript: text };
  }
  if (/^(ကျေးဇူး|ကျေးဇူးပါ|ကျေးဇူးတင်ပါတယ်)$/i.test(value)) {
    return { ...base, reply: "ရပါတယ်။", confidence: 1, transcript: text };
  }
  return null;
}

export function firstWords(text: string, count: number): string {
  return text.trim().split(/\s+/).filter(Boolean).slice(0, count).join(" ");
}

export function amountFromText(text: string): number | undefined {
  const match = text.match(/\$?\s*(\d+(?:\.\d+)?)/);
  return match ? Number(match[1]) : undefined;
}
