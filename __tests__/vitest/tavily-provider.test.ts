import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createTavilyProvider } from "../../electron/tavily-provider.mjs";

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

function setup(fetchImpl: typeof fetch, sleepImpl = async () => {}) {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "sitku-tavily-"));
  roots.push(rootDir);
  const safeStorage = {
    isEncryptionAvailable: () => true,
    encryptString: (value: string) => Buffer.from(value, "utf8"),
    decryptString: (value: Buffer) => value.toString("utf8"),
  };
  const auditPath = path.join(rootDir, "audit.jsonl");
  return { provider: createTavilyProvider({ rootDir, safeStorage, fetchImpl, auditPath, sleepImpl }), auditPath };
}

describe("Tavily desktop provider", () => {
  it("encrypts one system key and validates it with bearer auth before use", async () => {
    const fetchImpl = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      expect(new Headers(init?.headers).get("Authorization")).toBe("Bearer tvly-test-secure-key");
      return new Response(JSON.stringify({ key: { usage: 1, limit: 1000 } }), { status: 200 });
    }) as unknown as typeof fetch;
    const { provider } = setup(fetchImpl);
    expect(provider.hasKey()).toBe(false);
    provider.setKey("tvly-test-secure-key");
    expect(provider.hasKey()).toBe(true);
    await expect(provider.test()).resolves.toEqual(expect.objectContaining({ ok: true }));
  });

  it("bounds search output, records safe audit metadata, and never logs the key or raw query", async () => {
    const fetchImpl = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body || "{}"));
      expect(body.max_results).toBe(10);
      expect(body.search_depth).toBe("advanced");
      expect(body.topic).toBe("finance");
      expect(body.time_range).toBe("day");
      expect(body.include_raw_content).toBe(false);
      return new Response(JSON.stringify({
        answer: "Verified answer",
        request_id: "request-1",
        usage: { credits: 1 },
        results: [{ title: "Source", url: "https://example.com", content: "Evidence", score: 0.9 }],
      }), { status: 200 });
    }) as unknown as typeof fetch;
    const { provider, auditPath } = setup(fetchImpl);
    provider.setKey("tvly-test-secure-key");
    const result = await provider.search({ query: "private live query", searchDepth: "advanced", maxResults: 99, topic: "finance", timeRange: "day" });
    expect(result.results).toHaveLength(1);
    const audit = fs.readFileSync(auditPath, "utf8");
    expect(audit).toContain("search_completed");
    expect(audit).not.toContain("tvly-test-secure-key");
    expect(audit).not.toContain("private live query");
  });

  it("retries transient upstream failures and respects a bounded retry delay", async () => {
    const sleepImpl = vi.fn(async () => {});
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(new Response("busy", { status: 503 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        answer: "Recovered answer",
        results: [{ title: "Source", url: "https://example.com/recovered", content: "Evidence" }],
      }), { status: 200 })) as unknown as typeof fetch;
    const { provider, auditPath } = setup(fetchImpl, sleepImpl);
    provider.setKey("tvly-test-secure-key");

    await expect(provider.search({ query: "current market" })).resolves.toEqual(expect.objectContaining({ answer: "Recovered answer" }));
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(sleepImpl).toHaveBeenCalledWith(250);
    expect(fs.readFileSync(auditPath, "utf8")).toContain("search_retry");
  });

  it("does not retry authentication failures and returns a stable error code", async () => {
    const fetchImpl = vi.fn(async () => new Response("denied", { status: 401 })) as unknown as typeof fetch;
    const { provider } = setup(fetchImpl);
    provider.setKey("tvly-test-secure-key");

    await expect(provider.search({ query: "current market" })).rejects.toThrow("TAVILY_AUTH_FAILED");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("retries 429 responses using the retry-after header", async () => {
    const sleepImpl = vi.fn(async () => {});
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(new Response("limited", { status: 429, headers: { "retry-after": "1" } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ answer: "Ready", results: [] }), { status: 200 })) as unknown as typeof fetch;
    const { provider } = setup(fetchImpl, sleepImpl);
    provider.setKey("tvly-test-secure-key");

    await expect(provider.search({ query: "today news" })).resolves.toEqual(expect.objectContaining({ answer: "Ready" }));
    expect(sleepImpl).toHaveBeenCalledWith(1_000);
  });
});
