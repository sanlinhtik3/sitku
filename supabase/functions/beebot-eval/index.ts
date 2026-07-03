// ═══ BeeBot Eval Harness ═══
// Runs test suites against the Gemini API to validate reasoning effort,
// tool selection, and response quality across complexity tiers.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

import { GEMINI_OPENAI_ENDPOINT as GEMINI_ENDPOINT } from "../_shared/api-endpoints.ts";

// Reasoning effort mapping by complexity tier
const REASONING_MAP: Record<string, string | null> = {
  greeting: null,
  simple: null,
  turbo: "low",
  moderate: "medium",
  complex: "high",
  deep: "high",
  "ultra-deep": "high",
};

// Model selection by tier
const MODEL_MAP: Record<string, string> = {
  greeting: "gemini-3.1-flash-lite",
  simple: "gemini-3.1-flash-lite",
  turbo: "gemini-3.5-flash",
  moderate: "gemini-3.5-flash",
  complex: "gemini-3.1-pro-preview",
  deep: "gemini-3.1-pro-preview",
  "ultra-deep": "gemini-3.1-pro-preview",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Auth check — admin only
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const token = authHeader.replace("Bearer ", "");
    const { data: { user } } = await supabase.auth.getUser(token);
    if (!user) {
      return new Response(JSON.stringify({ error: "Invalid token" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check admin role
    const { data: roleData } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .eq("role", "admin")
      .maybeSingle();

    if (!roleData) {
      return new Response(JSON.stringify({ error: "Admin access required" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const { action, testIds, model: overrideModel, apiKey } = body;

    if (action === "list") {
      const { data: tests } = await supabase
        .from("agent_eval_tests")
        .select("*")
        .eq("is_active", true)
        .order("category", { ascending: true });
      return new Response(JSON.stringify({ tests: tests || [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "run") {
      // Get API key — prefer provided key, then system key
      let geminiKey = apiKey;
      if (!geminiKey) {
        const { data: settings } = await supabase
          .from("ai_model_settings")
          .select("google_system_api_key")
          .single();
        geminiKey = settings?.google_system_api_key;
      }

      if (!geminiKey) {
        return new Response(JSON.stringify({ error: "No API key available for eval" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Fetch test cases
      let query = supabase.from("agent_eval_tests").select("*").eq("is_active", true);
      if (testIds?.length) {
        query = query.in("id", testIds);
      }
      const { data: tests } = await query;

      if (!tests?.length) {
        return new Response(JSON.stringify({ error: "No test cases found" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const runId = crypto.randomUUID();
      const results: any[] = [];

      for (const test of tests) {
        const tier = test.complexity_tier || "moderate";
        const model = overrideModel || MODEL_MAP[tier] || "gemini-2.5-flash";
        const reasoningEffort = REASONING_MAP[tier] || null;

        const reqBody: any = {
          model,
          messages: [
            { role: "system", content: "You are BeeBot, an AI assistant. Respond helpfully and accurately." },
            { role: "user", content: test.input_message },
          ],
          max_tokens: 2048,
          temperature: 0.5,
        };

        if (reasoningEffort && model.includes("pro") && !model.includes("/")) {
          reqBody.reasoning = { effort: reasoningEffort };
          delete reqBody.temperature;
        }

        const startTime = Date.now();
        let passed = false;
        let qualityScore = 0;
        let toolsCalled: string[] = [];
        let responseSnippet = "";
        let tokensUsed = 0;

        try {
          const resp = await fetch(`${GEMINI_ENDPOINT}?key=${geminiKey}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(reqBody),
          });

          if (!resp.ok) {
            const errText = await resp.text();
            responseSnippet = `API Error ${resp.status}: ${errText.slice(0, 200)}`;
          } else {
            const data = await resp.json();
            const choice = data.choices?.[0];
            const content = choice?.message?.content || "";
            responseSnippet = content.slice(0, 500);
            tokensUsed = (data.usage?.total_tokens) || 0;

            // Check tool calls
            if (choice?.message?.tool_calls) {
              toolsCalled = choice.message.tool_calls.map((tc: any) =>
                tc.function?.name || "unknown"
              );
            }

            // Quality scoring
            const keywords = test.quality_keywords || [];
            if (keywords.length > 0) {
              const lowerContent = content.toLowerCase();
              const matchCount = keywords.filter((kw: string) =>
                lowerContent.includes(kw.toLowerCase())
              ).length;
              qualityScore = matchCount / keywords.length;
            } else {
              // No keywords = pass if we got a non-empty response
              qualityScore = content.length > 20 ? 1.0 : 0.3;
            }

            // Tool selection check
            const expectedTools = test.expected_tools || [];
            if (expectedTools.length > 0) {
              const toolMatchCount = expectedTools.filter((et: string) =>
                toolsCalled.includes(et)
              ).length;
              const toolScore = toolMatchCount / expectedTools.length;
              qualityScore = (qualityScore + toolScore) / 2;
            }

            passed = qualityScore >= (test.min_quality_score || 0.7);
          }
        } catch (err) {
          responseSnippet = `Error: ${err instanceof Error ? err.message : "Unknown"}`;
        }

        const latencyMs = Date.now() - startTime;

        const result = {
          test_id: test.id,
          model_used: model,
          reasoning_effort: reasoningEffort,
          passed,
          quality_score: Math.round(qualityScore * 100) / 100,
          tools_called: toolsCalled,
          response_snippet: responseSnippet,
          latency_ms: latencyMs,
          tokens_used: tokensUsed,
          run_id: runId,
        };

        results.push({
          ...result,
          test_category: test.category,
          test_input: test.input_message,
        });

        // Save to DB
        await supabase.from("agent_eval_results").insert(result);
      }

      const passCount = results.filter(r => r.passed).length;
      const summary = {
        run_id: runId,
        total: results.length,
        passed: passCount,
        failed: results.length - passCount,
        pass_rate: Math.round((passCount / results.length) * 100),
        avg_latency_ms: Math.round(results.reduce((s, r) => s + r.latency_ms, 0) / results.length),
        avg_quality: Math.round(results.reduce((s, r) => s + r.quality_score, 0) / results.length * 100) / 100,
        results,
      };

      return new Response(JSON.stringify(summary), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Invalid action. Use 'list' or 'run'" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[beebot-eval]", err);
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
