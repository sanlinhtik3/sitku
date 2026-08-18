import { describe, expect, it, vi } from "vitest";
import { createVoicePipelineEngine, type EngineDeps, type EngineIntent } from "@/features/jarvis/core/engine";
import { compactVoiceActionHistory } from "@/features/jarvis/core/commands";
import { parseVoiceCommandText } from "@/features/jarvis/core/intentParser";
import type { EvLiveProtocol, EvLiveProtocolCallbacks } from "@/features/ev-voice/protocols";

function harness(claimed = true, recent: Array<Record<string, unknown>> = []) {
  let callbacks!: EvLiveProtocolCallbacks;
  let chunkSink: ((chunk: Float32Array) => void) | null = null;
  let operatorListener: ((job: import("@/features/ev-voice/operator").OperatorJob) => void) | null = null;
  const live = {
    connect: vi.fn(async () => undefined),
    connectTranslation: vi.fn(async () => undefined),
    sendAudio: vi.fn(),
    sendToolResponse: vi.fn(),
    sendBackgroundReport: vi.fn(() => true),
    requestSpokenReply: vi.fn(),
    interrupt: vi.fn(),
    disconnect: vi.fn(),
  };
  const deps: EngineDeps = {
    brain: {
      understandAudio: vi.fn(),
      understandText: vi.fn(),
      execAction: vi.fn(async () => ({ result: "saved" })),
      offline: vi.fn(),
      toolDeclarations: [{ name: "workspace_read_active_file", description: "Read active note", parameters: { type: "object" } }],
      execTool: vi.fn(async () => ({
        ok: true as const,
        data: { path: "Active.md", chunk: "verified content", hasMore: false },
        evidence: [{ id: "note-1", type: "note" as const, path: "Active.md", capturedAt: "2026-08-08T00:00:00.000Z" }],
      })),
      subscribeOperator: vi.fn((listener) => {
        operatorListener = listener;
        return () => { operatorListener = null; };
      }),
    },
    speech: { speak: vi.fn(), stop: vi.fn() },
    capture: {
      ready: () => true,
      begin: vi.fn((sink) => { chunkSink = sink; }),
      end: vi.fn(),
      sampleRate: () => 48_000,
      energy: () => 0,
    },
    offline: { start: vi.fn(), stop: vi.fn(), isListening: () => false },
    hasKey: () => true,
    canRecord: () => true,
    journal: {
      begin: vi.fn(async () => undefined),
      update: vi.fn(async () => undefined),
      claimAction: vi.fn(async () => ({ claimed, result: claimed ? undefined : "already saved" })),
      listRecent: vi.fn(async () => recent as never),
    },
    liveClientFactory: (nextCallbacks) => {
      callbacks = nextCallbacks;
      return live as unknown as EvLiveProtocol;
    },
    liveSession: () => ({
      model: "models/gemini-2.5-flash-native-audio-preview-12-2025",
      reasoningLevel: "minimal",
    }),
  };
  const engine = createVoicePipelineEngine(deps);
  return {
    engine,
    deps,
    live,
    callbacks: () => callbacks,
    push: (chunk: Float32Array) => chunkSink?.(chunk),
    settleOperator: (job: import("@/features/ev-voice/operator").OperatorJob) => operatorListener?.(job),
  };
}

