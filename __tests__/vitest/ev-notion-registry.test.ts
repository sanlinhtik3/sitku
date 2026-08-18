import { afterEach, describe, expect, it, vi } from "vitest";
import { createEvNotionToolRegistry } from "@/features/ev-voice/notion/notionRegistry";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("E.V Notion capability adapter", () => {
  it("keeps reads automatic and previews every write for approval", async () => {
    const registry = createEvNotionToolRegistry();
    await expect(registry.preview("notion_search", { query: "roadmap" }, { userTranscript: "search Notion" })).resolves.toBeNull();
    await expect(registry.preview("notion_create_pages", { arguments: { parent_id: "page-1" } }, { userTranscript: "create it" }))
      .resolves.toEqual(expect.objectContaining({ ok: true, requiresConfirmation: true }));
  });

  it("uses discovered tools and returns Notion evidence", async () => {
    vi.stubGlobal("window", { beebotDesktop: {
      notionMcpListTools: vi.fn(async () => ({
        tools: [{ name: "notion-search", normalizedName: "notion_search", description: "", inputSchema: {}, policy: "read" as const }],
        unsupportedCount: 0,
      })),
      notionMcpCallTool: vi.fn(async () => ({
        ok: true,
        data: { title: "Roadmap" },
        summary: "Roadmap",
        requestId: "request-1",
        policy: "read" as const,
        evidence: [{ id: "notion:id:page-1", notionId: "page-1", capturedAt: "2026-08-13T00:00:00.000Z" }],
      })),
    } });
    const registry = createEvNotionToolRegistry();
    await expect(registry.execute("notion_search", { query: "roadmap" }, { userTranscript: "search Notion" }))
      .resolves.toEqual(expect.objectContaining({
        ok: true,
        evidence: [expect.objectContaining({ type: "notion", notionId: "page-1" })],
      }));
  });

  it("fails honestly outside the Electron secure bridge", async () => {
    vi.stubGlobal("window", {});
    const registry = createEvNotionToolRegistry();
    await expect(registry.execute("notion_search", { query: "roadmap" }, { userTranscript: "search Notion" }))
      .resolves.toEqual(expect.objectContaining({ ok: false, error: expect.objectContaining({ code: "NOTION_DISCONNECTED" }) }));
  });
});
