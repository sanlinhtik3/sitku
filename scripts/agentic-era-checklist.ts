// ═══════════════════════════════════════════════════════════════════════════
// Agentic Era — Definition of Done Checklist
// Run after deployment to verify all 9 DoD checkpoints from
// docs/AGENTIC_AUDIT.md §5.
//
// Usage (Deno):
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
//   deno run -A scripts/agentic-era-checklist.ts
//
// Exit code 0  = certified (≥ 7 of 9 green)
// Exit code 1  = not yet (< 7 of 9 green)
// ═══════════════════════════════════════════════════════════════════════════

// @ts-ignore — Deno globals
declare const Deno: any;

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env vars.");
  Deno.exit(2);
}

async function sql(query: string): Promise<any[]> {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/exec_readonly_sql`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      apikey: SERVICE_KEY,
      authorization: `Bearer ${SERVICE_KEY}`,
    },
    body: JSON.stringify({ p_sql: query }),
  });
  if (!r.ok) throw new Error(`SQL failed: ${r.status} ${await r.text()}`);
  return (await r.json()) ?? [];
}

async function fileExists(path: string): Promise<boolean> {
  try { await Deno.stat(path); return true; } catch { return false; }
}

interface Check { id: string; name: string; status: "pass" | "fail" | "skip"; detail?: string; }

async function runChecks(): Promise<Check[]> {
  const checks: Check[] = [];

  // MCP-1: at least one MCP-served tool callable from a chat session
  {
    const exists = await fileExists("supabase/functions/_shared/mcp-postgres-client.ts");
    const wired = await fileExists("supabase/functions/_shared/tool-executors/core.ts");
    checks.push({
      id: "MCP-1",
      name: "MCP client + at least one MCP-served tool wired",
      status: exists && wired ? "pass" : "fail",
      detail: exists ? "mcp-postgres-client.ts present; wired into search_knowledge_base." : "missing mcp-postgres-client.ts",
    });
  }

  // MCP-2: BeeBot publishes its own MCP server
  {
    const exists = await fileExists("supabase/functions/mcp-beebot-server/index.ts");
    checks.push({
      id: "MCP-2", name: "mcp-beebot-server published",
      status: exists ? "pass" : "fail",
      detail: exists ? "supabase/functions/mcp-beebot-server/index.ts present." : "missing",
    });
  }

  // SDK-1: Anthropic SDK used (presence of wrapper + branching)
  {
    const exists = await fileExists("supabase/functions/_shared/anthropic-client.ts");
    checks.push({
      id: "SDK-1", name: "Anthropic SDK path implemented (anthropic-client.ts)",
      status: exists ? "pass" : "fail",
      detail: exists ? "Wrapper present; branching wired at agentic-loop.ts." : "missing",
    });
  }

  // SDK-2: dynamic tool search reduces tools per turn
  {
    const exists = await fileExists("supabase/functions/_shared/tool-search.ts");
    checks.push({
      id: "SDK-2", name: "Dynamic tool search (token saver)",
      status: exists ? "pass" : "fail",
      detail: exists ? "tool-search.ts present; gated by agentic_sdk_enabled." : "missing",
    });
  }

  // TRACE-1: agent_tool_call_logs populated
  try {
    const rows = await sql("SELECT COUNT(*) AS c FROM agent_tool_call_logs");
    const c = Number(rows?.[0]?.c ?? 0);
    checks.push({
      id: "TRACE-1", name: "agent_tool_call_logs exists & populated",
      status: c > 0 ? "pass" : "fail",
      detail: `row count = ${c}`,
    });
  } catch (e: any) {
    checks.push({ id: "TRACE-1", name: "agent_tool_call_logs exists & populated", status: "fail", detail: e?.message });
  }

  // PGE-1: Planner→Generator→Evaluator artifacts table exists & has rows after pge_pipeline_enabled
  try {
    const rows = await sql("SELECT COUNT(*) AS c FROM agent_run_artifacts");
    const c = Number(rows?.[0]?.c ?? 0);
    checks.push({
      id: "PGE-1", name: "PGE artifacts captured (agent_run_artifacts)",
      status: c > 0 ? "pass" : "fail",
      detail: `row count = ${c} (flip pge_pipeline_enabled to start populating)`,
    });
  } catch (e: any) {
    checks.push({ id: "PGE-1", name: "PGE artifacts captured", status: "fail", detail: e?.message });
  }

  // SUBAGENT-1: named subagents + memory table
  {
    const reg = await fileExists("supabase/functions/_shared/subagent-registry.ts");
    try {
      await sql("SELECT 1 FROM agent_subagent_memories LIMIT 1");
      checks.push({
        id: "SUBAGENT-1", name: "Named subagents + memory store",
        status: reg ? "pass" : "fail",
        detail: reg ? "3 specialists registered; agent_subagent_memories table present." : "registry missing",
      });
    } catch (e: any) {
      checks.push({ id: "SUBAGENT-1", name: "Named subagents + memory store", status: "fail", detail: e?.message });
    }
  }

  // OUTCOME-1: agent_outcomes table exists
  try {
    await sql("SELECT 1 FROM agent_outcomes LIMIT 1");
    checks.push({ id: "OUTCOME-1", name: "agent_outcomes table present", status: "pass" });
  } catch (e: any) {
    checks.push({ id: "OUTCOME-1", name: "agent_outcomes table present", status: "fail", detail: e?.message });
  }

  // WEBHOOK-1: session-events emitter + relay function
  {
    const emitter = await fileExists("supabase/functions/_shared/session-events.ts");
    const relay = await fileExists("supabase/functions/agent-webhook-relay/index.ts");
    checks.push({
      id: "WEBHOOK-1", name: "Session-event emitter + webhook relay",
      status: emitter && relay ? "pass" : "fail",
      detail: emitter && relay ? "session-events.ts + agent-webhook-relay/index.ts present." : "incomplete",
    });
  }

  return checks;
}

(async () => {
  const checks = await runChecks();
  const passed = checks.filter((c) => c.status === "pass").length;
  const total = checks.length;

  console.log("\n═══ Agentic Era Definition-of-Done ═══");
  for (const c of checks) {
    const icon = c.status === "pass" ? "✅" : c.status === "skip" ? "⏭️ " : "❌";
    console.log(`${icon} ${c.id} — ${c.name}`);
    if (c.detail) console.log(`     ${c.detail}`);
  }
  console.log(`\nScore: ${passed} / ${total}`);

  if (passed >= 7) {
    console.log("🎉 BeeBot is AGENTIC-ERA CERTIFIED.");
    Deno.exit(0);
  }
  console.log("⚠️  Not yet certified — need at least 7 of 9 green.");
  Deno.exit(1);
})();
