// ═══ MEMORY CURATOR EDGE FUNCTION ═══
// Quality gatekeeper for user memories. Called by agent-chat (manage_user_memory tool)
// and memory-worker (curate_candidate task type).

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { curateCandidate, type CandidateMemory } from "../_shared/curator-helpers.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface CurateRequest {
  user_id?: string;
  candidate?: CandidateMemory;
  pin_override?: boolean;
  scope?: "personal" | "telegram_group";
  scope_key?: string | null;
  source_platform?: string | null;
  source_actor?: string | null;
  /** When set to "interview", returns 5 tailored questions instead of curating. */
  mode?: "curate" | "interview";
}

// SOURCE OF TRUTH: user_memories.category CHECK constraint (9 categories).
// Must match: tool-definitions.ts manage_memory enum, tool-executors/core.ts VALID_MEMORY_CATEGORIES.
const ALL_TRAINING_CATEGORIES = [
  "preference",
  "work",
  "fact",
  "goals",
  "viz_preferences",
  "relationship",
  "opinion",
  "life_event",
  "custom",
] as const;

const CATEGORY_QUESTIONS: Record<string, string> = {
  preference:
    "သင် reply တွေကို ဘယ်လိုဖတ်ချင်လဲ — short & direct, detailed, bullet style, ဒါမှမဟုတ် insight-first ဖြစ်စေချင်လား?",
  work:
    "သင့်ရဲ့ profession / အလုပ်က ဘာလဲ? ပုံမှန် ရုံးချိန်နဲ့ အဓိက responsibilities ၂-၃ ခုလောက် ပြောပြပေးပါ။",
  fact:
    "သင့်နေ့စဉ် routine က ဘယ်လိုလဲ — wake/sleep, exercise, deep-work block တွေဘယ်အချိန်က ဘယ်အချိန်ထိ?",
  goals:
    "လာမယ့် ၁-၃ လအတွင်း သင်အောင်မြင်ချင်တဲ့ KPI / target ၂-၃ ခု ပြောပြပေးပါ (e.g. 'monthly revenue MMK 5M', 'weekly content 3 posts')။",
  viz_preferences:
    "Daily/weekly/monthly report တွေကို ဘယ်လို လိုချင်လဲ — chart types (bar/line/donut/KPI cards), tone (concise/detailed), နဲ့ daily digest လိုချင်တဲ့ အချိန် ပြောပြပါ။",
  relationship:
    "သင်နဲ့ နီးစပ်တဲ့ လူ ၂-၃ ယောက် (team, family, mentor) — သူတို့နာမည်နဲ့ သင်နဲ့ ဘယ်လို ဆက်စပ်လဲ?",
  opinion:
    "သင့်ရဲ့ ခိုင်မာတဲ့ opinion / belief တစ်ခု-နှစ်ခု ဘာရှိလဲ (e.g. 'short-form > long-form', 'morning deep-work က အရေးကြီးဆုံး')?",
  life_event:
    "လွန်ခဲ့တဲ့ ၆ လအတွင်း ဖြစ်ခဲ့တဲ့ အရေးကြီး life event ၁-၂ ခု (e.g. business launch, move, relationship change) ပြောပြပေးပါ။",
  custom:
    "BeeBot က သင့်အတွက် always သိထားသင့်တဲ့ custom rule / instruction တစ်ခု ရှိရင် ပြောပြပါ (e.g. 'ငါ့ကို formal မပြောနဲ့', 'currency က MMK သာ ပြ')။",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  try {
    const body = (await req.json()) as CurateRequest;

    // Resolve userId — prefer JWT, fallback to body for service-to-service calls
    let userId = body.user_id;
    const authHeader = req.headers.get("Authorization");
    if (authHeader?.startsWith("Bearer ")) {
      const token = authHeader.slice(7);
      try {
        const { data: { user } } = await supabase.auth.getUser(token);
        if (user?.id) userId = user.id;
      } catch { /* fall through */ }
    }

    if (!userId) {
      return new Response(
        JSON.stringify({ error: "user_id required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // ═══ INTERVIEW MODE — return tailored questions for empty categories ═══
    if (body.mode === "interview") {
      const { data: existing } = await supabase
        .from("user_memories")
        .select("category")
        .eq("user_id", userId)
        .eq("is_active", true);
      const filled = new Set((existing || []).map((r: any) => r.category));
      // Prioritize empty categories first; fill up to 5 questions.
      const empty = ALL_TRAINING_CATEGORIES.filter((c) => !filled.has(c));
      const filledArr = ALL_TRAINING_CATEGORIES.filter((c) => filled.has(c));
      const order = [...empty, ...filledArr].slice(0, 5);
      const questions = order.map((cat, i) => ({
        index: i + 1,
        category: cat,
        question: CATEGORY_QUESTIONS[cat],
        is_empty: !filled.has(cat),
      }));
      return new Response(
        JSON.stringify({
          mode: "interview",
          total_memories: (existing || []).length,
          empty_categories: empty,
          questions,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (!body.candidate?.content || !body.candidate?.category) {
      return new Response(
        JSON.stringify({ error: "candidate.content and candidate.category required for curate mode" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Resolve API key for LLM scoring (try personal, fallback to system)
    let apiKey = "";
    const { data: aiSettings } = await supabase
      .from("ai_user_settings")
      .select("gemini_api_key")
      .eq("user_id", userId)
      .maybeSingle();
    if (aiSettings?.gemini_api_key) apiKey = aiSettings.gemini_api_key;
    if (!apiKey) {
      apiKey = Deno.env.get("LOVABLE_API_KEY") || "";
    }

    const safeScope = body.scope === "telegram_group" ? "telegram_group" : "personal";
    const candidate = {
      ...body.candidate,
      scope: safeScope,
      scope_key: safeScope === "telegram_group" ? (body.scope_key || null) : null,
      source_platform: body.source_platform || null,
      source_actor: body.source_actor || null,
    };

    const result = await curateCandidate(supabase, userId, candidate, apiKey);

    // Log decision
    await supabase.from("curator_decisions").insert({
      user_id: userId,
      candidate_content: body.candidate.content.slice(0, 1000),
      candidate_category: body.candidate.category,
      decision: result.decision,
      reason: result.reason,
      matched_memory_id: result.matched_memory_id || null,
      curator_score: result.curator_score || null,
      source_session_id: body.candidate.source_session_id || null,
    });

    // If insert decision, persist new memory
    let memory_id: string | null = null;
    if (result.decision === "insert") {
      const shouldPin = body.pin_override === true || result.suggested_pin === true;
      const { data: inserted, error: insErr } = await supabase
        .from("user_memories")
        .insert({
          user_id: userId,
          content: result.normalized_content || body.candidate.content,
          category: body.candidate.category,
          confidence: result.curator_score || 0.6,
          curator_score: result.curator_score || null,
          curator_reason: result.reason,
          normalized_key: result.normalized_key || null,
          source_session_id: body.candidate.source_session_id || null,
          embedding: body.candidate.embedding || null,
          scope: candidate.scope,
          scope_key: candidate.scope_key,
          source_platform: candidate.source_platform,
          source_actor: candidate.source_actor,
          pinned: shouldPin,
          is_active: true,
        })
        .select("id")
        .single();
      if (insErr) {
        console.error("[Curator] insert failed:", insErr);
        return new Response(
          JSON.stringify({ ...result, error: insErr.message }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      memory_id = inserted.id;
    } else if (result.decision === "merge") {
      memory_id = result.matched_memory_id || null;
    }

    return new Response(
      JSON.stringify({ ...result, memory_id }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e: any) {
    console.error("[Curator] fatal:", e);
    return new Response(
      JSON.stringify({ error: e.message || "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
