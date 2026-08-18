import { describe, expect, it } from "vitest";
import { analyzeContent } from "../../src/features/content-signals/analyzeContent";
import { DEFAULT_CONTENT_PROFILE } from "../../src/features/content-signals/types";
import { calibrationForOutcomes } from "../../src/features/content-signals/contentReviewRepository";
import { parseDeepReview, reviewPrompt } from "../../src/features/content-signals/useContentSignals";

function report(content: string) {
  return analyzeContent({ content, contentHash: "test", profile: DEFAULT_CONTENT_PROFILE });
}

describe("content signals", () => {
  it("segments Burmese content and returns structured local signals", () => {
    const result = report("# ခေါင်းစဉ်\n\nဒီအကြောင်းအရာက ဘာကြောင့် အရေးကြီးတာလဲ။\n\nအချက်အလက် 42% နဲ့ source https://example.com ကိုကြည့်ပါ။\n\nနောက်ဆုံးမှာ အသုံးဝင်တဲ့ action တစ်ခုကို စတင်ပါ။");
    expect(result.meta.segments).toBeGreaterThan(2);
    expect(result.meta.paragraphs).toBe(3);
    expect(result.meta.words).toBeGreaterThan(4);
    expect(result.scores.find((item) => item.id === "evidence")?.status).toBe("good");
    expect(result.scores.find((item) => item.id === "hook")?.value).toBeGreaterThanOrEqual(70);
  });

  it("does not make a viral claim for a tiny draft", () => {
    const result = report("Idea");
    const viral = result.scores.find((item) => item.id === "viral_potential");
    expect(viral?.value).toBeNull();
    expect(viral?.status).toBe("needs_data");
  });

  it("handles Markdown structure without counting code blocks as prose", () => {
    const result = report("---\nplatform: facebook\n---\n# Title\n\n```ts\nconst ignored = true;\n```\n\nA useful claim with a source: [data](https://example.com).");
    expect(result.meta.headings).toBe(1);
    expect(result.meta.links).toBe(1);
    expect(result.meta.characters).toBeGreaterThan(15);
    expect(result.meta.words).toBeGreaterThan(4);
  });

  it("keeps recommendations focused to three or fewer actions", () => {
    const result = report("A very long dense paragraph ".repeat(30));
    expect(result.recommendations.length).toBeLessThanOrEqual(3);
  });

  it("excludes unrelated platform and format outcomes from calibration", () => {
    const outcomes = Array.from({ length: 12 }, (_, index) => ({
      id: String(index), notePath: "notes/a.md", contentHash: "hash", postId: `post-${index}`,
      platform: index < 9 ? "facebook" : "tiktok", format: index < 10 ? "post" : "script",
      verifiedAt: "2026-08-08T00:00:00.000Z",
    })) as const;
    const result = calibrationForOutcomes([...outcomes], { platform: "facebook", format: "post" });
    expect(result.linkedResults).toBe(9);
    expect(result.status).toBe("needs_data");
  });

  it("keeps confidence low until there are thirty verified outcomes", () => {
    const outcomes = Array.from({ length: 12 }, (_, index) => ({
      id: String(index), notePath: "notes/a.md", contentHash: "hash", postId: `post-${index}`,
      platform: "facebook" as const, format: "post" as const, verifiedAt: "2026-08-08T00:00:00.000Z",
    }));
    expect(calibrationForOutcomes(outcomes, { platform: "facebook", format: "post" }).confidence).toBe("low");
  });

  it("validates and normalizes the AI review contract used by dashboard metrics", () => {
    const scores = Object.fromEntries(
      ["readiness", "hook", "flow", "clarity", "retention", "evidence", "platformFit", "viralPotential"]
        .map((key, index) => [key, { value: index === 0 ? 114 : 60 + index, reason: `${key} reason`, paragraph: 1 }]),
    );
    const parsed = parseDeepReview(JSON.stringify({
      summary: "A concise summary.", verdict: "Useful draft with a weak opening.",
      strongest: "The conclusion is clear.", weakest: "The opening lacks tension.",
      strengths: ["Clear conclusion"], weaknesses: ["Weak hook"], scores,
      recommendations: [{ id: "hook", title: "Tighten the hook", detail: "Open with the consequence.", paragraph: 1 }],
    }));

    expect(parsed.scores).toHaveLength(8);
    expect(parsed.scores.find((score) => score.id === "readiness")?.value).toBe(100);
    expect(parsed.scores.find((score) => score.id === "platform_fit")?.summary).toBe("platformFit reason");
    expect(parsed.summary).toBe("A concise summary.");
  });

  it("rejects AI prose without metric evidence and asks for grounded scoring", () => {
    expect(() => parseDeepReview(JSON.stringify({ verdict: "Looks good" }))).toThrow(/validated scores/i);
    const prompt = reviewPrompt({ content: "Current note", contentHash: "hash", profile: DEFAULT_CONTENT_PROFILE });
    expect(prompt).toContain("never invent facts");
    expect(prompt).toContain("Viral potential is a heuristic");
    expect(prompt).toContain("Current note");
  });
});
