import { useCallback, useEffect, useRef, useState } from "react";
import { useRepositories } from "@/repositories/runtime/RepositoryProvider";
import { consultantStore, type PostJoined } from "@/repositories/local/consultantStore";
import { analyzeContent } from "./analyzeContent";
import { createContentReviewRepository } from "./contentReviewRepository";
import {
  DEFAULT_CONTENT_PROFILE,
  type ContentAnalysisInput,
  type ContentCalibration,
  type ContentDeepReview,
  type ContentProfile,
  type ContentSignalId,
  type ContentSignalReport,
  type ContentSignalScore,
  type VerifiedContentOutcome,
} from "./types";

const ANALYSIS_IDLE_MS = 800;

function fallbackHash(content: string): string {
  let hash = 2166136261;
  for (let index = 0; index < content.length; index += 1) {
    hash ^= content.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `fallback:${(hash >>> 0).toString(16)}:${content.length}`;
}

async function contentHash(content: string): Promise<string> {
  if (!globalThis.crypto?.subtle) return fallbackHash(content);
  const data = new TextEncoder().encode(content.replace(/\r\n/g, "\n"));
  const digest = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function readGeminiText(body: string): string {
  const parsed = JSON.parse(body) as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
  const text = parsed.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join("").trim();
  if (!text) throw new Error("The review provider returned no text.");
  return text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
}

type AiScoreKey = "readiness" | "hook" | "flow" | "clarity" | "retention" | "evidence" | "platformFit" | "viralPotential";

const AI_SCORE_DEFINITIONS: Array<{ key: AiScoreKey; id: ContentSignalId; label: string }> = [
  { key: "readiness", id: "readiness", label: "Content readiness" },
  { key: "hook", id: "hook", label: "Hook strength" },
  { key: "flow", id: "flow", label: "Storytelling & flow" },
  { key: "clarity", id: "clarity", label: "Clarity" },
  { key: "retention", id: "retention", label: "Retention" },
  { key: "evidence", id: "evidence", label: "Evidence health" },
  { key: "platformFit", id: "platform_fit", label: "Platform fit" },
  { key: "viralPotential", id: "viral_potential", label: "Viral potential" },
];

function cleanString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value.trim() : fallback;
}

function cleanStringList(value: unknown): string[] {
  return Array.isArray(value)
    ? value.map((item) => cleanString(item)).filter(Boolean).slice(0, 4).map((item) => item.slice(0, 240))
    : [];
}

function normalizeAiScore(value: unknown, definition: typeof AI_SCORE_DEFINITIONS[number]): ContentSignalScore {
  const candidate = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const rawScore = typeof candidate.value === "number" && Number.isFinite(candidate.value) ? candidate.value : null;
  const score = rawScore == null ? null : Math.round(Math.max(0, Math.min(100, rawScore)));
  const reason = cleanString(candidate.reason, score == null ? "The review needs more evidence." : "AI-reviewed signal.").slice(0, 280);
  const paragraph = typeof candidate.paragraph === "number" && candidate.paragraph > 0 ? Math.floor(candidate.paragraph) : undefined;
  return {
    id: definition.id,
    label: definition.label,
    value: score,
    confidence: score == null ? "low" : "medium",
    status: score == null ? "needs_data" : score >= 70 ? "good" : "watch",
    summary: reason,
    evidence: paragraph ? [{ paragraph, text: reason }] : undefined,
  };
}

export function parseDeepReview(raw: string): ContentDeepReview {
  const parsed = JSON.parse(raw) as Partial<ContentDeepReview> & { scores?: Partial<Record<AiScoreKey, unknown>> };
  const recommendations = Array.isArray(parsed.recommendations)
    ? parsed.recommendations
        .filter((item): item is { id?: unknown; title?: unknown; detail?: unknown; paragraph?: unknown } => Boolean(item && typeof item === "object"))
        .slice(0, 3)
        .map((item, index) => ({
          id: typeof item.id === "string" ? item.id : `ai-${index + 1}`,
          title: typeof item.title === "string" ? item.title.slice(0, 100) : "Improve this section",
          detail: typeof item.detail === "string" ? item.detail.slice(0, 280) : "Make this edit more specific.",
          paragraph: typeof item.paragraph === "number" && item.paragraph > 0 ? Math.floor(item.paragraph) : undefined,
        }))
    : [];
  if (!parsed.scores || typeof parsed.scores !== "object") {
    throw new Error("The review provider returned no validated scores.");
  }
  const summary = cleanString(parsed.summary);
  const verdict = cleanString(parsed.verdict);
  const strengths = cleanStringList(parsed.strengths);
  const weaknesses = cleanStringList(parsed.weaknesses);
  const strongest = cleanString(parsed.strongest, strengths[0]);
  const weakest = cleanString(parsed.weakest, weaknesses[0]);
  if (!summary || !verdict || !strongest || !weakest) {
    throw new Error("The review provider returned an invalid review shape.");
  }
  return {
    summary: summary.slice(0, 800),
    verdict: verdict.slice(0, 500),
    strongest: strongest.slice(0, 280),
    weakest: weakest.slice(0, 280),
    strengths: strengths.length ? strengths : [strongest.slice(0, 240)],
    weaknesses: weaknesses.length ? weaknesses : [weakest.slice(0, 240)],
    scores: AI_SCORE_DEFINITIONS.map((definition) => normalizeAiScore(parsed.scores?.[definition.key], definition)),
    recommendations,
    reviewedAt: Date.now(),
  };
}

export function reviewPrompt(input: ContentAnalysisInput): string {
  return [
    "You are Sitku Content Intelligence. Analyze only the supplied note; never invent facts, audience results, or published performance.",
    "Review its summary, hook, storytelling flow, clarity, retention, evidence quality, platform fit, strengths, and weaknesses.",
    "Every score is 0-100, or null when the note has insufficient evidence. Viral potential is a heuristic, never a guaranteed outcome.",
    "For each score return a short reason and the most relevant 1-based paragraph when possible.",
    "Return JSON only. Do not use markdown fences.",
    "Schema: {\"summary\":string,\"verdict\":string,\"strongest\":string,\"weakest\":string,\"strengths\":[string],\"weaknesses\":[string],\"scores\":{\"readiness\":{\"value\":number|null,\"reason\":string,\"paragraph\":number|null},\"hook\":{\"value\":number|null,\"reason\":string,\"paragraph\":number|null},\"flow\":{\"value\":number|null,\"reason\":string,\"paragraph\":number|null},\"clarity\":{\"value\":number|null,\"reason\":string,\"paragraph\":number|null},\"retention\":{\"value\":number|null,\"reason\":string,\"paragraph\":number|null},\"evidence\":{\"value\":number|null,\"reason\":string,\"paragraph\":number|null},\"platformFit\":{\"value\":number|null,\"reason\":string,\"paragraph\":number|null},\"viralPotential\":{\"value\":number|null,\"reason\":string,\"paragraph\":number|null}},\"recommendations\":[{\"id\":string,\"title\":string,\"detail\":string,\"paragraph\":number}]}",
    `Profile: ${JSON.stringify(input.profile)}`,
    "Content:",
    input.content.slice(0, 60_000),
  ].join("\n");
}

export function useContentSignals(input: {
  active: boolean;
  notePath?: string;
  getContent: () => string;
}) {
  const { active, notePath, getContent } = input;
  const { settings } = useRepositories();
  const getContentRef = useRef(getContent);
  getContentRef.current = getContent;
  const workerRef = useRef<Worker | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const revisionRef = useRef(0);
  const requestRef = useRef(0);
  const latestInputRef = useRef<ContentAnalysisInput | null>(null);
  const reviewControllerRef = useRef<AbortController | null>(null);
  const repositoryRef = useRef(createContentReviewRepository(settings));
  const [profile, setProfile] = useState<ContentProfile>(DEFAULT_CONTENT_PROFILE);
  const [report, setReport] = useState<ContentSignalReport | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isReviewing, setIsReviewing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [calibration, setCalibration] = useState<ContentCalibration | null>(null);
  const [verifiedOutcomes, setVerifiedOutcomes] = useState<VerifiedContentOutcome[]>([]);
  const [manualPosts, setManualPosts] = useState<PostJoined[]>([]);

  const run = useCallback(async () => {
    if (!active || !notePath) return;
    const content = getContentRef.current();
    const revision = ++revisionRef.current;
    setIsAnalyzing(true);
    setError(null);
    const contentHashValue = await contentHash(content);
    if (revision !== revisionRef.current || !active) return;
    const analysisInput: ContentAnalysisInput = { content, contentHash: contentHashValue, profile };
    latestInputRef.current = analysisInput;
    const requestId = ++requestRef.current;

    const complete = (next: ContentSignalReport) => {
      if (requestId !== requestRef.current || revision !== revisionRef.current) return;
      setReport(next);
      setIsAnalyzing(false);
    };

    try {
      if (!workerRef.current) {
        workerRef.current = new Worker(new URL("./contentSignals.worker.ts", import.meta.url), { type: "module" });
        workerRef.current.onmessage = (event: MessageEvent<{ id: number; report?: ContentSignalReport; error?: string }>) => {
          if (event.data.id !== requestRef.current) return;
          if (event.data.error) {
            setError(event.data.error);
            setIsAnalyzing(false);
          } else if (event.data.report) {
            setReport(event.data.report);
            setIsAnalyzing(false);
          }
        };
      }
      workerRef.current.postMessage({ id: requestId, input: analysisInput });
    } catch {
      complete(analyzeContent(analysisInput));
    }
  }, [active, notePath, profile]);

  const schedule = useCallback(() => {
    if (!active || !notePath) return;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => { void run(); }, ANALYSIS_IDLE_MS);
  }, [active, notePath, run]);

  useEffect(() => {
    if (!active) return;
    schedule();
    const onDirty = () => {
      reviewControllerRef.current?.abort();
      setReport((current) => current?.aiReview ? { ...current, aiReview: undefined } : current);
      schedule();
    };
    window.addEventListener("sitku:editor-dirty", onDirty);
    return () => {
      window.removeEventListener("sitku:editor-dirty", onDirty);
      if (timerRef.current) clearTimeout(timerRef.current);
      revisionRef.current += 1;
      reviewControllerRef.current?.abort();
    };
  }, [active, notePath, schedule]);

  useEffect(() => () => workerRef.current?.terminate(), []);

  const refreshCalibration = useCallback(async () => {
    if (!notePath) return;
    try {
      const [nextCalibration, outcomes, posts] = await Promise.all([
        repositoryRef.current.getCalibration(profile),
        repositoryRef.current.listVerifiedOutcomes(notePath),
        consultantStore.listPosts(),
      ]);
      setCalibration(nextCalibration);
      setVerifiedOutcomes(outcomes);
      setManualPosts(posts.filter((post) => post.source === "manual"));
    } catch (calibrationError) {
      setError(calibrationError instanceof Error ? calibrationError.message : "Could not load calibration data.");
    }
  }, [notePath, profile]);

  useEffect(() => { void refreshCalibration(); }, [refreshCalibration]);

  const linkVerifiedPost = useCallback(async (postId: string) => {
    const nextInput = latestInputRef.current;
    if (!nextInput || !notePath) return;
    setError(null);
    try {
      await repositoryRef.current.linkVerifiedOutcome({
        notePath,
        contentHash: nextInput.contentHash,
        postId,
        platform: profile.platform,
        format: profile.format,
      });
      await refreshCalibration();
    } catch (linkError) {
      setError(linkError instanceof Error ? linkError.message : "Could not link the verified result.");
    }
  }, [notePath, profile.format, profile.platform, refreshCalibration]);

  const review = useCallback(async () => {
    const nextInput = latestInputRef.current;
    if (!nextInput) return;
    const desktop = window.beebotDesktop;
    if (!desktop?.jarvisGemini) {
      setError("Deep Review is available in the Electron desktop app when a Gemini key is configured.");
      return;
    }
    reviewControllerRef.current?.abort();
    const controller = new AbortController();
    reviewControllerRef.current = controller;
    setIsReviewing(true);
    setError(null);
    try {
      const response = await desktop.jarvisGemini({
        model: localStorage.getItem("ev_brain_model") || "gemini-2.5-flash",
        body: { contents: [{ role: "user", parts: [{ text: reviewPrompt(nextInput) }] }], generationConfig: { responseMimeType: "application/json", temperature: 0.15 } },
        signal: controller.signal,
      });
      if (!response.ok || !response.body) throw new Error(response.error || `Deep Review failed (${response.status}).`);
      const deepReview = parseDeepReview(readGeminiText(response.body));
      setReport((current) => current && current.contentHash === nextInput.contentHash ? { ...current, aiReview: deepReview } : current);
    } catch (reviewError) {
      setError(reviewError instanceof Error ? reviewError.message : "Deep Review failed.");
    } finally {
      if (reviewControllerRef.current === controller) {
        reviewControllerRef.current = null;
        setIsReviewing(false);
      }
    }
  }, []);

  return {
    profile, setProfile, report, isAnalyzing, isReviewing, error,
    calibration, verifiedOutcomes, manualPosts,
    refresh: run, review, refreshCalibration, linkVerifiedPost,
  };
}
