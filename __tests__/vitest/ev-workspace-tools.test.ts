import { describe, expect, it, vi } from "vitest";
import { createEvWorkspaceToolRegistry } from "@/features/ev-voice/workspace/toolRegistry";
import { planWebSearch, webSearchPolicy } from "@/features/ev-voice/workspace/workspaceContext";
import type { WorkspaceTruthSnapshot } from "@/features/ev-voice/workspace/contracts";
import type { NotesRepository } from "@/repositories/contracts/notes";
import type { SearchRepository } from "@/repositories/contracts/search";
import type { EvOperatorAgent } from "@/features/ev-voice/operator";
import type { EvMemoryRepository } from "@/features/ev-voice/memory/contracts";

function snapshot(content = "# Active\n\nUnsaved draft wins.", hash = "hash-draft"): WorkspaceTruthSnapshot {
  return {
    snapshotId: `snapshot-${hash}`,
    capturedAt: "2026-08-08T00:00:00.000Z",
    room: "notes",
    vault: { name: "Test Vault", path: "/vault" },
    openFiles: [
      { path: "Active.md", title: "Active", active: true, split: false, dirty: true },
      { path: "Other.md", title: "Other", active: false, split: true, dirty: false },
    ],
    activeFile: {
      path: "Active.md",
      title: "Active",
      active: true,
      split: false,
      dirty: true,
      content,
      contentHash: hash,
      source: "editor-draft",
    },
  };
}

function repositories() {
  const notes = {
    listNotes: vi.fn(async () => [
      { path: "Active.md", title: "Active", content: "", contentHash: "saved-hash" },
      { path: "Other.md", title: "Other", content: "", contentHash: "other-hash" },
    ]),
    readNote: vi.fn(async (path: string) => path === "Other.md"
      ? { path, title: "Other", content: "Repository content", contentHash: "other-hash" }
      : { path, title: "Active", content: "Saved content", contentHash: "saved-hash" }),
  } as unknown as NotesRepository;
  const search = {
    search: vi.fn(async () => [{
      id: "result-1",
      source: "note" as const,
      title: "Related",
      path: "Related.md",
      snippet: "matching local evidence",
      score: 0.9,
    }]),
  } as unknown as SearchRepository;
  const operator = {
    run: vi.fn(async () => ({ status: "completed", result: "Grounded result" })),
  } as unknown as EvOperatorAgent;
  return { notes, search, operator };
}

