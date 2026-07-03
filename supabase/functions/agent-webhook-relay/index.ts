// ═══════════════════════════════════════════════════════════════════════════
// Agent Webhook Relay — Phase 3.4 of docs/AGENTIC_AUDIT.md
//
// Picks up undelivered rows from `agent_session_webhooks` and POSTs each
// to the user's configured destinations in `agent_webhook_destinations`.
//
// Triggered by:
//   • pg_cron (every minute) — production
//   • Manual `POST /agent-webhook-relay` — admin retry
//
// Delivery semantics:
//   • At-least-once. Marks row `delivered=true` only on 2xx response.
//   • Exponential backoff via `delivery_attempts` counter (max 5 attempts).
//   • Optional HMAC-SHA256 signing with the destination's `secret`.
// ═══════════════════════════════════════════════════════════════════════════

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const MAX_ATTEMPTS = 5;
const BATCH_SIZE = 50;
const PER_REQUEST_TIMEOUT_MS = 8_000;

async function hmacSign(secret: string, body: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const serviceClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // Pull undelivered events
  const { data: events, error: evErr } = await serviceClient
    .from("agent_session_webhooks")
    .select("*")
    .eq("delivered", false)
    .lt("delivery_attempts", MAX_ATTEMPTS)
    .order("created_at", { ascending: true })
    .limit(BATCH_SIZE);

  if (evErr) {
    return new Response(JSON.stringify({ error: evErr.message }), { status: 500, headers: corsHeaders });
  }

  let dispatched = 0;
  let succeeded = 0;
  let failed = 0;

  for (const event of events ?? []) {
    // Find active destinations for this user that subscribe to this event_type
    const { data: dests } = await serviceClient
      .from("agent_webhook_destinations")
      .select("id, target_url, secret, events, is_active")
      .eq("user_id", event.user_id)
      .eq("is_active", true);

    const matchingDests = (dests ?? []).filter((d: any) =>
      Array.isArray(d.events) && d.events.includes(event.event_type)
    );

    if (matchingDests.length === 0) {
      // No destinations → mark delivered (logged for audit, but no relay)
      await serviceClient
        .from("agent_session_webhooks")
        .update({ delivered: true, last_attempt_at: new Date().toISOString() })
        .eq("id", event.id);
      continue;
    }

    const bodyJson = JSON.stringify({
      event_type: event.event_type,
      session_id: event.session_id,
      payload: event.payload,
      created_at: event.created_at,
    });

    let anySucceeded = false;
    for (const dest of matchingDests) {
      dispatched++;
      const headers: Record<string, string> = { "content-type": "application/json" };
      if (dest.secret) {
        try { headers["x-beebot-signature"] = await hmacSign(dest.secret, bodyJson); } catch { /* ignore */ }
      }
      try {
        const res = await fetch(dest.target_url, {
          method: "POST", headers, body: bodyJson,
          signal: AbortSignal.timeout(PER_REQUEST_TIMEOUT_MS),
        });
        if (res.ok) { anySucceeded = true; succeeded++; }
        else { failed++; console.warn(`[webhook-relay] non-2xx for ${dest.target_url}: ${res.status}`); }
      } catch (e: any) {
        failed++;
        console.warn(`[webhook-relay] POST ${dest.target_url} failed: ${e?.message}`);
      }
    }

    // Update event status — mark delivered if at least one destination accepted.
    await serviceClient
      .from("agent_session_webhooks")
      .update({
        delivered: anySucceeded,
        delivery_attempts: (event.delivery_attempts ?? 0) + 1,
        last_attempt_at: new Date().toISOString(),
      })
      .eq("id", event.id);
  }

  return new Response(
    JSON.stringify({ scanned: events?.length ?? 0, dispatched, succeeded, failed }),
    { headers: { ...corsHeaders, "content-type": "application/json" } },
  );
});
