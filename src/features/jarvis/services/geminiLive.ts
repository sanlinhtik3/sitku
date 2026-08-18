import { evModels, geminiKey, TTS_VOICE } from "./settings";
import type { EvFunctionDeclaration } from "@/features/ev-voice/workspace/contracts";
import {
  EV_LIVE_TRANSLATE_MODEL,
  EV_LIVE_RELIABILITY,
  EV_LIVE_TURN_TIMING,
  evLiveReconnectDelayMs,
  type EvLiveProtocol,
  type EvLiveProtocolCallbacks,
  type EvLiveSessionConfig,
  type EvLiveTranslationConfig,
} from "@/features/ev-voice/protocols";
import { evLiveModelProfile, evLiveReasoningLevel, normalizeEvLiveModel } from "./liveModelProfiles";

const LIVE_ENDPOINT = "wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService";
const DIRECT_METHOD = "BidiGenerateContent";
const TOKEN_METHOD = "BidiGenerateContentConstrained";
const SETUP_TIMEOUT_MS = 10_000;
// Match the setup timeout so speech begun immediately after tapping the orb is
// retained even on a slow token/WebSocket handshake. About 320 KB of PCM16 max.
const INITIAL_AUDIO_BUFFER_SAMPLES = 160_000;

type LiveConfig = {
  mode: "agent" | "translation";
  model: string;
  systemInstruction: string;
  actionSchema: Record<string, unknown>;
  extraTools: EvFunctionDeclaration[];
  translation?: EvLiveTranslationConfig;
};

type ServerMessage = {
  error?: { code?: number; message?: string; status?: string };
  setupComplete?: Record<string, never>;
  serverContent?: {
    modelTurn?: {
      parts?: Array<{
        text?: string;
        thought?: boolean;
        thoughtSignature?: string;
        inlineData?: { data?: string; mimeType?: string };
      }>;
    };
    inputTranscription?: { text?: string };
    outputTranscription?: { text?: string };
    interrupted?: boolean;
    generationComplete?: boolean;
    turnComplete?: boolean;
  };
  toolCall?: { functionCalls?: Array<{ id?: string; name?: string; args?: unknown }> };
  toolCallCancellation?: { ids?: string[] };
  goAway?: { timeLeft?: string };
  sessionResumptionUpdate?: { newHandle?: string; resumable?: boolean };
};

type PendingControlMessage = {
  payload: unknown;
  queuedAt: number;
};

type PendingAudio = { payload: unknown; samples: number; queuedAt: number };

export type LiveClientCallbacks = EvLiveProtocolCallbacks;

const desktopBridge = () => typeof window !== "undefined" ? window.beebotDesktop : undefined;
const normalizeModel = normalizeEvLiveModel;

export function currentGeminiLiveSession(): EvLiveSessionConfig {
  const model = evModels.brain();
  return { model, reasoningLevel: evLiveReasoningLevel(model) };
}

async function eventText(data: unknown): Promise<string> {
  if (typeof data === "string") return data;
  if (data instanceof Blob) return data.text();
  if (data instanceof ArrayBuffer) return new TextDecoder().decode(data);
  if (ArrayBuffer.isView(data)) return new TextDecoder().decode(data);
  return String(data ?? "");
}

function sanitizeLiveSchema(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sanitizeLiveSchema);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value as Record<string, unknown>)
    .filter(([key]) => key !== "additionalProperties")
    .map(([key, child]) => [key, sanitizeLiveSchema(child)]));
}

function liveFunctionDeclaration(declaration: EvFunctionDeclaration): EvFunctionDeclaration {
  return {
    ...declaration,
    ...(declaration.parameters
      ? { parameters: sanitizeLiveSchema(declaration.parameters) as Record<string, unknown> }
      : {}),
  };
}

