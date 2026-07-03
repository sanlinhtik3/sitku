// Parity tests for the Headless Agent Runner.
//
// Goal: prove that scheduled "My Tasks" runs share the SAME brain surface as
// the interactive `agent-chat` brain. We don't call the live Lovable AI
// Gateway here — these are deterministic checks against the static modules
// the runner imports.

import { assertEquals, assert } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  BASE_TOOLS,
  AGENT_NETWORK_TOOLS,
  ADVANCED_AGENT_TOOLS,
  AGENTIC_CORE_TOOLS,
  SUPER_AGENT_TOOLS,
} from "./tool-definitions.ts";

function toolNames(arr: any[]): string[] {
  return arr.map((t) => t?.function?.name ?? t?.name).filter(Boolean);
}

Deno.test("headless runner: tool registry mirrors agent-chat standard surface", () => {
  // The runner composes [BASE, NETWORK, ADVANCED, AGENTIC_CORE]. This is the
  // standard non-super-admin surface — exactly what `agent-chat` exposes to
  // a regular user. We verify: (a) registry is non-empty, (b) >= 15 tools,
  // (c) no SUPER_* tools leak into the headless surface.
  const tools = [
    ...BASE_TOOLS,
    ...AGENT_NETWORK_TOOLS,
    ...ADVANCED_AGENT_TOOLS,
    ...AGENTIC_CORE_TOOLS,
  ];
  const names = toolNames(tools);
  assert(names.length >= 15, `expected ≥15 tools, got ${names.length}`);

  const superNames = new Set(toolNames(SUPER_AGENT_TOOLS));
  for (const n of names) {
    assert(!superNames.has(n), `SUPER tool leaked into headless surface: ${n}`);
  }
});

Deno.test("headless runner: critical tool families are present (parity with chat brain)", () => {
  const names = new Set(
    toolNames([...BASE_TOOLS, ...AGENT_NETWORK_TOOLS, ...ADVANCED_AGENT_TOOLS, ...AGENTIC_CORE_TOOLS]),
  );

  // Memory + identity — these power BeeBot's personalisation, the whole
  // reason the user wanted scheduled tasks to use the chat brain.
  const expectAny = [
    ["recall_episodic_memory", "search_episodic_memory", "recall_user_facts"],
    ["search_knowledge_base", "knowledge_base_search"],
    ["manage_flowstate"],
    ["manage_workspace_task"],
    ["update_agent_settings", "get_user_info"],
  ];
  for (const group of expectAny) {
    const hit = group.some((n) => names.has(n));
    assert(hit, `expected at least one of [${group.join(", ")}] in headless tool surface`);
  }
});

Deno.test("headless runner: tool definitions have OpenAI-compatible shape", () => {
  // The runner forwards tools directly to the Lovable AI Gateway, which
  // expects {type:'function', function:{name, parameters}} shape. A broken
  // tool definition would fail every heartbeat run with a 400.
  const all = [...BASE_TOOLS, ...AGENT_NETWORK_TOOLS, ...ADVANCED_AGENT_TOOLS, ...AGENTIC_CORE_TOOLS];
  for (const t of all) {
    assertEquals(t?.type, "function", `tool missing type:'function': ${JSON.stringify(t).slice(0, 120)}`);
    assert(typeof t?.function?.name === "string" && t.function.name.length > 0, "tool missing function.name");
    assert(t?.function?.parameters, `tool '${t.function.name}' missing parameters schema`);
  }
});

Deno.test("headless runner: module exports the runHeadlessAgent entry point", async () => {
  // Smoke-test the import surface so a typo or stale export would be caught
  // before we deploy a broken heartbeat.
  const mod = await import("./headless-agent-runner.ts");
  assertEquals(typeof mod.runHeadlessAgent, "function");
});
