import type { SettingsRepository } from "@/repositories/contracts/settings";
import { consultantStore } from "@/repositories/local/consultantStore";
import type { ContentCalibration, ContentReviewRepository, ContentProfile, VerifiedContentOutcome } from "./types";

const OUTCOMES_KEY = "content-signals.verified-outcomes.v1";
const MINIMUM_RESULTS = 10;
const HIGH_CONFIDENCE_RESULTS = 30;

function outcomeId() {
  return globalThis.crypto?.randomUUID?.() || `outcome-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function normalizeOutcomes(value: unknown): VerifiedContentOutcome[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is VerifiedContentOutcome => {
    if (!item || typeof item !== "object") return false;
    const candidate = item as Partial<VerifiedContentOutcome>;
    return typeof candidate.id === "string"
      && typeof candidate.notePath === "string"
      && typeof candidate.contentHash === "string"
      && typeof candidate.postId === "string"
      && typeof candidate.platform === "string"
      && typeof candidate.format === "string"
      && typeof candidate.verifiedAt === "string";
  });
}

export function calibrationForOutcomes(
  outcomes: VerifiedContentOutcome[],
  profile: Pick<ContentProfile, "platform" | "format">,
): ContentCalibration {
  const linkedResults = outcomes.filter((item) => item.platform === profile.platform && item.format === profile.format).length;
  if (linkedResults < MINIMUM_RESULTS) {
    return {
      linkedResults,
      minimumResults: MINIMUM_RESULTS,
      confidence: "none",
      status: "needs_data",
      summary: `${Math.max(MINIMUM_RESULTS - linkedResults, 0)} more verified ${profile.platform} ${profile.format} results needed.`,
    };
  }
  return {
    linkedResults,
    minimumResults: MINIMUM_RESULTS,
    confidence: linkedResults >= HIGH_CONFIDENCE_RESULTS ? "high" : "low",
    status: linkedResults >= HIGH_CONFIDENCE_RESULTS ? "ready" : "calibrating",
    summary: linkedResults >= HIGH_CONFIDENCE_RESULTS
      ? `${linkedResults} verified outcomes calibrate this signal.`
      : `${linkedResults} verified outcomes; confidence stays low until ${HIGH_CONFIDENCE_RESULTS}.`,
  };
}

export function createContentReviewRepository(settings: SettingsRepository): ContentReviewRepository {
  const read = async () => normalizeOutcomes(await settings.get<unknown>(OUTCOMES_KEY));
  const write = async (items: VerifiedContentOutcome[]) => settings.set(OUTCOMES_KEY, items);

  return {
    async listVerifiedOutcomes(notePath) {
      return (await read()).filter((item) => item.notePath === notePath);
    },
    async linkVerifiedOutcome(input) {
      const posts = await consultantStore.listPosts();
      const post = posts.find((item) => item.id === input.postId);
      // Seeded/imported rows are never historical evidence. A CEO must add the post manually.
      if (!post || post.source !== "manual") throw new Error("Only a manually added Consultant post can be verified for calibration.");
      const items = await read();
      const existing = items.find((item) => item.notePath === input.notePath && item.postId === input.postId);
      if (existing) return existing;
      const item: VerifiedContentOutcome = { ...input, id: outcomeId(), verifiedAt: new Date().toISOString() };
      await write([...items, item]);
      return item;
    },
    async getCalibration(profile) {
      return calibrationForOutcomes(await read(), profile);
    },
  };
}

export function profileForOutcome(profile: ContentProfile) {
  return { platform: profile.platform, format: profile.format };
}