function liveSetup(config: LiveConfig, resumeHandle?: string, extendedVoiceFeatures = true) {
  if (config.mode === "translation" && config.translation) {
    return {
      setup: {
        model: EV_LIVE_TRANSLATE_MODEL,
        generationConfig: {
          responseModalities: ["AUDIO"],
          inputAudioTranscription: {},
          outputAudioTranscription: {},
          translationConfig: {
            targetLanguageCode: config.translation.targetLanguageCode,
            echoTargetLanguage: config.translation.echoTargetLanguage,
          },
        },
      },
    };
  }
  const profile = evLiveModelProfile(config.model);
  return {
    setup: {
      model: normalizeModel(config.model),
      generationConfig: {
        responseModalities: ["AUDIO"],
        speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: TTS_VOICE } } },
        ...(profile.thinkingConfig ? { thinkingConfig: profile.thinkingConfig } : {}),
      },
      // Gemini 3.1 already detects acoustic nuance, but its Live API does not
      // support the explicit affective-dialog flag. Only send the field for the
      // 2.5 native-audio profile that officially supports it.
      ...(extendedVoiceFeatures && profile.affectiveDialog ? { enableAffectiveDialog: true } : {}),
      // Proactive audio lets the supported native-audio model stay quiet when
      // ambient speech is not directed at E.V instead of forcing a reply.
      ...(extendedVoiceFeatures && profile.proactiveAudio ? { proactivity: { proactiveAudio: true } } : {}),
      systemInstruction: { parts: [{ text: config.systemInstruction }] },
      tools: [{
        functionDeclarations: [{
          name: "execute_action",
          description: "Execute one validated Sitku action. Use only when the user explicitly asks for an app action.",
          parameters: sanitizeLiveSchema(config.actionSchema) as Record<string, unknown>,
        }, ...config.extraTools.map(liveFunctionDeclaration)],
      }],
      realtimeInputConfig: {
        automaticActivityDetection: {
          disabled: false,
          startOfSpeechSensitivity: "START_SENSITIVITY_HIGH",
          prefixPaddingMs: EV_LIVE_TURN_TIMING.prefixPaddingMs,
          endOfSpeechSensitivity: "END_SENSITIVITY_HIGH",
          silenceDurationMs: EV_LIVE_TURN_TIMING.trailingSilenceMs,
        },
        // Official Gemini Live barge-in: new user activity cancels the active model response.
        // The renderer keeps streaming mic PCM during playback; Web Audio AEC limits self-echo.
        activityHandling: "START_OF_ACTIVITY_INTERRUPTS",
        turnCoverage: "TURN_INCLUDES_ONLY_ACTIVITY",
      },
      inputAudioTranscription: {},
      outputAudioTranscription: {},
      sessionResumption: resumeHandle ? { handle: resumeHandle } : {},
      contextWindowCompression: { slidingWindow: {} },
    },
  };
}

function isExtendedSetupSchemaError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? "");
  return /Unknown name ["']?(?:enableAffectiveDialog|enable_affective_dialog|proactivity|proactiveAudio)|Cannot find field/i.test(message);
}

export class GeminiLiveClient implements EvLiveProtocol {
  private ws: WebSocket | null = null;
  private setupComplete = false;
  private closedByClient = false;
  private config: LiveConfig | null = null;
  private resumeHandle = "";
  private authToken = "";
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectAttempt = 0;
  private socketGeneration = 0;
  private cancelPendingConnection: (() => void) | null = null;
  private extendedSetupDisabled = false;
  private reconnectFailureReported = false;
  private readonly pendingControls = new Map<string, PendingControlMessage>();
  private pendingInitialAudio: PendingAudio[] = [];
  private pendingInitialAudioSamples = 0;
  private pendingReconnectAudio: PendingAudio[] = [];
  private pendingReconnectAudioSamples = 0;
  private reconnectStartedAt = 0;
  private hasConnectedSession = false;

  constructor(private readonly callbacks: LiveClientCallbacks) {}

  async connect(
    model: string,
    systemInstruction: string,
    actionSchema: Record<string, unknown>,
    extraTools: EvFunctionDeclaration[] = [],
  ) {
    return this.connectWithConfig({
      mode: "agent",
      model: normalizeModel(model),
      systemInstruction,
      actionSchema,
      extraTools,
    });
  }

  async connectTranslation(translation: EvLiveTranslationConfig) {
    return this.connectWithConfig({
      mode: "translation",
      model: EV_LIVE_TRANSLATE_MODEL,
      systemInstruction: "",
      actionSchema: {},
      extraTools: [],
      translation,
    });
  }

