import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { query, user_id } = await req.json();
    if (!query || !user_id) {
      return new Response(JSON.stringify({ error: "query and user_id required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Resolve personal API key for embedding
    const supabaseForKey = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );
    const { data: userSettings } = await supabaseForKey
      .from("ai_user_settings")
      .select("gemini_api_key")
      .eq("user_id", user_id)
      .maybeSingle();
    let geminiKey = userSettings?.gemini_api_key || null;
    if (!geminiKey) {
      const { data: sysSettings } = await supabaseForKey
        .from("ai_model_settings")
        .select("google_system_api_key")
        .maybeSingle();
      geminiKey = sysSettings?.google_system_api_key || null;
    }
    // Also check env vars as last resort
    if (!geminiKey) {
      geminiKey = Deno.env.get("GEMINI_API_KEY") || Deno.env.get("GOOGLE_API_KEY") || null;
    }
    
    let embedding: number[] | null = null;

    if (geminiKey) {
      const embRes = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent?key=${geminiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            model: "models/gemini-embedding-001",
            content: { parts: [{ text: query }] },
            outputDimensionality: 768,
          }),
        }
      );
      if (embRes.ok) {
        const embData = await embRes.json();
        embedding = embData.embedding?.values;
      }
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    if (embedding && embedding.length === 768) {
      // Vector search via RPC
      const { data, error } = await supabase.rpc("search_personal_knowledge", {
        p_user_id: user_id,
        p_query_embedding: JSON.stringify(embedding),
        p_match_count: 15,
        p_match_threshold: 0.3,
      });

      if (error) {
        console.error("RPC error:", error);
        throw error;
      }

      return new Response(JSON.stringify({ results: data || [], method: "semantic" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fallback: text search
    const { data, error } = await supabase
      .from("ai_generated_content")
      .select("id, title, content, category, tags, source_type, created_at")
      .eq("user_id", user_id)
      .eq("is_personal", true)
      .or(`title.ilike.%${query}%,content.ilike.%${query}%`)
      .order("created_at", { ascending: false })
      .limit(15);

    if (error) throw error;

    return new Response(JSON.stringify({ results: data || [], method: "text_fallback" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error("Search error:", e);
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
