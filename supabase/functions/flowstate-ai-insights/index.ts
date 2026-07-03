import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { callAIWithFallback } from "../_shared/model-fallback-caller.ts";
import { loadSubsystemConfig } from "../_shared/subsystem-config.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface Stats {
  incomeThisMonth: number;
  expensesThisMonth: number;
  netBalance: number;
  totalBalance: number;
  subscriptionsMonthly: number;
}

interface Transaction {
  type: string;
  amount: number;
  category: string | null;
  date: string;
  description: string | null;
}

interface CategoryBreakdown {
  category: string;
  amount: number;
  percentage: number;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { type, stats, transactions, categoryBreakdown, currency, message, chatHistory } = await req.json();

    // Resolve personal API key from auth
    const authHeader = req.headers.get("authorization");
    if (!authHeader) {
      throw new Error("Authorization required");
    }
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

    const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2");
    const userSupabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user } } = await userSupabase.auth.getUser();
    if (!user) throw new Error("Unauthorized");

    const serviceSupabase = createClient(supabaseUrl, supabaseServiceKey);
    const { data: userSettings } = await serviceSupabase
      .from("ai_user_settings")
      .select("gemini_api_key")
      .eq("user_id", user.id)
      .maybeSingle();
    let systemGoogleKey: string | null = null;
    if (!userSettings?.gemini_api_key) {
      const { data: sysSettings } = await serviceSupabase
        .from("ai_model_settings")
        .select("google_system_api_key")
        .maybeSingle();
      systemGoogleKey = sysSettings?.google_system_api_key || null;
    }

    // ═══ Resolve subsystem-level override (provider + model + key) ═══
    const subCfg = await loadSubsystemConfig(serviceSupabase, user.id, "flowstate", {
      google: systemGoogleKey,
    });
    const personalKey = subCfg.apiKey;
    const flowstateModel = subCfg.model;
    if (!personalKey) {
      throw new Error("AI key required — please add your Gemini or Claude API key in Profile → AI Models");
    }

    if (type === "analyze") {
      // Analyze spending patterns and generate insights
      const systemPrompt = `You are an expert AI personal finance manager. Analyze the user's financial data and provide actionable insights.

User's Financial Summary (${currency}):
- Income This Month: ${stats.incomeThisMonth.toLocaleString()}
- Expenses This Month: ${stats.expensesThisMonth.toLocaleString()}
- Net Balance: ${stats.netBalance.toLocaleString()}
- Total Account Balance: ${stats.totalBalance.toLocaleString()}
- Monthly Subscriptions: ${stats.subscriptionsMonthly.toLocaleString()}

Top Expense Categories:
${categoryBreakdown.slice(0, 5).map((c: CategoryBreakdown) => `- ${c.category}: ${c.amount.toLocaleString()} (${c.percentage.toFixed(1)}%)`).join("\n")}

Recent Transactions (last 50):
${transactions.slice(0, 20).map((t: Transaction) => `- ${t.type}: ${t.amount} ${currency} - ${t.category || "Uncategorized"}`).join("\n")}`;

      const analyzeResult = await callAIWithFallback({
        apiKey: personalKey,
        apiEndpoint: subCfg.apiEndpoint,
        model: flowstateModel,
        messages: [
          { role: "system", content: systemPrompt },
          {
            role: "user",
            content: `Analyze this financial data and return a JSON response with the following structure:
{
  "insights": [
    { "type": "warning|success|tip|prediction", "title": "Short title", "description": "Detailed explanation" }
  ],
  "budgetRecommendation": number (suggested monthly budget in ${currency}),
  "savingsPrediction": number (projected yearly savings based on current patterns),
  "monthlyForecast": number (predicted expenses for next month)
}

Provide 3-5 insights covering:
1. Spending patterns and anomalies
2. Categories where user can save money
3. Positive financial habits to continue
4. Predictions based on trends

Be specific with numbers and percentages. Keep insights actionable and concise.`,
          },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "financial_analysis",
              description: "Return structured financial analysis",
              parameters: {
                type: "object",
                properties: {
                  insights: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        type: { type: "string", enum: ["warning", "success", "tip", "prediction"] },
                        title: { type: "string" },
                        description: { type: "string" },
                      },
                      required: ["type", "title", "description"],
                    },
                  },
                  budgetRecommendation: { type: "number" },
                  savingsPrediction: { type: "number" },
                  monthlyForecast: { type: "number" },
                },
                required: ["insights", "budgetRecommendation", "savingsPrediction", "monthlyForecast"],
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "financial_analysis" } },
      });

      if (analyzeResult.fallbackUsed) {
        console.log(`[FlowState] Used fallback model: ${analyzeResult.modelUsed}`);
      }

      const data = analyzeResult.data;
      
      // Extract tool call result
      const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
      if (toolCall?.function?.arguments) {
        const result = JSON.parse(toolCall.function.arguments);
        return new Response(JSON.stringify(result), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Fallback: try to parse from content
      const content = data.choices?.[0]?.message?.content || "";
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const result = JSON.parse(jsonMatch[0]);
        return new Response(JSON.stringify(result), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      throw new Error("Failed to parse AI response");

    } else if (type === "chat") {
      // Handle chat messages
      const systemPrompt = `You are an AI personal finance advisor for FlowState app. 
The user's current financial status (${currency}):
- Monthly Income: ${stats.incomeThisMonth.toLocaleString()}
- Monthly Expenses: ${stats.expensesThisMonth.toLocaleString()}
- Net Balance: ${stats.netBalance.toLocaleString()}
- Total Balance: ${stats.totalBalance.toLocaleString()}

Top spending categories:
${categoryBreakdown.slice(0, 5).map((c: CategoryBreakdown) => `- ${c.category}: ${c.percentage.toFixed(1)}%`).join("\n")}

Provide helpful, actionable financial advice. Be concise but thorough. Use specific numbers when relevant.`;

      const chatMessages = [
        { role: "system", content: systemPrompt },
        ...chatHistory.map((m: { role: string; content: string }) => ({
          role: m.role,
          content: m.content,
        })),
        { role: "user", content: message },
      ];

      const chatResult = await callAIWithFallback({
        apiKey: personalKey,
        apiEndpoint: subCfg.apiEndpoint,
        model: flowstateModel,
        messages: chatMessages,
      });

      const responseText = chatResult.data.choices?.[0]?.message?.content || "I'm sorry, I couldn't generate a response.";

      return new Response(JSON.stringify({ response: responseText }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Invalid request type" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error: unknown) {
    console.error("Error in flowstate-ai-insights:", error);
    const errMsg = error instanceof Error ? error.message : "Internal server error";
    return new Response(JSON.stringify({ error: errMsg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
