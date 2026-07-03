// ═══ render-widget ═══
// Lightweight endpoint that re-renders a dashboard payload after a user edits
// it in the Layout Builder. Pure server-side render via widget-presets.
// No DB writes, no auth-required state — just a render utility.

import { generatePresetHtml, suggestPresetHeight, validateDashboard } from "../_shared/widget-presets.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "POST only" }), { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
  try {
    const body = await req.json();
    const preset = String(body?.preset || "");
    const data = body?.data;
    const title = body?.title;
    if (!preset || !data || typeof data !== "object") {
      return new Response(JSON.stringify({ error: "preset + data required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    if (preset === "dashboard") {
      const v = validateDashboard(data);
      if (!v.ok) {
        return new Response(JSON.stringify({ error: "validation failed", section_errors: v.errors }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
    }
    const html = generatePresetHtml(preset, data);
    const composite = ["dashboard", "flowchart", "mindmap", "sequence_diagram", "org_chart", "network_graph"].includes(preset);
    const ceiling = composite ? 4000 : 1600;
    const height = Math.min(Math.max(suggestPresetHeight(preset, data), 100), ceiling);
    return new Response(JSON.stringify({ success: true, html, height, title: title ?? data?.title ?? "Widget", preset }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