  private async connectWithConfig(config: LiveConfig) {
    this.disconnect();
    this.closedByClient = false;
    this.resumeHandle = "";
    this.authToken = "";
    this.reconnectAttempt = 0;
    this.reconnectFailureReported = false;
    this.pendingControls.clear();
    this.pendingInitialAudio = [];
    this.pendingInitialAudioSamples = 0;
    this.pendingReconnectAudio = [];
    this.pendingReconnectAudioSamples = 0;
    this.reconnectStartedAt = 0;
    this.hasConnectedSession = false;
    this.config = config;
    this.extendedSetupDisabled = false;
    try {
      await this.openSocket(false);
    } catch (error) {
      if (!isExtendedSetupSchemaError(error)) throw error;
      // Gemini's secure constrained-token transport can lag the direct Live
      // schema. Keep the native-audio session available and preserve adaptive
      // delivery through the system instruction instead of failing startup.
      this.extendedSetupDisabled = true;
      this.authToken = "";
      await this.openSocket(true);
    }
  }

  private async getConnectionTarget(refreshToken: boolean): Promise<{ url: string; extendedSetup: boolean }> {
    const desktop = desktopBridge();
    if (desktop?.evLiveToken) {
      if (!this.authToken || refreshToken) {
        const credential = await desktop.evLiveToken(
          this.config?.model || "gemini-3.1-flash-live-preview",
          this.config?.translation,
        );
        this.authToken = credential.token;
      }
      return {
        url: `${LIVE_ENDPOINT}.${TOKEN_METHOD}?access_token=${encodeURIComponent(this.authToken)}`,
        // BidiGenerateContentConstrained currently rejects affective/proactive
        // fields even though the direct v1beta setup schema documents them.
        extendedSetup: false,
      };
    }
    const key = geminiKey.get();
    if (!key || key === "desktop-secure-key") throw new Error("Gemini API key is not configured");
    return {
      url: `${LIVE_ENDPOINT}.${DIRECT_METHOD}?key=${encodeURIComponent(key)}`,
      extendedSetup: true,
    };
  }

  private async openSocket(isReconnect: boolean): Promise<void> {
    if (!this.config || this.closedByClient) return;
    // Desktop credentials are one-use tokens. A resumed Live session still needs a
    // newly minted token for the replacement WebSocket; the resume handle belongs
    // in setup.sessionResumption, never in the authentication cache.
    const target = await this.getConnectionTarget(isReconnect);
    const attemptedResume = isReconnect && Boolean(this.resumeHandle);
    const generation = ++this.socketGeneration;
    await new Promise<void>((resolve, reject) => {
      let settled = false;
      let setupTimer: ReturnType<typeof setTimeout> | null = null;
      let ws: WebSocket;
      const isCurrent = () => generation === this.socketGeneration && this.ws === ws && !this.closedByClient;
      const clearSetupTimer = () => {
        if (setupTimer) clearTimeout(setupTimer);
        setupTimer = null;
      };
      const rejectSetup = (error: Error) => {
        if (settled) return;
        settled = true;
        clearSetupTimer();
        if (this.cancelPendingConnection === cancelConnection) this.cancelPendingConnection = null;
        reject(error);
      };
      const cancelConnection = () => rejectSetup(new Error("Gemini Live connection cancelled"));
      this.cancelPendingConnection = cancelConnection;
      try {
        ws = new WebSocket(target.url);
      } catch (error) {
        rejectSetup(error instanceof Error ? error : new Error(String(error)));
        return;
      }
      this.ws = ws;
      setupTimer = setTimeout(() => {
        if (!isCurrent() || this.setupComplete) return;
        rejectSetup(new Error(`Gemini Live setup timed out after ${SETUP_TIMEOUT_MS}ms`));
        this.retireSocket(ws, 4000, "setup timeout");
      }, SETUP_TIMEOUT_MS);
      ws.onopen = () => {
        if (!isCurrent()) return;
        try {
          ws.send(JSON.stringify(liveSetup(
            this.config!,
            this.resumeHandle || undefined,
            target.extendedSetup && !this.extendedSetupDisabled,
          )));
        } catch (error) {
          rejectSetup(error instanceof Error ? error : new Error(String(error)));
          this.retireSocket(ws, 4001, "setup send failed");
        }
      };
      ws.onmessage = (event) => {
        void eventText(event.data).then((text) => {
          if (!isCurrent()) return;
          let message: ServerMessage;
          try { message = JSON.parse(text) as ServerMessage; }
          catch {
            const error = new Error("Gemini Live returned malformed JSON");
            if (!this.setupComplete) {
              rejectSetup(error);
              this.retireSocket(ws, 4002, "malformed setup response");
            } else {
              this.callbacks.onError(error.message);
            }
            return;
          }
          if (message.error) {
            const error = new Error(message.error.message || message.error.status || "Gemini Live setup failed");
            if (!this.setupComplete) {
              rejectSetup(error);
              this.retireSocket(ws, 4005, "setup rejected");
            } else {
              this.callbacks.onError(error.message);
            }
            return;
          }
          if (message.setupComplete) {
            this.setupComplete = true;
            this.reconnectAttempt = 0;
            this.reconnectFailureReported = false;
            clearSetupTimer();
            if (!settled) {
              settled = true;
              if (this.cancelPendingConnection === cancelConnection) this.cancelPendingConnection = null;
              resolve();
            }
            this.hasConnectedSession = true;
            if (!this.flushInitialAudio() || !this.ready()) return;
            if (isReconnect && !this.flushReconnectAudio(attemptedResume)) return;
            if (!this.flushPendingControls() || !this.ready()) return;
            this.callbacks.onConnected?.();
          }
          this.handleMessage(message);
        }).catch((error) => {
          if (isCurrent()) this.callbacks.onError(error instanceof Error ? error.message : String(error));
        });
      };
      ws.onerror = () => {
        if (!isCurrent()) return;
        const wasReady = this.setupComplete;
        this.setupComplete = false;
        rejectSetup(new Error("Gemini Live connection failed"));
        this.retireSocket(ws, 4004, "transport error");
        if (wasReady) this.scheduleReconnect();
      };
      ws.onclose = (event) => {
        if (generation !== this.socketGeneration) return;
        clearSetupTimer();
        const wasReady = this.setupComplete;
        this.setupComplete = false;
        if (this.ws === ws) this.ws = null;
        if (!settled) {
          settled = true;
          reject(new Error(event.reason || `Gemini Live closed before setup (${event.code})`));
        }
        if (!this.closedByClient && wasReady) this.scheduleReconnect();
      };
    });
  }