describe("E.V workspace truth tools", () => {
  it("keeps concurrent background tool executions isolated", async () => {
    const deps = repositories();
    const pending = new Map<string, (value: { answer: string; sources: Array<{ title: string; url: string }> }) => void>();
    const webSearch = vi.fn((query: string, signal?: AbortSignal) => new Promise<{ answer: string; sources: Array<{ title: string; url: string }> }>((resolve, reject) => {
      pending.set(query, resolve);
      signal?.addEventListener("abort", () => reject(new DOMException("cancelled", "AbortError")), { once: true });
    }));
    const registry = createEvWorkspaceToolRegistry({ ...deps, capture: async () => snapshot(), webSearch });
    const context = (executionId: string) => ({
      userTranscript: "search the web for the latest result",
      executionId,
      interruptibility: "background" as const,
    });

    const first = registry.execute("web_search", { query: "latest alpha result" }, context("search-alpha"));
    const second = registry.execute("web_search", { query: "latest beta result" }, context("search-beta"));
    await vi.waitFor(() => expect(webSearch).toHaveBeenCalledTimes(2));
    pending.get("latest alpha result")?.({ answer: "Alpha", sources: [{ title: "Alpha", url: "https://example.com/alpha" }] });
    pending.get("latest beta result")?.({ answer: "Beta", sources: [{ title: "Beta", url: "https://example.com/beta" }] });

    await expect(first).resolves.toEqual(expect.objectContaining({ ok: true }));
    await expect(second).resolves.toEqual(expect.objectContaining({ ok: true }));
  });

  it("reports room, tab order, active and split metadata from one snapshot", async () => {
    const deps = repositories();
    const registry = createEvWorkspaceToolRegistry({ ...deps, capture: async () => snapshot() });
    const state = await registry.execute("workspace_get_state", {}, { userTranscript: "what is open" });
    const files = await registry.execute("workspace_list_open_files", {}, { userTranscript: "list open files" });

    expect(state).toEqual(expect.objectContaining({
      ok: true,
      data: expect.objectContaining({ room: "notes", openFileCount: 2, activeFile: expect.objectContaining({ path: "Active.md", dirty: true }) }),
      evidence: [expect.objectContaining({ snapshotId: "snapshot-hash-draft" })],
    }));
    expect(files).toEqual(expect.objectContaining({
      ok: true,
      data: expect.objectContaining({ files: [
        expect.objectContaining({ path: "Active.md", active: true }),
        expect.objectContaining({ path: "Other.md", split: true }),
      ] }),
    }));
  });

  it("reads the unsaved editor draft before repository content and supports full cursor traversal", async () => {
    const deps = repositories();
    const content = `# Active\n\n${"draft paragraph. ".repeat(220)}`;
    const registry = createEvWorkspaceToolRegistry({ ...deps, capture: async () => snapshot(content) });
    const first = await registry.execute("workspace_read_active_file", { cursor: 0 }, { userTranscript: "ဖိုင်အပြည့် ဖတ်ပြ" });
    expect(first).toEqual(expect.objectContaining({
      ok: true,
      data: expect.objectContaining({ source: "editor-draft", dirty: true, cursor: 0, hasMore: true }),
    }));
    if (!first.ok) throw new Error("expected read success");
    const firstData = first.data as { nextCursor: number; chunk: string };
    const second = await registry.execute("workspace_read_active_file", { cursor: firstData.nextCursor }, { userTranscript: "ဆက်ဖတ်" });
    expect(second).toEqual(expect.objectContaining({ ok: true, data: expect.objectContaining({ cursor: firstData.nextCursor }) }));
    expect(vi.mocked(deps.notes.readNote)).not.toHaveBeenCalled();
  });

  it("returns exact recovery when no workspace or active note exists", async () => {
    const deps = repositories();
    const noWorkspace = createEvWorkspaceToolRegistry({ ...deps, capture: async () => null });
    expect(await noWorkspace.execute("workspace_get_state", {}, { userTranscript: "state" })).toEqual(expect.objectContaining({
      ok: false,
      error: expect.objectContaining({ code: "NO_WORKSPACE_CONTEXT" }),
      recovery: expect.stringContaining("Open the Notes workspace"),
    }));
    const empty = createEvWorkspaceToolRegistry({
      ...deps,
      capture: async () => ({ ...snapshot(), activeFile: null, openFiles: [] }),
    });
    expect(await empty.execute("workspace_read_active_file", {}, { userTranscript: "read" })).toEqual(expect.objectContaining({
      ok: false,
      error: expect.objectContaining({ code: "NO_ACTIVE_FILE" }),
    }));
  });

  it("rejects a summary when the captured active content changes during analysis", async () => {
    const deps = repositories();
    let captureCount = 0;
    const registry = createEvWorkspaceToolRegistry({
      ...deps,
      capture: async () => captureCount++ === 0 ? snapshot("old", "hash-old") : snapshot("new", "hash-new"),
    });
    const result = await registry.execute("notes_summarize", {}, { userTranscript: "summarize current file" });
    expect(result).toEqual(expect.objectContaining({
      ok: false,
      error: expect.objectContaining({ code: "CONTENT_CHANGED" }),
      evidence: [expect.objectContaining({ contentHash: "hash-old" })],
    }));
    expect(vi.mocked(deps.operator.run)).toHaveBeenCalledWith(expect.objectContaining({
      request: expect.stringContaining("<workspace_evidence>"),
      persistedRequest: expect.not.stringContaining("<workspace_evidence>"),
    }));
  });

  it("uses web grounding only when the actual user transcript explicitly asks for it", async () => {
    const deps = repositories();
    const webSearch = vi.fn(async () => ({
      answer: "Verified online",
      sources: [{ title: "Primary source", url: "https://example.com/source" }],
    }));
    const registry = createEvWorkspaceToolRegistry({ ...deps, capture: async () => snapshot(), webSearch });
    await registry.execute("notes_fact_check", { query: "claim" }, { userTranscript: "check this claim" });
    expect(webSearch).not.toHaveBeenCalled();
    const online = await registry.execute("notes_fact_check", { query: "claim" }, { userTranscript: "check the latest on the web" });
    expect(webSearch).toHaveBeenCalledTimes(1);
    expect(online).toEqual(expect.objectContaining({
      ok: true,
      evidence: expect.arrayContaining([expect.objectContaining({ type: "web", url: "https://example.com/source" })]),
    }));
  });

  it("auto-allows inferred research and time-sensitive facts with citable Tavily evidence", async () => {
    const deps = repositories();
    const webSearch = vi.fn(async (query: string) => query.includes("independent comparison") ? ({
      answer: "Compared with independent evidence",
      sources: [
        { title: "Official specifications", url: "https://vendor.example/specs", snippet: "Current specifications" },
        { title: "Independent review", url: "https://review.example/test", snippet: "Independent camera test" },
        { title: "Battery benchmark", url: "https://benchmark.example/battery", snippet: "Measured battery result" },
      ],
    }) : ({
      answer: "Live verified result",
      sources: [{ title: "Official source", url: "https://example.com/live", snippet: "Current evidence" }],
    }));
    const registry = createEvWorkspaceToolRegistry({ ...deps, capture: async () => snapshot(), webSearch });

    const modelSelected = await registry.execute("web_search", { query: "storytelling advice from reputable writing sources" }, { userTranscript: "စာရေးနည်း ပြော" });
    expect(modelSelected).toEqual(expect.objectContaining({
      ok: true,
      data: expect.objectContaining({ trigger: "intent-inferred", sources: expect.any(Array) }),
    }));
    expect(webSearch).toHaveBeenCalledTimes(2);

    const researched = await registry.execute("web_search", { query: "best phone for video creators" }, { userTranscript: "video ရိုက်ဖို့ ဘယ် phone ကပိုကောင်းလဲ" });
    expect(researched).toEqual(expect.objectContaining({
      ok: true,
      data: expect.objectContaining({
        trigger: "intent-inferred",
        goal: "research-decision",
        attempts: 2,
        evidenceQuality: "sufficient",
        plan: expect.objectContaining({ searchDepth: "advanced", minimumSources: 3 }),
      }),
    }));
    expect(webSearch).toHaveBeenCalledTimes(4);

    const live = await registry.execute("web_search", { query: "BTC price", searchDepth: "advanced", maxResults: 50, topic: "finance", timeRange: "day" }, { userTranscript: "BTC price ပြော" });
    expect(webSearch).toHaveBeenLastCalledWith("BTC price", expect.any(AbortSignal), {
      searchDepth: "advanced",
      maxResults: 10,
      topic: "finance",
      timeRange: "day",
    });
    expect(live).toEqual(expect.objectContaining({
      ok: true,
      data: expect.objectContaining({ answer: "Live verified result" }),
      evidence: [expect.objectContaining({ type: "web", url: "https://example.com/live" })],
    }));
  });

  it("builds adaptive plans from the goal while keeping casual and local requests offline", () => {
    const recommendation = webSearchPolicy("video ရိုက်ဖို့ ဘယ် phone ပိုကောင်းလဲ");
    expect(recommendation).toEqual(expect.objectContaining({
      allowed: true,
      goal: "research-decision",
      confidence: expect.any(Number),
      signals: expect.arrayContaining(["research-decision"]),
    }));
    expect(planWebSearch("video ရိုက်ဖို့ ဘယ် phone ပိုကောင်းလဲ", "best creator phone", recommendation)).toEqual(expect.objectContaining({
      searchDepth: "advanced",
      maxResults: 8,
      minimumSources: 3,
      topic: "general",
    }));

    const weather = webSearchPolicy("မနက်ဖြန် မိုးရွာမလား");
    expect(planWebSearch("မနက်ဖြန် မိုးရွာမလား", "tomorrow weather", weather)).toEqual(expect.objectContaining({
      searchDepth: "basic",
      timeRange: "week",
      minimumSources: 1,
    }));
    expect(webSearchPolicy("စာရေးနည်း ပြော")).toEqual(expect.objectContaining({ allowed: false, goal: "conversation" }));
    expect(webSearchPolicy("ဒီ note ကို summarize လုပ်")).toEqual(expect.objectContaining({ allowed: false, goal: "local-workspace" }));
    expect(webSearchPolicy("I need a camera for low-light video")).toEqual(expect.objectContaining({
      allowed: true,
      goal: "research-decision",
      signals: expect.arrayContaining(["product-need"]),
    }));
    expect(webSearchPolicy("Which laptop should I choose for editing?")).toEqual(expect.objectContaining({
      allowed: true,
      signals: expect.arrayContaining(["selection-intent"]),
    }));
    expect(webSearchPolicy("ဒါဆို သွားရှာလိုက်")).toEqual(expect.objectContaining({
      allowed: true,
      reason: "explicit",
      signals: ["explicit-search-action"],
    }));
    expect(webSearchPolicy("အခု ChatGPT 5.0 က preview တွေ ထုတ်လို့ရပြီလား?")).toEqual(expect.objectContaining({
      allowed: true,
      signals: expect.arrayContaining(["current-technology"]),
    }));
  });

  it("allows an explicit search follow-up while keeping note searches local", async () => {
    const deps = repositories();
    const webSearch = vi.fn(async () => ({
      answer: "Current verified result",
      sources: [{ title: "Current source", url: "https://example.com/current" }],
    }));
    const registry = createEvWorkspaceToolRegistry({ ...deps, capture: async () => snapshot(), webSearch });

    const followUp = await registry.execute("web_search", { query: "current AI video editing tools" }, { userTranscript: "ဒါဆို သွားရှာလိုက်" });
    expect(followUp).toEqual(expect.objectContaining({ ok: true }));
    const callsAfterExplicitSearch = webSearch.mock.calls.length;

    const local = await registry.execute("web_search", { query: "active note" }, { userTranscript: "ဒီ note ထဲကအကြောင်း ရှာပေး" });
    expect(local).toEqual(expect.objectContaining({ ok: false, error: expect.objectContaining({ code: "PERMISSION_DENIED" }) }));
    expect(webSearch).toHaveBeenCalledTimes(callsAfterExplicitSearch);
  });

  it("does not auto-send local note questions to the web", async () => {
    const deps = repositories();
    const webSearch = vi.fn();
    const registry = createEvWorkspaceToolRegistry({ ...deps, capture: async () => snapshot(), webSearch });

    const result = await registry.execute("web_search", { query: "active note" }, { userTranscript: "လက်ရှိဖွင့်ထားတဲ့ note ထဲမှာ ဘာရေးထားလဲ" });
    expect(result).toEqual(expect.objectContaining({ ok: false, error: expect.objectContaining({ code: "PERMISSION_DENIED" }) }));
    expect(webSearch).not.toHaveBeenCalled();
  });

  it.each([
    ["မနက်ဖြန် မိုးရွာမလား", "tomorrow weather"],
    ["Liverpool ပွဲ ဘယ်နေ့လဲ", "Liverpool match schedule"],
  ])("auto-searches practical changing-data request: %s", async (transcript, query) => {
    const deps = repositories();
    const webSearch = vi.fn(async () => ({ answer: "Current result", sources: [{ title: "Source", url: "https://example.com/current" }] }));
    const registry = createEvWorkspaceToolRegistry({ ...deps, capture: async () => snapshot(), webSearch });

    const result = await registry.execute("web_search", { query }, { userTranscript: transcript });
    expect(result).toEqual(expect.objectContaining({ ok: true }));
    expect(webSearch).toHaveBeenCalledTimes(1);
  });

  it("blocks secret-like generated web queries before provider egress", async () => {
    const deps = repositories();
    const webSearch = vi.fn();
    const registry = createEvWorkspaceToolRegistry({ ...deps, capture: async () => snapshot(), webSearch });

    const result = await registry.execute("web_search", { query: "compare api_key=secret-value-123456789" }, { userTranscript: "ဒီ provider နှစ်ခု နှိုင်းယှဉ်ပေး" });
    expect(result).toEqual(expect.objectContaining({ ok: false, error: expect.objectContaining({ code: "PERMISSION_DENIED" }) }));
    expect(webSearch).not.toHaveBeenCalled();
  });

  it("recalls confirmed local memory only after an explicit user request", async () => {
    const deps = repositories();
    const memory = {
      listLongTermMemories: vi.fn(async () => [{
        id: "memory-1",
        kind: "preference" as const,
        content: "မြန်မာလို တိုတိုရှင်းရှင်း ဖြေပါ",
        status: "confirmed" as const,
        confidence: 1,
        importance: 0.9,
        contentHash: "memory-hash-1",
        createdAt: "2026-08-01T00:00:00.000Z",
        updatedAt: "2026-08-09T00:00:00.000Z",
      }]),
    } as unknown as EvMemoryRepository;
    const registry = createEvWorkspaceToolRegistry({ ...deps, capture: async () => snapshot(), memory });

    const result = await registry.execute("memory_recall", { query: "မြန်မာ" }, { userTranscript: "ငါ့အကြောင်း ဘာမှတ်ထားလဲ" });

    expect(result).toEqual(expect.objectContaining({
      ok: true,
      data: expect.objectContaining({ memories: [expect.objectContaining({ kind: "preference", evidenceId: "memory-memory-1" })] }),
      evidence: [expect.objectContaining({ type: "memory", contentHash: "memory-hash-1" })],
    }));
    expect(memory.listLongTermMemories).toHaveBeenCalledWith({ status: "confirmed", limit: 100 });
  });

  it("recognizes a Burmese request to pull previously stored system context", async () => {
    const deps = repositories();
    const memory = {
      listLongTermMemories: vi.fn(async () => [{
        id: "memory-2",
        kind: "fact" as const,
        content: "Mago is already configured in the system",
        status: "confirmed" as const,
        confidence: 1,
        importance: 0.8,
        contentHash: "memory-hash-2",
        createdAt: "2026-08-13T00:00:00.000Z",
        updatedAt: "2026-08-13T00:00:00.000Z",
      }]),
    } as unknown as EvMemoryRepository;
    const registry = createEvWorkspaceToolRegistry({ ...deps, capture: async () => snapshot(), memory });

    const result = await registry.execute(
      "memory_recall",
      { query: "Mago" },
      { userTranscript: "Mago ကို system ထဲမှာ ခုနက ထည့်သွင်းထားပြီးသား။ အဲ့ဒါ တစ်ချက် ပြန်ဆွဲလိုက်။" },
    );

    expect(result).toEqual(expect.objectContaining({ ok: true }));
    expect(memory.listLongTermMemories).toHaveBeenCalledTimes(1);
  });

  it("blocks implicit memory access before reading the repository", async () => {
    const deps = repositories();
    const memory = { listLongTermMemories: vi.fn() } as unknown as EvMemoryRepository;
    const registry = createEvWorkspaceToolRegistry({ ...deps, capture: async () => snapshot(), memory });

    const result = await registry.execute("memory_recall", { query: "preferences" }, { userTranscript: "ဒီစာကို ပိုကောင်းအောင်ရေး" });

    expect(result).toEqual(expect.objectContaining({ ok: false, error: expect.objectContaining({ code: "PERMISSION_DENIED" }) }));
    expect(memory.listLongTermMemories).not.toHaveBeenCalled();
  });
});
