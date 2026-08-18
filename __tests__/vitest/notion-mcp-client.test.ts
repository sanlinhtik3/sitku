import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  assertSafeNotionToolCall,
  createNotionMcpClient,
  normalizeNotionToolName,
  notionToolPolicy,
} from "../../electron/notion-mcp-client.mjs";

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

describe("Notion MCP desktop policy", () => {
  it("allowlists official tools and never normalizes unknown remote capabilities", () => {
    expect(notionToolPolicy("notion-search")).toBe("read");
    expect(notionToolPolicy("notion-create-pages")).toBe("write");
    expect(normalizeNotionToolName("notion-create-view")).toBe("notion_create_view");
    expect(normalizeNotionToolName("notion-delete-everything")).toBeNull();
  });

  it("requires approval and idempotency for writes and blocks destructive replacement", async () => {
    expect(() => assertSafeNotionToolCall("notion-create-pages", { pages: [] }, false)).toThrow("Approval is required");
    expect(() => assertSafeNotionToolCall("notion-update-page", { command: "replace_content", replace_content: "new" }, true)).toThrow("full-content replacement");

    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "sitku-notion-"));
    roots.push(rootDir);
    const safeStorage = {
      isEncryptionAvailable: () => true,
      encryptString: (value: string) => Buffer.from(`encrypted:${value}`),
      decryptString: (value: Buffer) => value.toString().replace(/^encrypted:/, ""),
    };
    const client = createNotionMcpClient({ rootDir, safeStorage, shell: { openExternal: vi.fn() } });
    await expect(client.callTool({ name: "notion-create-pages", arguments: {}, approved: true }))
      .rejects.toThrow("idempotency key");
  });

  it("keeps credentials out of sanitized status", () => {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "sitku-notion-"));
    roots.push(rootDir);
    const client = createNotionMcpClient({
      rootDir,
      safeStorage: {
        isEncryptionAvailable: () => true,
        encryptString: (value: string) => Buffer.from(value),
        decryptString: (value: Buffer) => value.toString(),
      },
      shell: { openExternal: vi.fn() },
    });
    expect(client.status()).toEqual({
      state: "not_connected",
      connected: false,
      workspaceName: null,
      grantedScope: null,
      lastSuccessfulCall: null,
      error: null,
      desktopOnly: true,
    });
    expect(JSON.stringify(client.status())).not.toMatch(/access_token|refresh_token|client_secret/i);
  });
});