  private handleMessage(message: ServerMessage) {
    const content = message.serverContent;
    if (content?.inputTranscription?.text) this.callbacks.onInputTranscript(content.inputTranscription.text);
    if (content?.outputTranscription?.text) this.callbacks.onOutputTranscript(content.outputTranscription.text);
    for (const part of content?.modelTurn?.parts || []) {
      if (part.inlineData?.data) this.callbacks.onAudio(this.base64ToInt16Array(part.inlineData.data), 24_000);
    }
    if (content?.interrupted) this.callbacks.onInterrupted?.();
    if (content?.generationComplete) this.callbacks.onGenerationComplete?.();
    if (content?.turnComplete) this.callbacks.onTurnComplete();
    for (const call of message.toolCall?.functionCalls || []) {
      if (call.id && call.name) this.callbacks.onToolCall(call.id, call.name, call.args ?? {});
    }
    if (message.toolCallCancellation?.ids?.length) this.callbacks.onToolCancellation?.(message.toolCallCancellation.ids);
    if (message.sessionResumptionUpdate?.resumable && message.sessionResumptionUpdate.newHandle) {
      this.resumeHandle = message.sessionResumptionUpdate.newHandle;
    }
    if (message.goAway) this.handoffConnection();
  }

  private handoffConnection() {
    const retiringSocket = this.ws;
    this.ws = null;
    this.setupComplete = false;
    if (retiringSocket) this.retireSocket(retiringSocket, 1000, "server requested reconnect");
    this.scheduleReconnect(0);
  }

  private retireSocket(socket: WebSocket, code: number, reason: string) {
    socket.onopen = null;
    socket.onmessage = null;
    socket.onerror = null;
    socket.onclose = null;
    try { socket.close(code, reason); } catch { /* already closed */ }
    if (this.ws === socket) this.ws = null;
  }

