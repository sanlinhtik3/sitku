import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-webhook-secret",
};

// Allowed sources for webhook events
const ALLOWED_SOURCES = [
  "github", "stripe", "typeform", "zapier", "make", "ifttt",
  "slack", "discord", "notion", "linear", "jira", "custom",
];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    // --- Payload size check (10KB max) ---
    const contentLength = parseInt(req.headers.get("content-length") || "0");
    if (contentLength > 10240) {
      return new Response(JSON.stringify({ error: "Payload too large (max 10KB)" }), {
        status: 413, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // --- Extract webhook secret ---
    const webhookSecret = req.headers.get("x-webhook-secret");
    if (!webhookSecret) {
      return new Response(JSON.stringify({ error: "Missing X-Webhook-Secret header" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // --- Parse body ---
    const body = await req.json();
    const { source, event_type, title, data } = body;

    if (!source || !event_type) {
      return new Response(JSON.stringify({ error: "Missing required fields: source, event_type" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const normalizedSource = source.toLowerCase();
    if (!ALLOWED_SOURCES.includes(normalizedSource)) {
      return new Response(JSON.stringify({ error: `Unknown source: ${source}. Allowed: ${ALLOWED_SOURCES.join(", ")}` }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // --- Service-role client for cross-user lookups ---
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // --- Authenticate via webhook secret ---
    const { data: keyRow, error: keyErr } = await supabase
      .from("user_api_keys")
      .select("user_id")
      .eq("provider", "webhook_secret")
      .eq("api_key_encrypted", webhookSecret)
      .eq("is_active", true)
      .maybeSingle();

    if (keyErr || !keyRow) {
      return new Response(JSON.stringify({ error: "Invalid webhook secret" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userId = keyRow.user_id;

    // --- Rate limit: max 10 events per user per minute ---
    const oneMinAgo = new Date(Date.now() - 60_000).toISOString();
    const { count } = await supabase
      .from("agent_chat_messages")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("role", "system")
      .gte("created_at", oneMinAgo)
      .like("content", "[WEBHOOK EVENT]%");

    if ((count || 0) >= 10) {
      return new Response(JSON.stringify({ error: "Rate limit exceeded (max 10 events/minute)" }), {
        status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // --- Find user's active session ---
    const { data: session } = await supabase
      .from("agent_chat_sessions")
      .select("id")
      .eq("user_id", userId)
      .eq("is_active", true)
      .order("last_message_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    let sessionId = session?.id;

    // Create a session if none exists
    if (!sessionId) {
      const { data: newSession } = await supabase
        .from("agent_chat_sessions")
        .insert({ user_id: userId, title: "Webhook Events", is_active: true })
        .select("id")
        .single();
      sessionId = newSession?.id;
    }

    if (!sessionId) {
      return new Response(JSON.stringify({ error: "Could not resolve chat session" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // --- Build system message ---
    const detailsStr = data ? JSON.stringify(data).slice(0, 500) : "N/A";
    const messageContent = `[WEBHOOK EVENT] Source: ${normalizedSource} | Event: ${event_type}\nTitle: ${title || "N/A"}\nDetails: ${detailsStr}`;

    await supabase.from("agent_chat_messages").insert({
      session_id: sessionId,
      user_id: userId,
      role: "system",
      content: messageContent,
      source_channel: "webhook",
    });

    // --- Trigger event-type heartbeat if one exists ---
    const { data: heartbeat } = await supabase
      .from("agent_heartbeats")
      .select("id")
      .eq("user_id", userId)
      .eq("trigger_type", "event")
      .eq("is_active", true)
      .limit(1)
      .maybeSingle();

    if (heartbeat) {
      // Fire-and-forget heartbeat trigger
      try {
        await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/agent-heartbeat`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
          },
          body: JSON.stringify({ heartbeat_id: heartbeat.id }),
        });
      } catch (e) {
        console.warn("[webhook-receiver] Heartbeat trigger failed:", e);
      }
    }

    console.log(`[webhook-receiver] Event from ${normalizedSource}/${event_type} for user ${userId}`);

    return new Response(JSON.stringify({ received: true, session_id: sessionId }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err) {
    console.error("[webhook-receiver] Error:", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
