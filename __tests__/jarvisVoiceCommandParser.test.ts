import { describe, expect, it } from "vitest";
import { parseVoiceCommandText } from "@/features/jarvis/services/brain";

describe("Jarvis text intent parser", () => {
  it("routes task list commands without network", () => {
    const intent = parseVoiceCommandText("ဒီနေ့ task တွေပြ");
    expect(intent).toEqual(expect.objectContaining({
      action: "list_today_tasks",
      skill: "tasks_skill",
      mode: "command",
      requiresConfirmation: false,
    }));
  });

  it("keeps app mode opens out of the note-open fallback", () => {
    expect(parseVoiceCommandText("CEO mode ဖွင့်").action).toBe("ceo_mode");
    expect(parseVoiceCommandText("CFO ဖွင့်").action).toBe("open_cfo");
  });

  it("routes dictation-style saves through inbox confirmation", () => {
    const intent = parseVoiceCommandText("မှတ်ထား Voice Clone Telegram Bot Idea");
    expect(intent).toEqual(expect.objectContaining({
      action: "save_to_inbox",
      skill: "inbox_skill",
      mode: "dictation",
      requiresConfirmation: true,
      payload: { content: "Voice Clone Telegram Bot Idea" },
    }));
  });

  it("does not treat any Burmese phrase containing ပြ as dashboard", () => {
    const intent = parseVoiceCommandText("ဒီ idea ကိုပြန်စဉ်းစားမယ်");
    expect(intent.action).toBe("none");
  });

  it("distinguishes questions, conversations, and system controls", () => {
    expect(parseVoiceCommandText("ဒါဘယ်လိုအလုပ်လုပ်တာလဲ").mode).toBe("question");
    expect(parseVoiceCommandText("ငါ stress ဖြစ်နေတယ်").mode).toBe("conversation");
    expect(parseVoiceCommandText("CFO ဖွင့်").mode).toBe("system_control");
  });

  it("does not turn ordinary task talk into a create or complete command", () => {
    expect(parseVoiceCommandText("ဒီ task က ဘာလို့ မပြီးသေးတာလဲ").action).toBe("none");
    expect(parseVoiceCommandText("အလုပ်ပြီးသွားပြီ").action).toBe("none");
  });

  it("routes a revenue dashboard request as navigation, not a revenue write", () => {
    expect(parseVoiceCommandText("revenue dashboard ပြ").action).toBe("open_dashboard");
  });

  it("does not disguise an unmatched conversation as a successful listening reply", () => {
    expect(parseVoiceCommandText("Tell me something interesting").reply).toBe("");
  });
});