describe("E.V voice engine", () => {
  it("recognizes a Burmese referential discussion-to-note request without relying on a model tool call", () => {
    expect(parseVoiceCommandText("ဒီဆွေးနွေးတာတွေကို note file အသစ်တစ်ခု ဖန်တီးပြီး မှတ်လိုက်ပါ")).toEqual(
      expect.objectContaining({ action: "create_note", title: "E.V Discussion", requiresConfirmation: true }),
    );
  });

  it("compacts immediate duplicate journal rows without discarding the audit record", () => {
    const rows = compactVoiceActionHistory([
      { id: "new", timestamp: "2026-08-11T10:00:04.000Z", intent: "append_note", skill: "notes_skill", result: "Appended to note: Test.md", status: "completed" },
      { id: "old", timestamp: "2026-08-11T10:00:00.000Z", intent: "append_note", skill: "notes_skill", result: "Appended to note: Test.md", status: "completed" },
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toEqual(expect.objectContaining({ occurrences: 2, id: "new" }));
  });

  it("opens one Gemini Live session and streams mic chunks through it", async () => {
    const h = harness();
    h.engine.micReady();
    await vi.waitFor(() => expect(h.engine.getSnapshot().phase).toBe("listening"));
    expect(h.live.connect).toHaveBeenCalledWith(
      "models/gemini-2.5-flash-native-audio-preview-12-2025",
      expect.stringContaining("You are E.V"),
      expect.any(Object),
      expect.arrayContaining([expect.objectContaining({ name: "workspace_read_active_file" })]),
    );
    const pcm = new Float32Array([0.1, -0.1]);
    h.push(pcm);
    expect(h.live.sendAudio).toHaveBeenCalledWith(pcm, 48_000);
    expect(h.engine.getSnapshot()).toEqual(expect.objectContaining({
      reasoningLevel: "minimal",
      reasoningRoute: "live",
      reasoningScore: 0,
      verification: "not_required",
    }));
  });

  it("switches to isolated Live Translate only after an explicit command", async () => {
    const h = harness();
    h.engine.micReady();
    await vi.waitFor(() => expect(h.engine.getSnapshot().phase).toBe("listening"));

    h.callbacks().onInputTranscript("What does translate mean?");
    expect(h.live.connectTranslation).not.toHaveBeenCalled();

    h.callbacks().onInputTranscript("Start live translate to Japanese");
    await vi.waitFor(() => expect(h.live.connectTranslation).toHaveBeenCalledWith({
      targetLanguageCode: "ja",
      echoTargetLanguage: false,
    }));
    expect(h.engine.getSnapshot()).toEqual(expect.objectContaining({
      phase: "listening",
      liveTranslation: expect.objectContaining({ active: true, targetLanguageCode: "ja" }),
    }));

    h.callbacks().onInputTranscript("Stop live translation");
    await vi.waitFor(() => expect(h.live.connect).toHaveBeenCalledTimes(2));
    expect(h.engine.getSnapshot().liveTranslation.active).toBe(false);
  });

  it("restores normal E.V when the translation connection is unavailable", async () => {
    const h = harness();
    h.engine.micReady();
    await vi.waitFor(() => expect(h.engine.getSnapshot().phase).toBe("listening"));
    h.live.connectTranslation.mockRejectedValueOnce(new Error("model access denied"));

    h.callbacks().onInputTranscript("Start live translate to Japanese");

    await vi.waitFor(() => expect(h.live.connect).toHaveBeenCalledTimes(2));
    expect(h.engine.getSnapshot()).toEqual(expect.objectContaining({
      phase: "listening",
      liveTranslation: expect.objectContaining({ active: false }),
    }));
  });

  it("keeps background operator reports out of the translation-only session", async () => {
    const h = harness();
    h.engine.micReady();
    await vi.waitFor(() => expect(h.engine.getSnapshot().phase).toBe("listening"));
    h.callbacks().onInputTranscript("Start live translate to Japanese");
    await vi.waitFor(() => expect(h.engine.getSnapshot().liveTranslation.active).toBe(true));

    h.settleOperator({
      id: "operator-translation-isolation",
      request: "review",
      status: "completed",
      idempotencyKey: "operator-translation-isolation",
      result: "Private operator report",
      evidence: [],
      createdAt: "2026-08-13T00:00:00.000Z",
      updatedAt: "2026-08-13T00:00:01.000Z",
    });

    expect(h.live.sendBackgroundReport).not.toHaveBeenCalled();
    expect(h.engine.getSnapshot().liveTranslation.active).toBe(true);
  });

  it("starts capture before the Live handshake resolves", async () => {
    const h = harness();
    let resolveConnect!: () => void;
    h.live.connect.mockImplementation(() => new Promise<void>((resolve) => { resolveConnect = resolve; }));

    h.engine.micReady();
    expect(h.deps.capture.begin).toHaveBeenCalledOnce();
    const speech = new Float32Array(2_048).fill(0.08);
    h.push(speech);
    h.push(speech);
    expect(h.engine.getSnapshot()).toEqual(expect.objectContaining({ phase: "recording", inputActivity: "speech" }));

    resolveConnect();
    await vi.waitFor(() => expect(h.live.connect).toHaveBeenCalledOnce());
    expect(h.engine.getSnapshot().phase).toBe("recording");
  });

  it("reports a settled background Operator job when the conversation is idle", async () => {
    const h = harness();
    h.engine.micReady();
    await vi.waitFor(() => expect(h.engine.getSnapshot().phase).toBe("listening"));

    h.settleOperator({
      id: "operator-1",
      request: "review",
      status: "completed",
      idempotencyKey: "operator-key",
      result: "Two risks were found.",
      evidence: [],
      createdAt: "2026-08-13T00:00:00.000Z",
      updatedAt: "2026-08-13T00:00:01.000Z",
    });

    expect(h.live.sendBackgroundReport).toHaveBeenCalledWith(expect.stringContaining("Two risks were found"));
    expect(h.engine.getSnapshot()).toEqual(expect.objectContaining({ phase: "thinking", operationLabel: "Operator report ready" }));
  });

  it("does not repeat the result of an explicitly cancelled background Operator job", async () => {
    const h = harness();
    h.engine.micReady();
    await vi.waitFor(() => expect(h.engine.getSnapshot().phase).toBe("listening"));

    h.settleOperator({
      id: "operator-cancelled",
      request: "review",
      status: "cancelled",
      idempotencyKey: "operator-cancelled-key",
      error: { code: "CANCELLED", message: "Cancelled by the user." },
      evidence: [],
      createdAt: "2026-08-13T00:00:00.000Z",
      updatedAt: "2026-08-13T00:00:01.000Z",
    });

    expect(h.live.sendBackgroundReport).not.toHaveBeenCalled();
    expect(h.engine.getSnapshot().phase).toBe("listening");
  });

  it("keeps complex foreground turns minimal without reconnecting the Live session", async () => {
    const h = harness();
    h.engine.micReady();
    await vi.waitFor(() => expect(h.engine.getSnapshot().phase).toBe("listening"));
    h.callbacks().onInputTranscript("Audit this architecture layer by layer and compare the production trade-offs");
    expect(h.engine.getSnapshot()).toEqual(expect.objectContaining({
      reasoningLevel: "minimal",
      reasoningRoute: "live",
    }));
    expect(h.live.connect).toHaveBeenCalledTimes(1);
  });

  it("shows client speech activity before Gemini returns transcription", async () => {
    const h = harness();
    h.engine.micReady();
    await vi.waitFor(() => expect(h.engine.getSnapshot().phase).toBe("listening"));
    const speech = new Float32Array(2_048).fill(0.08);
    h.push(speech);
    h.push(speech);
    expect(h.engine.getSnapshot()).toEqual(expect.objectContaining({
      phase: "recording",
      inputActivity: "speech",
      heard: "",
      turnId: null,
    }));
  });

  it("prepares partial intent without executing and coalesces transcript journal writes", async () => {
    const h = harness();
    h.engine.micReady();
    await vi.waitFor(() => expect(h.engine.getSnapshot().phase).toBe("listening"));
    h.callbacks().onInputTranscript("new note");
    h.callbacks().onInputTranscript("new note Launch Plan");

    expect(h.engine.getSnapshot()).toEqual(expect.objectContaining({
      preparedIntent: "create_note",
      heard: "new note Launch Plan",
    }));
    expect(h.deps.brain.execAction).not.toHaveBeenCalled();
    await vi.waitFor(() => expect(h.deps.journal?.update).toHaveBeenCalledTimes(1), { timeout: 1_000 });
    expect(h.deps.journal?.update).toHaveBeenCalledWith(expect.objectContaining({
      transcript: "new note Launch Plan",
      status: "thinking",
    }));
  });

  it("flushes the latest final transcript instead of a stale partial", async () => {
    const h = harness();
    h.engine.micReady();
    await vi.waitFor(() => expect(h.engine.getSnapshot().phase).toBe("listening"));

    h.engine.voiceTranscript("create a note", false);
    h.engine.voiceTranscript("create a note called Launch Plan", true);

    await vi.waitFor(() => expect(h.deps.journal?.update).toHaveBeenCalledTimes(1));
    expect(h.deps.journal?.update).toHaveBeenCalledWith(expect.objectContaining({
      transcript: "create a note called Launch Plan",
      status: "thinking",
    }));
  });

  it("retries one conversational turn when Gemini completes without reply audio", async () => {
    const h = harness();
    h.engine.micReady();
    await vi.waitFor(() => expect(h.engine.getSnapshot().phase).toBe("listening"));

    h.callbacks().onInputTranscript("Hey E.V");
    h.callbacks().onTurnComplete?.();
    expect(h.live.requestSpokenReply).toHaveBeenCalledOnce();
    expect(h.engine.getSnapshot().phase).toBe("thinking");

    h.callbacks().onTurnComplete?.();
    expect(h.live.requestSpokenReply).toHaveBeenCalledOnce();
    expect(h.engine.getSnapshot()).toEqual(expect.objectContaining({
      phase: "listening",
      reply: expect.stringContaining("အသံပြန်မပေးနိုင်ခဲ့"),
    }));
  });

  it("blocks current web claims until a search tool returns evidence", async () => {
    const h = harness();
    h.engine.micReady();
    await vi.waitFor(() => expect(h.engine.getSnapshot().phase).toBe("listening"));
    h.callbacks().onInputTranscript("What is the Bitcoin price now?");
    h.callbacks().onOutputTranscript("Bitcoin is 100,000 dollars.");
    h.callbacks().onGenerationComplete?.();
    expect(h.engine.getSnapshot()).toEqual(expect.objectContaining({
      reply: expect.stringContaining("Current source evidence"),
      actionStatus: "failed",
      verification: "failed",
    }));
  });

  it("surfaces input/output transcripts and native audio without a second TTS system", async () => {
    const h = harness();
    h.engine.micReady();
    await vi.waitFor(() => expect(h.engine.getSnapshot().phase).toBe("listening"));
    h.callbacks().onInputTranscript("မင်္ဂလာပါ");
    h.callbacks().onOutputTranscript("မင်္ဂလာပါ Zoe");
    h.callbacks().onAudio(new Int16Array([1, 2]), 24_000);
    expect(h.engine.getSnapshot()).toEqual(expect.objectContaining({ heard: "မင်္ဂလာပါ", reply: "မင်္ဂလာပါ Zoe", phase: "speaking" }));
    expect(h.deps.speech.speak).not.toHaveBeenCalled();
  });

  it("persists finalized E.V turns and closes the local memory session", async () => {
    const h = harness();
    const memory = {
      startSession: vi.fn(async () => ({ sessionId: "memory-session", promptContext: "" })),
      commitTurn: vi.fn(async () => undefined),
      refreshSummary: vi.fn(async () => null),
      endSession: vi.fn(async () => undefined),
    };
    h.deps.memory = memory;
    h.engine.micReady();
    await vi.waitFor(() => expect(h.engine.getSnapshot().phase).toBe("listening"));
    h.callbacks().onInputTranscript("မင်္ဂလာပါ E.V");
    h.callbacks().onOutputTranscript("မင်္ဂလာပါ Zoe");
    h.callbacks().onGenerationComplete?.();
    await vi.waitFor(() => expect(memory.commitTurn).toHaveBeenCalledWith(expect.objectContaining({
      sessionId: "memory-session", user: "မင်္ဂလာပါ E.V", assistant: "မင်္ဂလာပါ Zoe", status: "final",
    })));
    h.engine.stop();
    await vi.waitFor(() => expect(memory.endSession).toHaveBeenCalledWith("memory-session", "completed"));
  });

  it("holds important writes for confirmation and executes once after approval", async () => {
    const h = harness();
    h.engine.micReady();
    await vi.waitFor(() => expect(h.engine.getSnapshot().phase).toBe("listening"));
    h.callbacks().onInputTranscript("note သိမ်းပါ");
    const intent: EngineIntent = { action: "create_note", reply: "သိမ်းမလား?", requiresConfirmation: true };
    await h.callbacks().onToolCall("call-1", "execute_action", intent);
    expect(h.engine.getSnapshot().phase).toBe("confirm");
    expect(h.deps.brain.execAction).not.toHaveBeenCalled();
    h.callbacks().onAudio(new Int16Array([1, 2]), 24_000);
    expect(h.engine.getSnapshot().phase).toBe("confirm");
    await h.engine.confirm(true);
    expect(h.deps.brain.execAction).toHaveBeenCalledTimes(1);
    expect(h.live.sendToolResponse).toHaveBeenCalledWith("call-1", "execute_action", {
      ok: true, status: "completed", action: "create_note", result: "saved", reply: "သိမ်းမလား?",
    });
  });

  it("carries the latest generated content into a referential create-note action", async () => {
    const h = harness();
    h.engine.micReady();
    await vi.waitFor(() => expect(h.engine.getSnapshot().phase).toBe("listening"));

    h.callbacks().onInputTranscript("Write a launch script for the new product");
    h.callbacks().onOutputTranscript("## Launch Script\n\nStart with the customer problem, reveal the product, and close with one clear action.");
    h.callbacks().onGenerationComplete?.();
    h.callbacks().onTurnComplete?.();

    h.callbacks().onInputTranscript("ဒါကို Launch Script note အသစ်ဖန်တီးပြီး ထည့်လိုက်ပါ");
    await h.callbacks().onToolCall("create-from-context", "execute_action", {
      action: "create_note",
      title: "Launch Script",
      reply: "Launch Script note အဖြစ် သိမ်းမယ်။ အတည်ပြုပါ။",
      requiresConfirmation: true,
      payload: {},
    });

    expect(h.engine.getSnapshot().phase).toBe("confirm");
    await h.engine.confirm(true);
    expect(h.deps.brain.execAction).toHaveBeenCalledWith(
      "create_note",
      "Launch Script",
      expect.objectContaining({
        payload: expect.objectContaining({
          content: "## Launch Script\n\nStart with the customer problem, reveal the product, and close with one clear action.",
          contentSource: "conversation",
          contentSourceTurnId: expect.stringMatching(/^ev-/),
        }),
      }),
    );
  });

  it("writes the verified multi-turn discussion instead of model-invented note content", async () => {
    const h = harness();
    h.engine.micReady();
    await vi.waitFor(() => expect(h.engine.getSnapshot().phase).toBe("listening"));

    h.callbacks().onInputTranscript("Facebook content hook ကို ဘယ်လိုရေးရမလဲ");
    h.callbacks().onOutputTranscript("Hook မှာ audience problem ကို ပထမစာကြောင်းကတည်းက တိတိကျကျ ဖော်ပြပါ။");
    h.callbacks().onGenerationComplete?.();
    h.callbacks().onTurnComplete?.();

    h.callbacks().onInputTranscript("Story flow ကိုရော ဘယ်လိုဆက်မလဲ");
    h.callbacks().onOutputTranscript("Problem, tension, insight, action အစဉ်နဲ့ ဆက်ရေးပါ။");
    h.callbacks().onGenerationComplete?.();
    h.callbacks().onTurnComplete?.();

    h.callbacks().onInputTranscript("ဒီဆွေးနွေးတာတွေကို Content Plan note file အသစ်ဖန်တီးပြီး မှတ်လိုက်ပါ");
    await h.callbacks().onToolCall("discussion-note", "execute_action", {
      action: "create_note",
      title: "Content Plan",
      reply: "သိမ်းမယ်။ အတည်ပြုပါ။",
      requiresConfirmation: true,
      payload: { content: "New hallucinated replacement" },
    });

    await h.engine.confirm(true);
    const executed = vi.mocked(h.deps.brain.execAction).mock.calls.at(-1)?.[2] as EngineIntent;
    expect(executed.payload?.content).toContain("Facebook content hook ကို ဘယ်လိုရေးရမလဲ");
    expect(executed.payload?.content).toContain("Problem, tension, insight, action အစဉ်နဲ့ ဆက်ရေးပါ။");
    expect(executed.payload?.content).not.toContain("New hallucinated replacement");
    expect(executed.payload?.contentSource).toBe("conversation");
  });

  it("keeps a grounded tool-backed answer available for the next referential note write", async () => {
    const h = harness();
    h.engine.micReady();
    await vi.waitFor(() => expect(h.engine.getSnapshot().phase).toBe("listening"));

    h.callbacks().onInputTranscript("Active note ကိုစစ်ပြီး content plan ပေးပါ");
    await h.callbacks().onToolCall("read-active", "workspace_read_active_file", {});
    h.callbacks().onOutputTranscript("Verified note အရ hook ကိုတိုစေပြီး evidence section တစ်ခု ထည့်ပါ။");
    h.callbacks().onGenerationComplete?.();
    h.callbacks().onTurnComplete?.();

    h.callbacks().onInputTranscript("ဒါကို Review Plan note အသစ်လုပ်ပြီး ထည့်လိုက်ပါ");
    await h.callbacks().onToolCall("save-review", "execute_action", {
      action: "create_note",
      title: "Review Plan",
      reply: "သိမ်းမယ်။ အတည်ပြုပါ။",
      requiresConfirmation: true,
      payload: {},
    });
    await h.engine.confirm(true);

    expect(h.deps.brain.execAction).toHaveBeenLastCalledWith(
      "create_note",
      "Review Plan",
      expect.objectContaining({
        payload: expect.objectContaining({
          content: "Verified note အရ hook ကိုတိုစေပြီး evidence section တစ်ခု ထည့်ပါ။",
          contentSource: "conversation",
        }),
      }),
    );
  });

  it("previews terminal risk and executes a state-changing command only after approval", async () => {
    const h = harness();
    h.deps.brain.toolDeclarations = [
      ...(h.deps.brain.toolDeclarations || []),
      { name: "terminal_run", description: "Run terminal command", parameters: { type: "object" } },
    ];
    const preview = {
      ok: true as const,
      requiresConfirmation: true,
      prompt: "System or file change: mkdir Project\nWorking directory: /Users/zoe",
      intent: "run_terminal_command",
      skill: "terminal_skill" as const,
      mode: "command" as const,
      data: { plan: { planId: "plan-1", command: "mkdir Project" } },
    };
    h.deps.brain.previewTool = vi.fn(async () => preview);
    h.engine.micReady();
    await vi.waitFor(() => expect(h.engine.getSnapshot().phase).toBe("listening"));
    h.callbacks().onInputTranscript("Run mkdir Project");
    await h.callbacks().onToolCall("terminal-1", "terminal_run", { command: "mkdir Project" });
    expect(h.engine.getSnapshot()).toEqual(expect.objectContaining({
      phase: "confirm",
      intent: "run_terminal_command",
      skill: "terminal_skill",
      reply: expect.stringContaining("mkdir Project"),
    }));
    expect(h.deps.brain.execTool).not.toHaveBeenCalled();

    await h.engine.confirm(true);
    expect(h.deps.brain.execTool).toHaveBeenCalledWith(
      "terminal_run",
      { command: "mkdir Project" },
      expect.objectContaining({ approved: true, preview, idempotencyKey: expect.stringContaining("terminal_run") }),
    );
  });

  it("keeps approval visible through barge-in and accepts a spoken decision", async () => {
    const h = harness();
    h.engine.micReady();
    await vi.waitFor(() => expect(h.engine.getSnapshot().phase).toBe("listening"));
    await h.callbacks().onToolCall("call-spoken", "execute_action", {
      action: "delete_note", reply: "ဖျက်မလား?", requiresConfirmation: true,
    });
    h.callbacks().onInterrupted?.();
    expect(h.engine.getSnapshot().phase).toBe("confirm");
    h.callbacks().onInputTranscript("အတည်ပြု");
    await vi.waitFor(() => expect(h.deps.brain.execAction).toHaveBeenCalledTimes(1));
  });

  it("opens the approval state when Gemini only speaks a write confirmation", async () => {
    const h = harness();
    h.engine.micReady();
    await vi.waitFor(() => expect(h.engine.getSnapshot().phase).toBe("listening"));
    h.callbacks().onInputTranscript("new note Project Alpha");
    h.callbacks().onOutputTranscript("Create Project Alpha?");
    h.callbacks().onGenerationComplete?.();

    expect(h.engine.getSnapshot()).toEqual(expect.objectContaining({
      phase: "confirm",
      intent: "create_note",
      actionStatus: "confirming",
    }));
    expect(h.deps.brain.execAction).not.toHaveBeenCalled();

    await h.engine.confirm(true);
    expect(h.deps.brain.execAction).toHaveBeenCalledTimes(1);
  });

  it("does not repeat an action already claimed by the journal", async () => {
    const h = harness(false);
    h.engine.micReady();
    await vi.waitFor(() => expect(h.engine.getSnapshot().phase).toBe("listening"));
    await h.callbacks().onToolCall("call-2", "execute_action", { action: "open_cfo", reply: "opening" });
    expect(h.deps.brain.execAction).not.toHaveBeenCalled();
    expect(h.live.sendToolResponse).toHaveBeenCalledWith("call-2", "execute_action", {
      ok: true, status: "completed", action: "open_cfo", result: "already saved", duplicate: true,
    });
  });

  it("does not execute a replayed Live action twice", async () => {
    const h = harness();
    h.engine.micReady();
    await vi.waitFor(() => expect(h.engine.getSnapshot().phase).toBe("listening"));
    const append = {
      action: "append_note",
      title: "စမ်းကြည့်တာပါ.md",
      target: "စမ်းကြည့်တာပါ.md",
      payload: { target: "စမ်းကြည့်တာပါ.md", content: "duplicate guard" },
      reply: "Appending",
    };

    await h.callbacks().onToolCall("call-append-1", "execute_action", append);
    await h.engine.confirm(true);
    await h.callbacks().onToolCall("call-append-2", "execute_action", append);

    expect(h.deps.brain.execAction).toHaveBeenCalledTimes(1);
    expect(h.engine.getSnapshot().actionHistory).toHaveLength(1);
    expect(h.live.sendToolResponse).toHaveBeenLastCalledWith("call-append-2", "execute_action", expect.objectContaining({
      ok: true,
      duplicate: true,
      reply: expect.stringContaining("အခုလေးတင်"),
    }));
  });

  it("does not record a no-op fallback as a completed action", async () => {
    const h = harness();
    h.engine.micReady();
    await vi.waitFor(() => expect(h.engine.getSnapshot().phase).toBe("listening"));

    await h.callbacks().onToolCall("call-noop", "execute_action", { action: "none", reply: "ဟုတ်ကဲ့။" });

    expect(h.deps.brain.execAction).not.toHaveBeenCalled();
    expect(h.deps.journal?.claimAction).not.toHaveBeenCalled();
    expect(h.engine.getSnapshot()).toEqual(expect.objectContaining({
      actionStatus: "idle",
      reply: "ဟုတ်ကဲ့။",
      actionHistory: [],
    }));
    expect(h.live.sendToolResponse).toHaveBeenCalledWith("call-noop", "execute_action", {
      ok: true,
      status: "completed",
      action: "none",
      result: "No action required",
      reply: "ဟုတ်ကဲ့။",
    });
  });

  it("creates a journal turn when Gemini calls a tool before transcription arrives", async () => {
    const h = harness();
    h.engine.micReady();
    await vi.waitFor(() => expect(h.engine.getSnapshot().phase).toBe("listening"));
    await h.callbacks().onToolCall("call-race", "execute_action", { action: "get_vault_stats", reply: "checking" });
    expect(h.deps.journal?.begin).toHaveBeenCalledWith(expect.objectContaining({ status: "thinking" }));
    expect(h.deps.brain.execAction).toHaveBeenCalledTimes(1);
    expect(h.live.sendToolResponse).toHaveBeenCalledWith("call-race", "execute_action", expect.objectContaining({ ok: true }));
  });

  it("returns an exact structured diagnostic when an action fails", async () => {
    const h = harness();
    vi.mocked(h.deps.brain.execAction).mockRejectedValueOnce(new Error("Local tasks.upsertTask is not implemented yet."));
    h.engine.micReady();
    await vi.waitFor(() => expect(h.engine.getSnapshot().phase).toBe("listening"));
    await h.callbacks().onToolCall("call-fail", "execute_action", { action: "list_today_tasks", reply: "checking" });
    expect(h.engine.getSnapshot().actionStatus).toBe("failed");
    expect(h.live.sendToolResponse).toHaveBeenCalledWith("call-fail", "execute_action", expect.objectContaining({
      ok: false,
      status: "failed",
      error: expect.objectContaining({ code: "CAPABILITY_UNAVAILABLE", retryable: false }),
    }));
  });

  it("lets E.V read the journal and explain the last failed action", async () => {
    const h = harness(true, [{
      turnId: "ev-old", status: "failed", intent: "create_task", skill: "tasks_skill",
      error: "task title is required", updatedAt: "2026-08-08T00:00:00.000Z",
    }]);
    h.engine.micReady();
    await vi.waitFor(() => expect(h.engine.getSnapshot().phase).toBe("listening"));
    await h.callbacks().onToolCall("call-log", "execute_action", { action: "explain_last_failure", reply: "checking logs" });
    expect(h.deps.brain.execAction).not.toHaveBeenCalled();
    expect(h.live.sendToolResponse).toHaveBeenCalledWith("call-log", "execute_action", expect.objectContaining({
      ok: true,
      result: expect.stringContaining("task title is required"),
    }));
  });

  it("keeps streaming microphone audio while E.V speaks so Gemini can detect barge-in", async () => {
    const h = harness();
    h.engine.micReady();
    await vi.waitFor(() => expect(h.engine.getSnapshot().phase).toBe("listening"));
    h.callbacks().onAudio(new Int16Array([1, 2]), 24_000);
    const pcm = new Float32Array([0.2, -0.2]);
    h.push(pcm);
    expect(h.live.sendAudio).toHaveBeenCalledWith(pcm, 48_000);
    h.callbacks().onInterrupted?.();
    expect(h.deps.speech.stop).toHaveBeenCalled();
    expect(h.engine.getSnapshot().phase).toBe("listening");
  });

  it("uses the orb as an explicit interruption without destroying the session", async () => {
    const h = harness();
    h.engine.micReady();
    await vi.waitFor(() => expect(h.engine.getSnapshot().phase).toBe("listening"));
    h.callbacks().onAudio(new Int16Array([1]), 24_000);
    h.engine.tapOrb();
    expect(h.deps.speech.stop).toHaveBeenCalled();
    expect(h.live.interrupt).toHaveBeenCalled();
    expect(h.live.disconnect).not.toHaveBeenCalled();
    expect(h.engine.getSnapshot().phase).toBe("listening");
  });

  it("blocks workspace audio/text until a typed tool returns evidence", async () => {
    const h = harness();
    h.engine.micReady();
    await vi.waitFor(() => expect(h.engine.getSnapshot().phase).toBe("listening"));
    h.callbacks().onInputTranscript("လက်ရှိ active file ကို ဖတ်ပြပါ");
    h.callbacks().onOutputTranscript("This is an invented filename");
    h.callbacks().onAudio(new Int16Array([1]), 24_000);
    expect(h.engine.getSnapshot().reply).toBe("");
    expect(h.engine.getSnapshot().phase).toBe("thinking");

    await h.callbacks().onToolCall("read-1", "workspace_read_active_file", {});
    h.callbacks().onOutputTranscript("Active.md ကို verified draft ကနေ ဖတ်နေပါတယ်။");
    h.callbacks().onAudio(new Int16Array([2]), 24_000);
    expect(h.engine.getSnapshot()).toEqual(expect.objectContaining({
      grounded: true,
      evidenceCount: 1,
      operationLabel: "Reading active file",
      reply: "Active.md ကို verified draft ကနေ ဖတ်နေပါတယ်။",
      phase: "speaking",
    }));
  });

  it("allows E.V to explain a structured tool failure without inventing data", async () => {
    const h = harness();
    vi.mocked(h.deps.brain.execTool!).mockResolvedValueOnce({
      ok: false,
      evidence: [],
      error: { code: "NO_ACTIVE_FILE", message: "No active note is open." },
      recovery: "Open a note and retry.",
    });
    h.engine.micReady();
    await vi.waitFor(() => expect(h.engine.getSnapshot().phase).toBe("listening"));
    h.callbacks().onInputTranscript("လက်ရှိ file ကို summarize လုပ်ပါ");
    await h.callbacks().onToolCall("summary-1", "workspace_read_active_file", {});
    h.callbacks().onOutputTranscript("ဖွင့်ထားတဲ့ note မရှိပါ။ Note တစ်ခုဖွင့်ပြီး ပြန်စမ်းပါ။");
    expect(h.engine.getSnapshot()).toEqual(expect.objectContaining({
      grounded: true,
      actionStatus: "failed",
      operationLabel: "Unable to verify",
    }));
  });
});
