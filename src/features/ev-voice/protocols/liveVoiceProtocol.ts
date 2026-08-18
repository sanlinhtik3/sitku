import type { EvFunctionDeclaration } from "@/features/ev-voice/workspace/contracts";

export type EvReasoningLevel = "minimal" | "low" | "medium" | "high" | "dynamic";

/**
 * One shared turn-timing contract for the local activity UI and Gemini Live.
 * The model remains the authoritative VAD; these values only remove avoidable
 * dead air after a completed utterance without buffering the user's audio.
 */
export const EV_LIVE_TURN_TIMING = Object.freeze({
  prefixPaddingMs: 60,
  trailingSilenceMs: 560,
});

export interface EvReconnectOutcome {
  resumed: boolean;
  downtimeMs: number;
  bufferedAudioMs: number;
  droppedAudioMs: number;
  reason?: "resumed" | "missing-checkpoint" | "stale-buffer";
}

export interface EvLiveSessionConfig {
  model: string;
  reasoningLevel: EvReasoningLevel;
}

export interface EvLiveProtocolCallbacks {
  onAudio: (pcm: Int16Array, sampleRate: number) => void;
  onInputTranscript: (text: string) => void;
  onOutputTranscript: (text: string) => void;
  onToolCall: (id: string, name: string, args: unknown) => void;
  onToolCancellation?: (ids: string[]) => void;
  onGenerationComplete?: () => void;
  onTurnComplete: () => void;
  onConnected?: () => void;
  onInterrupted?: () => void;
  onReconnecting?: () => void;
  onReconnectOutcome?: (outcome: EvReconnectOutcome) => void;
  onError: (error: string) => void;
}

export interface EvLiveProtocol {
  connect(
    model: string,
    systemInstruction: string,
    actionSchema: Record<string, unknown>,
    extraTools?: EvFunctionDeclaration[],
  ): Promise<void>;
  connectTranslation(config: import("./liveTranslationProtocol").EvLiveTranslationConfig): Promise<void>;
  sendAudio(pcmFloat32: Float32Array, sampleRate?: number): boolean;
  endAudioStream(): boolean;
  sendToolResponse(id: string, name: string, result: unknown): boolean;
  sendBackgroundReport(report: string): boolean;
  sendSessionContext(context: string): boolean;
  requestSpokenReply(): boolean;
  interrupt(): boolean;
  disconnect(): void;
}

export type EvLiveProtocolFactory = (callbacks: EvLiveProtocolCallbacks) => EvLiveProtocol;
