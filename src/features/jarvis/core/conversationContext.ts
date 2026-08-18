import type { VoiceActionPayload } from "./commands";

export interface ConversationArtifact {
  turnId?: string;
  user: string;
  assistant: string;
  action?: string;
}

interface ConversationWriteIntent {
  action: string;
  transcript?: string;
  payload?: VoiceActionPayload;
}

const CONVERSATION_WRITE_ACTIONS = new Set(["create_note", "update_note", "append_note"]);
const PRIOR_CONTEXT_REFERENCE = /(?:\b(?:this|that|it|above|previous|prior|discussion|conversation|content|draft|script|idea)\b|ဒါကို|ဒီဟာ|ဒီအကြောင်း|ဒီ\s*(?:content|script|draft)|ခုဏက|အခုလေးတင်|စောစောက|ဆွေးနွေး(?:ထား|တာ|ခဲ့)|ပြော(?:ထား|ခဲ့)|ရေးထားတာ)/iu;
const DISCUSSION_REFERENCE = /(?:\b(?:discussion|conversation|what we discussed|our discussion)\b|ဆွေးနွေး(?:ထား|တာ|ခဲ့)|ပြော(?:ထား|ခဲ့)တာ(?:တွေ)?)/iu;
const ACTION_ACKNOWLEDGEMENT = /^(?:ok|okay|yes|confirm|saved|created|updated|opened|completed|သိမ်းမလား|လုပ်မလား|အတည်ပြု|ဖန်တီးမယ်|သိမ်းမယ်|.*(?:ပြီးပါပြီ|ဖန်တီးပြီး|ဖွင့်ပြီး))/iu;

export function referencesPriorConversation(text: string | undefined): boolean {
  return PRIOR_CONTEXT_REFERENCE.test(String(text || "").trim());
}

export function isConversationBackedWrite(intent: ConversationWriteIntent, transcript?: string): boolean {
  return CONVERSATION_WRITE_ACTIONS.has(intent.action)
    && referencesPriorConversation(transcript || intent.transcript);
}

export function latestConversationArtifact(
  artifacts: readonly ConversationArtifact[],
): ConversationArtifact | null {
  for (let index = artifacts.length - 1; index >= 0; index -= 1) {
    const artifact = artifacts[index];
    const content = artifact.assistant.trim();
    if (content.length >= 12 && !ACTION_ACKNOWLEDGEMENT.test(content)) return artifact;
  }
  return null;
}

function conversationWriteContent(
  transcript: string,
  artifacts: readonly ConversationArtifact[],
): { content: string; turnId?: string } | null {
  const usable = artifacts.filter((artifact) => {
    const content = artifact.assistant.trim();
    return content.length >= 12
      && !ACTION_ACKNOWLEDGEMENT.test(content)
      && !CONVERSATION_WRITE_ACTIONS.has(artifact.action || "");
  });
  if (!usable.length) return null;

  if (DISCUSSION_REFERENCE.test(transcript)) {
    const selected = usable.slice(-8);
    return {
      content: selected.map((artifact) => [
        "**You**",
        artifact.user.trim(),
        "",
        "**E.V**",
        artifact.assistant.trim(),
      ].join("\n")).join("\n\n---\n\n"),
      turnId: selected[selected.length - 1]?.turnId,
    };
  }

  const latest = usable[usable.length - 1];
  return { content: latest.assistant.trim(), turnId: latest.turnId };
}

export function hydrateConversationWriteIntent<T extends ConversationWriteIntent>(
  intent: T,
  transcript: string,
  artifacts: readonly ConversationArtifact[],
): T {
  if (!isConversationBackedWrite(intent, transcript)) return intent;
  const resolved = conversationWriteContent(transcript, artifacts);
  if (!resolved) {
    return {
      ...intent,
      transcript: intent.transcript || transcript,
      payload: { ...(intent.payload || {}), content: "", contentSource: "conversation_unavailable" },
    };
  }

  return {
    ...intent,
    transcript: intent.transcript || transcript,
    payload: {
      ...(intent.payload || {}),
      content: resolved.content,
      contentSource: "conversation",
      contentSourceTurnId: resolved.turnId,
    },
  };
}
