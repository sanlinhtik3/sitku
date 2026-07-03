// Regression test for the `show_widget` tool executor.
//
// History: a typo (`name` instead of `toolName`) inside the executor branch
// threw `ReferenceError: name is not defined` on every show_widget call,
// the retry wrapper swallowed it as `{ error: "name is not defined" }`, and
// the frontend silently dropped the widget because `result.success`/`html`
// were missing. These tests lock the contract the renderer relies on:
// `{ success: true, html: string, title: string, height: number }`.

import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { executeTool } from "../_shared/tool-executor.ts";

// Minimal stub Supabase client — show_widget never touches the DB on the
// happy path except a fire-and-forget `widget_snapshots` insert which we
// short-circuit. No userId is passed, so the persist branch is skipped.
const supabaseStub = {
  from() {
    return {
      insert: () => ({ then: (cb: any) => { cb?.(); return { catch: () => {} }; } }),
    };
  },
};

async function runShowWidget(args: any) {
  return await executeTool(supabaseStub as any, "" /* no userId → skip persist */, "show_widget", args);
}

Deno.test("show_widget: kpi_dashboard returns valid widget envelope", async () => {
  const res = await runShowWidget({
    title: "Page Growth",
    preset: "kpi_dashboard",
    auto_height: true,
    data: {
      kpis: [
        { label: "Followers", value: "15,420", delta: "+12.5%", trend: "up" },
        { label: "Engagement", value: "4.8%", delta: "+5.2%", trend: "up" },
      ],
    },
  });
  assertEquals(res.success, true, `expected success=true, got ${JSON.stringify(res)}`);
  assert(typeof res.html === "string" && res.html.length > 0, "html must be a non-empty string");
  assertEquals(res.title, "Page Growth");
  assert(typeof res.height === "number" && res.height > 0, "height must be a positive number");
  assertEquals(res.preset, "kpi_dashboard");
});

Deno.test("show_widget: missing preset auto-infers from data shape", async () => {
  const res = await runShowWidget({
    data: { kpis: [{ label: "Sales", value: "100" }] },
  });
  assertEquals(res.success, true, `expected success=true, got ${JSON.stringify(res)}`);
  assertEquals(res.preset, "kpi_dashboard", "should infer kpi_dashboard from {kpis}");
  assert(res.html?.length > 0);
  // Title auto-fills when omitted
  assert(typeof res.title === "string" && res.title.length > 0);
});

Deno.test("show_widget: compose_dashboard alias does NOT throw ReferenceError (regression)", async () => {
  // This is the exact path that used to throw `name is not defined`.
  // The bug returned {error: "name is not defined"} after 3 retries.
  // Now compose_dashboard must be recognized and either succeed or return
  // a structured error — never a bare ReferenceError.
  const res = await executeTool(
    supabaseStub as any,
    "",
    "compose_dashboard",
    { data: [{ label: "A", value: 1 }, { label: "B", value: 2 }], title: "Test" },
  );
  assert(
    res.error !== "name is not defined",
    `compose_dashboard must not throw ReferenceError. Got: ${JSON.stringify(res)}`,
  );
  // Either it composed successfully (success=true with html), or it returned
  // a structured guidance error — both are acceptable contracts.
  if (!res.success) {
    assert(typeof res.error === "string" && res.error.length > 0, "structured error required");
    assert(typeof res.action_needed === "string" || typeof res.guide === "string", "guidance required on failure");
  } else {
    assert(typeof res.html === "string" && res.html.length > 0);
  }
});

Deno.test("show_widget: non-object args never surface a ReferenceError", async () => {
  const res = await executeTool(
    supabaseStub as any,
    "",
    "show_widget",
    null,
  );
  assert(
    res.error !== "name is not defined",
    `show_widget must not leak ReferenceError for invalid args. Got: ${JSON.stringify(res)}`,
  );
  assert(typeof res.error === "string" && res.error.length > 0, "structured error required");
  assert(typeof res.action_needed === "string" && res.action_needed.length > 0, "action guidance required");
});

Deno.test("show_widget: invalid args return structured error, not silent success", async () => {
  const res = await runShowWidget({}); // no html, no preset, no data
  assertEquals(res.success, undefined, "must NOT report success when args are invalid");
  assert(typeof res.error === "string" && res.error.length > 0, "error message required");
  assert(typeof res.action_needed === "string" && res.action_needed.length > 0, "action_needed required");
  assert(res.example, "agent-facing example payload required");
});

Deno.test("show_widget: deterministic — identical args yield identical html", async () => {
  const args = {
    preset: "bar_chart",
    title: "Sales by Region",
    data: { labels: ["NA", "EU", "APAC"], values: [120, 85, 200] },
  };
  const a = await runShowWidget(args);
  const b = await runShowWidget(args);
  assertEquals(a.success, true);
  assertEquals(b.success, true);
  assertEquals(a.html, b.html, "same args must produce identical html (no nondeterminism)");
  assertEquals(a.title, b.title);
  assertEquals(a.preset, b.preset);
});