  private scheduleReconnect(delay?: number) {
    if (this.closedByClient || this.reconnectTimer) return;
    if (this.reconnectAttempt >= EV_LIVE_RELIABILITY.maxReconnectAttempts) {
      this.reportReconnectExhausted();
      return;
    }
    if (this.reconnectStartedAt <= 0) this.reconnectStartedAt = performance.now();
    this.callbacks.onReconnecting?.();
    const wait = delay ?? evLiveReconnectDelayMs(this.reconnectAttempt);
    this.reconnectAttempt += 1;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      void this.openSocket(true).catch((error) => {
        if (this.closedByClient) return;
        if (this.reconnectAttempt >= EV_LIVE_RELIABILITY.maxReconnectAttempts) {
          this.reportReconnectExhausted(error);
        }
        else this.scheduleReconnect();
      });
    }, wait);
  }

  private reportReconnectExhausted(error?: unknown) {
    if (this.reconnectFailureReported || this.closedByClient) return;
    this.reconnectFailureReported = true;
    const detail = error instanceof Error ? error.message : String(error || "reconnect attempts exhausted");
    this.callbacks.onError(`Gemini Live could not restore the session: ${detail}`);
  }

  sendAudio(pcmFloat32: Float32Array, sampleRate = 16_000) {
    const pcm = this.floatToPcm16(this.resample(pcmFloat32, sampleRate, 16_000));
    const payload = {
      realtimeInput: { audio: { mimeType: "audio/pcm;rate=16000", data: this.arrayBufferToBase64(pcm.buffer) } },
    };
    if (this.ready() && this.send(payload)) return true;
    if (this.closedByClient || !this.config) return false;
    if (this.hasConnectedSession) {
      this.pendingReconnectAudio.push({ payload, samples: pcm.length, queuedAt: performance.now() });
      this.pendingReconnectAudioSamples += pcm.length;
      const limit = Math.round(16_000 * EV_LIVE_RELIABILITY.reconnectAudioBufferMs / 1_000);
      while (this.pendingReconnectAudioSamples > limit && this.pendingReconnectAudio.length > 1) {
        const dropped = this.pendingReconnectAudio.shift();
        this.pendingReconnectAudioSamples -= dropped?.samples || 0;
      }
      return true;
    }
    this.pendingInitialAudio.push({ payload, samples: pcm.length, queuedAt: performance.now() });
    this.pendingInitialAudioSamples += pcm.length;
    while (this.pendingInitialAudioSamples > INITIAL_AUDIO_BUFFER_SAMPLES && this.pendingInitialAudio.length > 1) {
      const dropped = this.pendingInitialAudio.shift();
      this.pendingInitialAudioSamples -= dropped?.samples || 0;
    }
    return true;
  }

  endAudioStream() {
    return this.send({ realtimeInput: { audioStreamEnd: true } });
  }

  sendToolResponse(id: string, name: string, result: unknown) {
    const payload = { toolResponse: { functionResponses: [{ id, name, response: result }] } };
    const key = `tool:${id}:${name}`;
    if (this.send(payload)) {
      this.pendingControls.delete(key);
      return true;
    }
    return this.queueControl(key, payload);
  }

  sendBackgroundReport(report: string) {
    return this.send({
      clientContent: {
        turns: [{
          role: "user",
          parts: [{ text: `[SYSTEM EVENT: A delegated E.V Operator job has settled. Report this result to the user now in the current conversation language. Be concise, preserve failure details, and do not claim the user said this.]\n${report}` }],
        }],
        turnComplete: true,
      },
    });
  }

  requestSpokenReply() {
    return this.send({
      clientContent: {
        turns: [{
          role: "user",
          parts: [{ text: "Your previous turn produced no playable audio. Respond now to the user's latest completed utterance with one concise spoken answer. Do not describe internal reasoning." }],
        }],
        turnComplete: true,
      },
    });
  }

  interrupt() {
    // Live API treats client content as an explicit interruption. Realtime mic stays open.
    return this.send({ clientContent: { turns: [], turnComplete: false } });
  }

  private send(payload: unknown): boolean {
    if (!this.ready() || !this.ws) return false;
    try {
      this.ws.send(JSON.stringify(payload));
      return true;
    } catch {
      // A send can race with a server close. Retiring this socket lets the normal
      // reconnect policy recover without throwing through the audio worklet callback.
      const failedSocket = this.ws;
      this.setupComplete = false;
      this.ws = null;
      this.retireSocket(failedSocket, 4003, "send failed");
      this.scheduleReconnect();
      return false;
    }
  }

  private queueControl(key: string, payload: unknown): boolean {
    if (this.closedByClient) return false;
    if (!this.pendingControls.has(key) && this.pendingControls.size >= EV_LIVE_RELIABILITY.pendingControlLimit) {
      queueMicrotask(() => this.callbacks.onError("Gemini Live control queue is full; the tool result was not accepted"));
      return false;
    }
    this.pendingControls.set(key, { payload, queuedAt: Date.now() });
    if (!this.ws && !this.reconnectTimer) this.scheduleReconnect();
    return true;
  }

  private flushPendingControls(): boolean {
    if (this.pendingControls.size > 0 && !this.resumeHandle) {
      this.pendingControls.clear();
      queueMicrotask(() => this.callbacks.onError("Gemini Live disconnected before a resumable checkpoint; the pending tool result was not replayed"));
      return false;
    }
    const now = Date.now();
    for (const [key, pending] of this.pendingControls) {
      if (now - pending.queuedAt > EV_LIVE_RELIABILITY.pendingControlMaxAgeMs) {
        this.pendingControls.delete(key);
        queueMicrotask(() => this.callbacks.onError("Gemini Live could not deliver a tool result before it expired"));
        return false;
      }
      if (!this.send(pending.payload)) return false;
      this.pendingControls.delete(key);
    }
    return true;
  }

  private flushInitialAudio(): boolean {
    const pending = this.pendingInitialAudio;
    this.pendingInitialAudio = [];
    this.pendingInitialAudioSamples = 0;
    for (const item of pending) {
      if (!this.send(item.payload)) return false;
    }
    return true;
  }

  private flushReconnectAudio(attemptedResume: boolean): boolean {
    const pending = this.pendingReconnectAudio;
    const samples = this.pendingReconnectAudioSamples;
    const bufferedAudioMs = Math.round(samples / 16);
    const oldestAgeMs = pending.length ? performance.now() - pending[0].queuedAt : 0;
    const fresh = oldestAgeMs <= EV_LIVE_RELIABILITY.reconnectAudioBufferMs;
    const resumed = attemptedResume && fresh;
    this.pendingReconnectAudio = [];
    this.pendingReconnectAudioSamples = 0;
    if (resumed) {
      for (const item of pending) {
        if (!this.send(item.payload)) return false;
      }
    }
    this.callbacks.onReconnectOutcome?.({
      resumed,
      downtimeMs: this.reconnectStartedAt > 0 ? Math.max(0, Math.round(performance.now() - this.reconnectStartedAt)) : 0,
      bufferedAudioMs,
      droppedAudioMs: resumed ? 0 : bufferedAudioMs,
      reason: resumed ? "resumed" : attemptedResume ? "stale-buffer" : "missing-checkpoint",
    });
    this.reconnectStartedAt = 0;
    return true;
  }

  disconnect() {
    this.closedByClient = true;
    this.setupComplete = false;
    this.socketGeneration += 1;
    this.cancelPendingConnection?.();
    this.cancelPendingConnection = null;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    this.reconnectAttempt = 0;
    this.reconnectFailureReported = false;
    this.resumeHandle = "";
    this.authToken = "";
    this.pendingControls.clear();
    this.pendingInitialAudio = [];
    this.pendingInitialAudioSamples = 0;
    this.pendingReconnectAudio = [];
    this.pendingReconnectAudioSamples = 0;
    this.reconnectStartedAt = 0;
    this.hasConnectedSession = false;
    if (this.ws) {
      this.retireSocket(this.ws, 1000, "client closed");
    }
  }

  private ready() { return Boolean(this.ws && this.ws.readyState === WebSocket.OPEN && this.setupComplete); }

  private resample(input: Float32Array, inRate: number, outRate: number): Float32Array {
    if (inRate === outRate) return input;
    const ratio = inRate / outRate;
    const output = new Float32Array(Math.max(1, Math.round(input.length / ratio)));
    for (let i = 0; i < output.length; i++) {
      const pos = i * ratio;
      const index = Math.floor(pos);
      const frac = pos - index;
      const a = input[index] ?? 0;
      output[i] = a + ((input[index + 1] ?? a) - a) * frac;
    }
    return output;
  }

  private floatToPcm16(input: Float32Array) {
    const output = new Int16Array(input.length);
    for (let i = 0; i < input.length; i++) {
      const sample = Math.max(-1, Math.min(1, input[i]));
      output[i] = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
    }
    return output;
  }

  private base64ToInt16Array(base64: string): Int16Array {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return new Int16Array(bytes.buffer);
  }

  private arrayBufferToBase64(buffer: ArrayBufferLike): string {
    const bytes = new Uint8Array(buffer);
    let binary = "";
    for (let offset = 0; offset < bytes.length; offset += 0x8000) {
      binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
    }
    return btoa(binary);
  }
}
