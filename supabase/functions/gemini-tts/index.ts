import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await supabase.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userId = claimsData.claims.sub as string;
    const { text, model, voiceName, speakingStyle } = await req.json();

    if (!text || typeof text !== "string" || text.trim().length === 0) {
      return new Response(JSON.stringify({ error: "Text is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get API key: user's personal key first, then system key
    let apiKey: string | null = null;

    const { data: userSettings } = await supabase
      .from("ai_user_settings")
      .select("gemini_api_key")
      .eq("user_id", userId)
      .single();

    if (userSettings?.gemini_api_key) {
      apiKey = userSettings.gemini_api_key;
    }

    if (!apiKey) {
      const adminClient = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
      );
      const { data: modelSettings } = await adminClient
        .from("ai_model_settings")
        .select("google_system_api_key, system_api_key")
        .limit(1)
        .single();

      apiKey = modelSettings?.google_system_api_key || modelSettings?.system_api_key || null;
    }

    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: "No Gemini API key configured. Please add your API key in BeeBot settings." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Expressive speaking style prompts for natural human-like speech
    const stylePrompts: Record<string, string> = {
      warm: "Read this as if you're a real person talking to someone you care about. NOT like a robot or AI. Breathe naturally between phrases — leave tiny pauses where a human would take a breath. Let your voice rise slightly when asking questions, drop gently at the end of statements. Smile through your voice — the listener should feel your warmth and kindness. Pause briefly before emotional or important words to give them weight. Vary your speed naturally: slightly faster when excited or happy, slower when being thoughtful, comforting, or sharing something meaningful. Add subtle warmth to vowels. Sound like a caring friend sitting next to the listener.",
      professional: "Read this in a clear, confident, and authoritative tone — like a seasoned presenter or news anchor. NOT robotic or monotone. Maintain steady, measured pacing with natural breath pauses between sentences. Enunciate consonants crisply. Your pitch should be centered and stable, with subtle rises for emphasis and gentle drops at conclusions. Sound composed and trustworthy. Leave micro-pauses before key terms or numbers to let them land. Project competence and calm authority without sounding cold.",
      storyteller: "Read this like a master storyteller captivating an audience. NOT flat or mechanical. Use dramatic pacing — slow down before reveals, speed up during action or excitement. Let your voice drop low for suspense, rise for surprise or joy. Paint pictures with your tone. Pause dramatically before plot twists or important moments. Let emotions color every sentence — wonder, curiosity, tension, relief. Make the listener lean in. Breathe audibly between paragraphs as a natural storytelling rhythm. Each sentence should feel like it matters.",
      mentor: "Read this as a wise, deeply empathetic mentor — like a trusted teacher sharing life wisdom. NOT rushed or surface-level. Speak with genuine depth and patience. Pause thoughtfully before important points, as if carefully choosing your words. Your tone should convey both intelligence and heartfelt care. Slow down for profound insights. Let your voice warm up when encouraging, become steady and grounded when explaining. Sound like someone who has lived through experiences and wants to share what they've learned. Every pause should feel intentional, every word chosen with care.",
      energetic: "Read this with genuine enthusiasm and infectious energy — like someone sharing exciting news they can barely contain. NOT artificial or over-the-top. Use dynamic pitch variations: voice climbing with excitement, bouncing with positivity. Speed up naturally when building momentum, pause briefly for impact before big points. Sound upbeat, motivated, and inspiring. Let your energy be contagious but authentic — like a real person who is genuinely passionate about what they're saying. Smile broadly through your voice. Make the listener feel energized and motivated.",
    };

    const instruction = stylePrompts[speakingStyle as string] || stylePrompts.warm;
    const ttsPrompt = `${instruction}\n\nText to read:\n${text.trim()}`;

    const geminiModel = model || "gemini-2.5-flash-preview-tts";
    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent?key=${apiKey}`;
    const selectedVoice = voiceName || "Aoede";

    // Retry up to 2 times for transient 500 errors
    let geminiResponse: Response | null = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      geminiResponse = await fetch(geminiUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: ttsPrompt }] }],
          generationConfig: {
            response_modalities: ["AUDIO"],
            speechConfig: {
              voiceConfig: {
                prebuiltVoiceConfig: { voiceName: selectedVoice },
              },
            },
          },
        }),
      });

      if (geminiResponse.ok || geminiResponse.status !== 500) break;
      console.warn(`Gemini API 500, retry ${attempt + 1}/3...`);
      if (attempt < 2) await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
    }

    if (!geminiResponse!.ok) {
      const errText = await geminiResponse!.text();
      console.error("Gemini API error:", geminiResponse!.status, errText);

      // Surface actual Google error detail to user
      let detail = `Gemini API error: ${geminiResponse!.status}`;
      try {
        const errJson = JSON.parse(errText);
        if (errJson?.error?.message) {
          detail = errJson.error.message;
        }
      } catch { /* use default detail */ }

      return new Response(
        JSON.stringify({ error: detail }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const result = await geminiResponse!.json();
    const audioPart = result?.candidates?.[0]?.content?.parts?.find(
      (p: any) => p.inlineData?.mimeType?.startsWith("audio/")
    );

    if (!audioPart) {
      console.error("No audio in Gemini response:", JSON.stringify(result).slice(0, 500));
      return new Response(
        JSON.stringify({ error: "No audio generated. The model may not support audio for this input." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({
        audioContent: audioPart.inlineData.data,
        mimeType: audioPart.inlineData.mimeType,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("gemini-tts error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
