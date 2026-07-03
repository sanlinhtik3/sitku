// Reproduction test for the Xi Jinping / "translate this news" failure case.
// Verifies that when the user supplies a literal source block, the builder:
//   1. Classifies as a verbatim intent (translate / forward / summarize_given)
//      via either the explicit override or the regex fallback.
//   2. Captures the source content after the `---` separator.
//   3. Produces a prompt that disables web search (freshness=none) and
//      injects the SOURCE CONTENT block verbatim.
//   4. Adds [NEGATIVE CONSTRAINTS] forbidding broadcast intros / fake sources.

import { assert, assertEquals, assertStringIncludes } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { buildAutomationPrompt } from "./automation-prompt-builder.ts";
import { evaluateQuality } from "./quality-gate.ts";

const REPRO_PROMPT = `ဒီအောက်က သတင်းကို channel ပေါ် ဘာသာပြန်ပြီး တင်လိုက်။
---
JUST IN: 🇨🇳 President Xi Jinping calls to boost measures to make China a technology powerhouse.`;

Deno.test("verbatim translate: explicit override forces no-search + source block", () => {
  const out = buildAutomationPrompt({
    displayName: "Translate news to channel",
    userPrompt: REPRO_PROMPT,
    runNumber: 1,
    scheduleKind: "one_off",
    nowLocal: "2026-05-01 10:00",
    timezone: "Asia/Yangon",
    lastStatus: null,
    lastSummary: null,
    lastRunLocal: null,
    priorRuns: [],
    deliveryTarget: "telegram",
    successCriteriaOverride: null,
    freshnessOverride: null,
    intentOverride: "translate",
  });

  assertEquals(out.intent, "translate");
  assertEquals(out.freshness, "none", "verbatim must not trigger web search");
  assert(out.sourceContent && out.sourceContent.includes("Xi Jinping"), "source content must be captured");
  assertStringIncludes(out.prompt, "SOURCE CONTENT");
  assertStringIncludes(out.prompt, "Xi Jinping");
  assertStringIncludes(out.prompt, "NEGATIVE CONSTRAINTS");
});

Deno.test("quality gate: penalises broadcast intro + fabricated sources on a translation", () => {
  const fakeOutput = `မိတ်ဆွေတို့ ရေ၊ ဒီနေ့ သတင်းတစ်ပုဒ်ကို မျှဝေပေးချင်ပါတယ်။

တရုတ်သမ္မတ ရှီကျင့်ဖျင်က နည်းပညာ powerhouse ဖြစ်အောင် တွန်းအားပေးခဲ့ပါသည်။

မူရင်းသတင်း: Reuters, Xinhua News Agency
https://example.com/fake-source-link`;

  const result = evaluateQuality({
    content: fakeOutput,
    intent: "translate",
    freshness: "none",
    priorRuns: [],
    usedSearchTool: false,
    usedDataTool: false,
    sourceContent: "JUST IN: 🇨🇳 President Xi Jinping calls to boost measures to make China a technology powerhouse.",
  });

  assert(!result.ok, `expected gate to fail, got score=${result.score} reasons=${result.reasons.join("|")}`);
  assert(
    result.flags.fabrication === true || result.reasons.some((r) => /fabric|intro|source/i.test(r)),
    `expected fabrication flag, got ${JSON.stringify(result)}`,
  );
});

Deno.test("verbatim translate: faithful short translation passes the gate", () => {
  const goodOutput = `🚨 JUST IN: တရုတ်သမ္မတ ရှီကျင့်ဖျင်က တရုတ်နိုင်ငံကို နည်းပညာ powerhouse တစ်ခု ဖြစ်လာအောင် တွန်းအားပေးမည့် အစီအမံများကို မြှင့်တင်ဖို့ တိုက်တွန်းခဲ့ပါသည်။ 🇨🇳`;

  const result = evaluateQuality({
    content: goodOutput,
    intent: "translate",
    freshness: "none",
    priorRuns: [],
    usedSearchTool: false,
    usedDataTool: false,
    sourceContent: "JUST IN: 🇨🇳 President Xi Jinping calls to boost measures to make China a technology powerhouse.",
  });

  assert(result.ok, `expected gate to pass, got score=${result.score} reasons=${result.reasons.join("|")}`);
});
