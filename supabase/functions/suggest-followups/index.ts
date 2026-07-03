import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const SYSTEM_PROMPT = `You generate follow-up question suggestions for a conversational AI assistant.

Given the assistant's last response, output exactly 3 short follow-up questions the user would naturally ask next.

Rules:
- Be SPECIFIC to the content mentioned (names, numbers, topics, data points)
- Mix Myanmar and English naturally (like "BTC ဈေးနှုန်း ဘာလို့ကျတာလဲ?")
- Each question must be under 50 characters
- If the response mentions real-world data (prices, news, events, balances), suggest a follow-up that digs deeper into that specific data
- Never produce generic questions like "ပိုပြောပြပေး" or "ဘာလဲ"
- Output ONLY a JSON array of 3 strings, nothing else

Example output: ["BTC $108K ကျတဲ့ အကြောင်းရင်း ဘာလဲ?","ETH ဈေးနှုန်းရော ဘယ်လိုလဲ?","ဒီအပတ် market trend ဘယ်လိုရှိလဲ?"]`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { content } = await req.json();
    if (!content || typeof content !== "string" || content.length < 20) {
      return new Response(
        JSON.stringify({ suggestions: [] }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Resolve API key: try system key first, then fall back
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    let apiKey: string | null = null;

    // Try system API key from ai_model_settings
    const { data: modelSettings } = await supabase
      .from("ai_model_settings")
      .select("google_system_api_key, system_api_key")
      .limit(1)
      .single();

    apiKey =
      modelSettings?.google_system_api_key ||
      modelSettings?.system_api_key ||
      null;

    if (!apiKey) {
      return new Response(
        JSON.stringify({ suggestions: [] }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const truncated = content.slice(0, 600);

    let geminiRes: Response;
    try {
      geminiRes = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${apiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [
              { role: "user", parts: [{ text: truncated }] },
            ],
            systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
            generationConfig: {
              temperature: 0.9,
              maxOutputTokens: 120,
              responseMimeType: "application/json",
            },
          }),
          signal: AbortSignal.timeout(5000),
        },
      );
    } catch (fetchErr) {
      console.warn("suggest-followups fetch timeout/error:", fetchErr);
      return new Response(
        JSON.stringify({ suggestions: [] }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (!geminiRes.ok) {
      if (geminiRes.status === 429) {
        console.warn("suggest-followups: rate limited (429), skipping");
      } else {
        console.error("Gemini error:", geminiRes.status, await geminiRes.text());
      }
      return new Response(
        JSON.stringify({ suggestions: [] }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const geminiData = await geminiRes.json();
    const rawText =
      geminiData?.candidates?.[0]?.content?.parts?.[0]?.text || "[]";

    let suggestions: string[] = [];
    try {
      const parsed = JSON.parse(rawText);
      if (Array.isArray(parsed)) {
        suggestions = parsed
          .slice(0, 3)
          .map((s: unknown) => (typeof s === "string" ? s.trim() : ""))
          .filter((s: string) => s.length > 0 && s.length <= 60);
      }
    } catch {
      // Parse failure — return empty
    }

    return new Response(
      JSON.stringify({ suggestions }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("suggest-followups error:", err);
    return new Response(
      JSON.stringify({ suggestions: [] }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
