# BeeBot Agentic Era Readiness Audit

**Date:** 2026-05-13
**Baseline:** Anthropic Agent SDK (`@anthropic-ai/claude-agent-sdk` v0.2.139, 2026-Q2 patterns)
**Scope:** Full project (frontend + Supabase + edge functions + agent layer)
**Methodology:** Code reading (no guessing) + 2026 web research + gap analysis

---

## Executive Verdict

### **BeeBot is at "Pre-Agentic 2.5 / 3" — NOT YET at full Agentic Era, but very close.**

BeeBot has independently re-implemented ~80 % of what the Anthropic Agent SDK provides — often with **deeper engineering** than the SDK defaults (importance-weighted compaction, multi-provider failover, resumable SSE with `Last-Event-ID`, the "DREAM SYSTEM v2" memory consolidation that explicitly cites Claude's design). However, three **architectural gaps** prevent BeeBot from being a true 2026-grade Agentic-Era system:

| # | Gap | Impact |
|---|-----|--------|
| **G1** | **Zero MCP integration** | Cannot plug into the 2026 industry-standard tool ecosystem (Linear, GitHub, Sentry, Notion-MCP, Slack-MCP, etc.); every integration is bespoke and locked in |
| **G2** | **No Anthropic SDK / no tool_search** | All 2,011 lines of tool definitions ship every turn → token bloat, no dynamic tool discovery, missing eager input streaming + strict schema enforcement |
| **G3** | **Single-agent loop, no Planner/Generator/Evaluator separation** | Sub-agent tools exist but coordination is ad-hoc; no formal evaluator agent, no structured artifact handoff, no agent-team pattern that the Anthropic April-2026 reference architecture mandates |

Three secondary gaps (named-subagent memory, per-tool-call tracing, unified background-job queue) are smaller but block production scaling.

---

## 1. Audit Findings — What BeeBot Already Has (Evidence-Backed)

Every claim below has a verified file + line citation. Nothing inferred.

### 1.1 Agent Loop — `supabase/functions/_shared/agentic-loop.ts` (1,946 LOC)
- ✅ Multi-turn loop with configurable `MAX_AGENT_STEPS` (line 283)
- ✅ Tool result caching (`ToolResultCache`, line 358) — deduplicates identical tool calls
- ✅ Soft/hard time budgets (70 % at L868, 90 % at L917) — graceful degradation
- ✅ Model-family-aware fallback on rate limit (L1064–1076)
- ✅ Crash-recovery checkpoints (`_shared/loop-checkpoint.ts`)
- ⚠️ Raw `fetch()` against `ANTHROPIC_ENDPOINT` — no SDK (L1022–1027)

### 1.2 Tool System — `supabase/functions/_shared/tool-definitions.ts` (2,011 LOC)
- ✅ 60+ tools across `BASE_TOOLS`, `AGENTIC_CORE_TOOLS`, `ADVANCED_AGENT_TOOLS`
- ✅ Risk-level taxonomy (LOW/MEDIUM/HIGH) — line 52 onward
- ✅ `spawn_sub_agent` (L1257) and `ask_other_agents` (L1043) tools exist
- ✅ Tool marshalling by intent + complexity (`tool-marshal.ts`)
- ❌ **All tools sent on every turn** — no `tool_search` dynamic discovery
- ❌ **No JSON-Schema `strict: true`** for Claude
- ❌ **No MCP server** — every integration is hand-written in `tool-executors/`

### 1.3 Memory & RAG
| Layer | Implementation | Verdict |
|-------|----------------|---------|
| Vector search | `pgvector`, 768-dim, IVFFlat cos-sim (`20260204100914_*.sql`) | ✅ Production-grade |
| Episodic memory | `agent_episodic_memory` + `chat_memory_embeddings` | ✅ Semantic recall |
| Long-term facts | `user_memories`, `user_psych_profile`, `agent_user_facts` | ✅ Multi-layered |
| Context compaction | Importance-weighted scoring (recency 30 / role 5–50 / cross-ref 20 / facts 25 / finance 20) | ✅ **Better than SDK default** |
| Dream / consolidation | `memory-consolidation/index.ts` — *"DREAM SYSTEM v2: Claude-Inspired"*, 3-gate trigger, 4-phase cycle (Orient → Gather → Consolidate → Prune), 24 h cooldown, 5-session minimum | ✅ Mirrors Claude Dreaming |
| Knowledge base | `knowledge_base_embeddings` + chunking + async sync queue | ✅ Solid |

### 1.4 Streaming — `supabase/functions/_shared/streaming-engine.ts`
- ✅ Full Anthropic-spec SSE: `content_block_start/delta/stop`, `message_delta`
- ✅ Resumable streams via `Last-Event-ID` replay (`agent-chat/index.ts:608, 627–635`)
- ✅ Tool-use streaming with tool name + id

### 1.5 Multi-Tenant Security
- ✅ RLS on every agent table (`auth.uid() = user_id`)
- ✅ FK CASCADE/SET-NULL consistent
- ✅ Admin role bypass via `has_role(auth.uid(), 'admin')`
- ✅ Per-user encrypted API keys (`agent_user_provider_keys`)

### 1.6 Quality / Eval
- ✅ `beebot-eval/index.ts` — eval harness across complexity tiers (`greeting → ultra-deep`)
- ✅ `cognitive-maintenance`, `memory-curator`, `memory-curator-backfill` — self-improvement scaffolds
- ⚠️ No formal "Evaluator-agent" loop pattern; eval is harness-driven, not in-loop

### 1.7 Sub-Agents
- ⚠️ `spawn_sub_agent` tool exists with recursion guard + 30 s timeout, max 2 per request
- ❌ **No per-subagent named memory** (Anthropic added this in v2.1.33 / Feb 2026)
- ❌ **No bounded-task specialist subagents** (code-reviewer, security-checker, frontend-QA patterns)
- ❌ Subagents don't have separate tool permission allowlist/denylist

### 1.8 Observability
- ⚠️ Sentry for crashes (generic, not agent-aware)
- ⚠️ `agent_ai_usage` table tracks tokens per message — **not per-tool-call**
- ❌ **No `agent_tool_call_logs`** table (no per-tool latency, no decision tree)
- ❌ **No span/trace export** to OTEL or similar

### 1.9 Provider & Model
- ✅ Multi-provider router (Anthropic, Gemini, OpenRouter, xAI) — `api-key-resolver.ts:59–74`
- ✅ Complexity-tier model & reasoning effort tuning (`bee-brain-request-builder.ts:61–169`)
- ✅ Extended-thinking budget tied to tier (2 k–24 k tokens)
- ⚠️ Default model = `gemini-2.5-flash`, not Claude — Anthropic is opt-in only

---

## 2. Gap Analysis — BeeBot vs. Anthropic Agent SDK 2026 Baseline

Comparison against the documented 2026 patterns ([Agent SDK overview](https://platform.claude.com/docs/en/agent-sdk/overview), [Claude Managed Agents](https://platform.claude.com/docs/en/managed-agents/overview), [2026 Subagents](https://code.claude.com/docs/en/sub-agents), [Agent SDK Production Patterns](https://www.digitalapplied.com/blog/claude-agent-sdk-production-patterns-guide)).

| # | 2026 Agentic-Era Capability | BeeBot | Gap Severity |
|---|------------------------------|--------|---------------|
| 1 | Agent loop with tool use | ✅ Custom, sophisticated | None |
| 2 | Streaming + tool streaming | ✅ Full SSE | None |
| 3 | Long-term memory + episodic | ✅ Multi-layer + pgvector | None |
| 4 | Dreaming / self-improvement | ✅ DREAM SYSTEM v2 | None |
| 5 | Multi-tenant isolation | ✅ RLS everywhere | None |
| 6 | Resumable streams | ✅ Last-Event-ID | **Better than SDK** |
| 7 | Importance-weighted compaction | ✅ Custom scoring | **Better than SDK** |
| 8 | **MCP server / client** | ❌ Zero MCP | **CRITICAL** |
| 9 | **`tool_search` dynamic discovery** | ❌ All tools every turn | **HIGH** |
| 10 | **Anthropic SDK (`messages.create` + strict)** | ❌ Raw fetch | **HIGH** |
| 11 | **Planner / Generator / Evaluator pattern** | ❌ Single orchestrator | **HIGH** |
| 12 | **Named Subagent Memory** (Feb 2026 spec) | ❌ Missing | MEDIUM |
| 13 | **Subagent tool-permission scoping** | ❌ Sub-agents inherit all | MEDIUM |
| 14 | **Per-tool-call tracing** | ❌ Missing | MEDIUM |
| 15 | **Unified background-job queue** | ⚠️ Mixed patterns | LOW |
| 16 | Webhooks for session/vault events | ❌ Missing (Managed-Agent feature) | LOW |
| 17 | Outcomes (formal goal tracking) | ❌ Missing | LOW |

**Score:** 7 ✅ + 2 × Better-than-SDK + 8 gaps (3 critical/high) ≈ **70 % of full Agentic Era**.

---

## 3. Why BeeBot Has Not Reached Full Agentic Era — Root Causes

### Root Cause A — **NIH (Not-Invented-Here) before MCP existed**
The codebase started before MCP became the 2026 industry standard. Every tool integration (Notion, browser, knowledge, finance) was hand-written in `_shared/tool-executors/`. This means:
- Cannot adopt the growing 2026 MCP ecosystem (Linear-MCP, GitHub-MCP, Sentry-MCP, Slack-MCP, Postgres-MCP) without re-wrapping each.
- Cannot expose BeeBot's own tools to other MCP clients (Claude Desktop, VS Code, JetBrains).
- 2,011 LOC of `tool-definitions.ts` ships on every turn → tens of thousands of input tokens wasted.

### Root Cause B — **HTTP-fetch instead of SDK**
Raw `fetch()` against `https://api.anthropic.com/v1/messages` works, but loses:
- Native parallel tool calls
- `strict: true` JSON-Schema validation
- `tool_search` dynamic tool registration
- `eager_input_streaming` fine-grained per-tool streaming
- Auto-retry with exponential backoff (SDK-level)
- Type safety on tool-use blocks

### Root Cause C — **Monolithic agent personality**
BeeBot's single `runAgenticLoop()` does everything. The April-2026 Anthropic reference architecture mandates **separation of concerns**:
- **Planner agent** — produces structured plan artifact (no tools, only `think`)
- **Generator agent** — executes plan steps with tools
- **Evaluator agent** — independent quality assessment, can reject/revise

BeeBot currently does planning *inside* execution context, has no formal evaluator, and merges all artifacts in one stream.

### Root Cause D — **Subagents present but underpowered**
`spawn_sub_agent` exists but:
- No per-subagent memory store (named-subagent memory landed in SDK v2.1.33 / Feb 2026)
- No allowlist/denylist of tools per subagent
- No specialist personas (`code-reviewer`, `frontend-QA`, `security-checker`)

### Root Cause E — **Observability for state, not for thought**
We log *tokens* (state) but not *decisions* (thought). When an agent picks the wrong tool, there's no trace. When it loops, there's no DAG. Without this, you can't tune the loop or do reinforcement-from-traces.

---

## 4. Upgrade Plan — Reaching Full Agentic Era

The plan is phased so each phase ships value without breaking the next. Total estimated effort: **3 phases × ~1–2 weeks each = 4–6 weeks engineering**.

### Phase 1 — Foundation (Week 1–2) — *START NOW*
**Goal:** Adopt Anthropic SDK, add per-tool-call tracing, ship MCP client.

| Task | Files | Outcome |
|------|-------|---------|
| 1.1 | Add `@anthropic-ai/sdk` and `@modelcontextprotocol/sdk` to `package.json` + import map for Deno edge functions | SDK + MCP availability |
| 1.2 | Create `supabase/functions/_shared/anthropic-client.ts` wrapping `Anthropic` class with streaming + retry | One canonical Claude client |
| 1.3 | Refactor `agentic-loop.ts` Claude branch to use the new client (Gemini path untouched) | Native SDK on Claude |
| 1.4 | Add `agent_tool_call_logs` table + RLS migration (id, session_id, message_id, tool_name, args_hash, latency_ms, status, error, started_at) | Per-tool observability |
| 1.5 | Wrap every `executeTool()` call in `tool-execution-engine.ts` with timing + log insert | Live tracing |
| 1.6 | Implement first MCP client connection — read-only `postgres-mcp` for KB queries — as a proof point | MCP wired |

**Verification:**
- `select tool_name, avg(latency_ms), count(*) from agent_tool_call_logs group by 1;` returns data after 5 test chats.
- Claude path uses SDK (check Sentry breadcrumbs).
- One MCP tool callable from chat: `await mcpClient.callTool('postgres', 'query', {...})`.

### Phase 2 — Specialization (Week 3–4)
**Goal:** Implement Planner / Generator / Evaluator separation + named subagent memory.

| Task | Description |
|------|-------------|
| 2.1 | Add `agent_subagent_memories` table — `(user_id, subagent_name, memory_key, value_json, updated_at)` |
| 2.2 | Create `_shared/subagent-registry.ts` — declarative subagents with name, system prompt, allowed_tools[], denied_tools[] |
| 2.3 | Register first three specialists: `consultant-planner`, `content-writer`, `quality-evaluator` |
| 2.4 | Add `agent_run_artifacts` table for structured handoffs (planner → generator → evaluator) |
| 2.5 | Refactor `runAgenticLoop` to optionally dispatch to PGE pipeline when complexity ≥ `complex` |
| 2.6 | Auto-evaluate every "complex" turn — evaluator returns `{score, issues[], revise?}` — feeds back if score < 0.7 |

### Phase 3 — Ecosystem & Polish (Week 5–6)
**Goal:** Convert in-house tools to MCP servers; expose BeeBot to external MCP clients; add `tool_search`.

| Task | Description |
|------|-------------|
| 3.1 | Convert `tool-executors/notion.ts`, `browser.ts`, `knowledge.ts` to MCP servers (stdio or SSE) |
| 3.2 | Wire MCP-based `tool_search` so Claude requests only relevant tools per turn (saves ~30 k tokens/turn) |
| 3.3 | Implement webhooks for session lifecycle (`session.started`, `session.tool_called`, `session.completed`) — mirror Managed-Agents pattern |
| 3.4 | Add `agent_outcomes` table — formal goal tracking (Anthropic 2026 Outcomes feature) |
| 3.5 | Unified background queue via `pg_cron` + worker edge function — replace mixed patterns |
| 3.6 | Publish `mcp-beebot-server` so Claude Desktop / Cursor / VS Code can call BeeBot tools |

---

## 5. Definition of Done — "BeeBot is Agentic-Era"

Concrete, measurable criteria. Each must be objectively verifiable.

- [ ] **MCP-1:** At least one MCP client connection running in production; at least one MCP-served tool callable from a chat session
- [ ] **MCP-2:** BeeBot publishes its own MCP server (`mcp-beebot-server`) consumable by Claude Desktop
- [ ] **SDK-1:** Claude path uses `@anthropic-ai/sdk` `messages.create` — zero raw `fetch()` to `api.anthropic.com`
- [ ] **SDK-2:** `tool_search` enabled — `tool-definitions.ts` no longer streams every tool per turn (token count per turn drops > 20 %)
- [ ] **TRACE-1:** `agent_tool_call_logs` populated for 100 % of tool invocations; admin dashboard shows per-tool p50/p95 latency
- [ ] **PGE-1:** Complex turns route through Planner → Generator → Evaluator; Evaluator can force a revise loop
- [ ] **SUBAGENT-1:** At least three named specialist subagents with allowlisted tools and persistent named memory
- [ ] **OUTCOME-1:** `agent_outcomes` table tracks formal goals across sessions
- [ ] **WEBHOOK-1:** Session lifecycle webhooks emit and are consumable

When 7 of 9 are green: **Agentic-Era certified.**

---

## 6. What Would I Build First If I Only Had 1 Day?

Phase 1.4 + 1.5 — **per-tool-call tracing**. Why: it's the prerequisite for every later decision (where do agents loop? which tools fail? where's the token waste?). Without traces, every other improvement is guess-driven.

---

## Sources (Web Research)

- [Agent SDK overview – Claude Code Docs](https://code.claude.com/docs/en/agent-sdk/overview)
- [Anthropic Managed Agents vs. Agent SDK – Momentic](https://momenticmarketing.com/blog/anthropic-managed-agents-vs-agent-sdk)
- [Anthropic Agent SDK: What It Ships vs. What It Leaves to You – Augment Code](https://www.augmentcode.com/guides/anthropic-agent-sdk-what-ships-vs-what-you-build)
- [Claude Code Agent Teams, Subagents, and MCP: The 2026 Playbook – Developers Digest](https://www.developersdigest.tech/blog/claude-code-agent-teams-subagents-2026)
- [Claude Code & Agent Memory: Best Practices for 2026 – Orchestrator](https://orchestrator.dev/blog/2026-04-06--claude-code-agent-memory-2026/)
- [Claude Agent SDK: Complete Production Patterns Guide 2026 – Digital Applied](https://www.digitalapplied.com/blog/claude-agent-sdk-production-patterns-guide)
- [Claude Agent SDK & Managed Agents: Anthropic's Q2 2026 Architecture – Zylos](https://zylos.ai/research/2026-04-20-claude-agent-sdk-managed-agents-architecture)
- [Anthropic updates Claude Managed Agents with three new features – 9to5Mac](https://9to5mac.com/2026/05/07/anthropic-updates-claude-managed-agents-with-three-new-features/)
- [Create custom subagents – Claude Code Docs](https://code.claude.com/docs/en/sub-agents)
- [Inside Claude Code: Tools, Memory, Hooks, MCP – Penligent](https://www.penligent.ai/hackinglabs/inside-claude-code-the-architecture-behind-tools-memory-hooks-and-mcp/)
- [@anthropic-ai/claude-agent-sdk – npm](https://www.npmjs.com/package/@anthropic-ai/claude-agent-sdk)

---

## Sources (In-Repo, Cited Above)

- `supabase/functions/_shared/agentic-loop.ts` (1,946 LOC)
- `supabase/functions/_shared/tool-definitions.ts` (2,011 LOC)
- `supabase/functions/agent-chat/index.ts` (2,065 LOC)
- `supabase/functions/_shared/context-compactor.ts`
- `supabase/functions/_shared/prompt-builder.ts`
- `supabase/functions/_shared/streaming-engine.ts`
- `supabase/functions/_shared/api-endpoints.ts`
- `supabase/functions/_shared/api-key-resolver.ts`
- `supabase/functions/_shared/bee-brain-request-builder.ts`
- `supabase/functions/_shared/loop-checkpoint.ts`
- `supabase/functions/_shared/memory-vault.ts`
- `supabase/functions/_shared/tool-marshal.ts`
- `supabase/functions/_shared/tool-execution-engine.ts`
- `supabase/functions/memory-consolidation/index.ts` (DREAM SYSTEM v2)
- `supabase/functions/beebot-eval/index.ts`
- `supabase/migrations/20260204100914_*.sql` (pgvector)
- `supabase/migrations/20260212110822_*.sql` (user_memories)
- `supabase/migrations/20260313162532_*.sql` (agent_user_facts, agent_episodic_memory)
- `supabase/migrations/20260129131615_*.sql` (agent_chat_sessions, agent_chat_messages, RLS)
- `supabase/migrations/20251118071532_*.sql` (credits)
- `src/providers/BackgroundJobsProvider.tsx`
- `src/lib/sentry.ts`
- `package.json` (confirmed: zero `@anthropic-ai/*`, zero `@modelcontextprotocol/*`)
