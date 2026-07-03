// ═══ flowstate-cfo ═══
// HTTP proxy that exposes BeeBot's CFO tools to the FlowState UI.
// Uses the same executors (`cfo-strategy.ts`) and widget renderer (`widget-presets.ts`)
// so the CFO tab in FlowState renders the EXACT same widgets BeeBot shows in chat.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import {
  executeCfoCashflowForecast,
  executeCfoRunwayAnalysis,
  executeCfoUnitEconomics,
  executeCfoPnlSummary,
} from "../_shared/tool-executors/cfo-strategy.ts";
import { generatePresetHtml, suggestPresetHeight } from "../_shared/widget-presets.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type Tool = "cashflow_forecast" | "runway_analysis" | "unit_economics" | "pnl_summary";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "POST only" }), {
      status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const token = authHeader.replace("Bearer ", "");
    let userId: string | null = null;
    const anyAuth = userClient.auth as any;
    if (typeof anyAuth.getClaims === "function") {
      try {
        const { data: claims } = await anyAuth.getClaims(token);
        userId = claims?.claims?.sub ?? null;
      } catch {}
    }
    if (!userId) {
      const { data: u } = await userClient.auth.getUser(token);
      userId = u?.user?.id ?? null;
    }
    if (!userId) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({}));
    const tool = body?.tool as Tool;
    const args = (body?.args ?? {}) as Record<string, unknown>;

    // Service-role client to read finance tables (RLS bypass — userId is enforced in args)
    const serviceClient = createClient(
      supabaseUrl,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    let result: any;
    switch (tool) {
      case "cashflow_forecast":
        result = await executeCfoCashflowForecast(serviceClient, userId, args);
        break;
      case "runway_analysis":
        result = await executeCfoRunwayAnalysis(serviceClient, userId, args);
        break;
      case "unit_economics":
        result = executeCfoUnitEconomics(serviceClient, userId, args);
        break;
      case "pnl_summary":
        result = await executeCfoPnlSummary(serviceClient, userId, args);
        break;
      default:
        return new Response(JSON.stringify({ error: `Unknown tool: ${tool}` }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
    }

    // Render widget HTML so the FlowState UI can drop it into an iframe (parity with BeeBot)
    let html: string | null = null;
    let height = 400;
    if (result?.ok && result?.widget?.preset && result?.widget?.data) {
      try {
        html = generatePresetHtml(result.widget.preset, result.widget.data);
        const composite = ["dashboard", "flowchart", "mindmap", "sequence_diagram", "org_chart", "network_graph"].includes(result.widget.preset);
        const ceiling = composite ? 4000 : 1600;
        height = Math.min(Math.max(suggestPresetHeight(result.widget.preset, result.widget.data), 100), ceiling);
      } catch (e) {
        console.error("[flowstate-cfo] render failed", e);
      }
    }

    return new Response(JSON.stringify({ ...result, html, height }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[flowstate-cfo] error", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
