/* eslint-disable @typescript-eslint/no-explicit-any -- JSON-RPC fixtures intentionally exercise the untyped transport boundary. */
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createMcpActionGateway } from "../../electron/mcp-action-gateway.mjs";
import { startMcpHttpServer } from "../../electron/mcp-http-server.mjs";
import { createSitkuCore } from "../../mcp/sitku-mcp-core.mjs";

const tempDirs: string[] = [];
afterEach(() => { for (const dir of tempDirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true }); });

const hash = (value: string) => crypto.createHash("sha256").update(value).digest("hex");
const resultText = (response: any) => JSON.parse(response.result.content[0].text);

function createMemoryNotes() {
  const records = new Map<string, any>();
  return {
    records,
    async listNotes({ query, limit = 500 }: any = {}) {
      return [...records.values()].filter((note) => !query || note.path.includes(query) || note.title.includes(query)).slice(0, limit);
    },
    async readNote(notePath: string) { return records.get(notePath) || null; },
    async search(query: string, limit = 20) {
      return [...records.values()].filter((note) => `${note.title}\n${note.content}`.toLowerCase().includes(query.toLowerCase())).slice(0, limit).map((note) => ({ path: note.path, title: note.title, snippet: note.content }));
    },
    async writeNote(input: any) {
      const current = records.get(input.path);
      if (input.expectedHash && current?.contentHash !== input.expectedHash) throw new Error("conflict");
      const note = { path: input.path, title: input.content.match(/^#\s+(.+)$/m)?.[1] || path.basename(input.path, ".md"), content: input.content, contentHash: hash(input.content), mtimeMs: Date.now() };
      records.set(input.path, note);
      return note;
    },
  };
}

describe("Sitku production MCP contract", () => {
  it("advertises instructions, resources, prompts, and read/write annotations", async () => {
    const notes = createMemoryNotes();
    const core = createSitkuCore(() => "/tmp/vault", { notes });
    const initialized: any = await core.dispatch({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-11-25" } });
    expect(initialized.result.capabilities).toMatchObject({ tools: {}, resources: {}, prompts: {} });
    expect(initialized.result.instructions).toContain("Read before writing");

    const listed: any = await core.dispatch({ jsonrpc: "2.0", id: 2, method: "tools/list" });
    expect(listed.result.tools.find((tool: any) => tool.name === "read_note").annotations.readOnlyHint).toBe(true);
    expect(listed.result.tools.find((tool: any) => tool.name === "update_note").annotations).toMatchObject({ readOnlyHint: false, destructiveHint: true });

    const prompts: any = await core.dispatch({ jsonrpc: "2.0", id: 3, method: "prompts/list" });
    expect(prompts.result.prompts.map((prompt: any) => prompt.name)).toContain("monthly_cfo_review");
    const templates: any = await core.dispatch({ jsonrpc: "2.0", id: 4, method: "resources/templates/list" });
    expect(templates.result.resourceTemplates[0].uriTemplate).toBe("sitku://note/{path}");
  });

  it("never performs an app-hosted write before in-app approval", async () => {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "sitku-mcp-")); tempDirs.push(rootDir);
    const gateway = createMcpActionGateway({ rootDir });
    const notes = createMemoryNotes();
    const core = createSitkuCore(() => rootDir, { notes, actionGateway: gateway });
    const client = { id: "codex", name: "Codex", scopes: ["*"] };

    const proposed: any = await core.dispatch({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "create_note", arguments: { path: "Inbox/Idea.md", title: "Idea", content: "Body", idempotency_key: "idea-1" } } }, { client });
    const proposal = resultText(proposed);
    expect(proposal.status).toBe("confirmation_required");
    expect(notes.records.size).toBe(0);

    const duplicate: any = await core.dispatch({ jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "create_note", arguments: { path: "Inbox/Idea.md", title: "Idea", content: "Body", idempotency_key: "idea-1" } } }, { client });
    expect(resultText(duplicate).action.id).toBe(proposal.action.id);

    const approved = await gateway.approve(proposal.action.id);
    expect(approved.status).toBe("completed");
    expect(notes.records.get("Inbox/Idea.md")?.content).toContain("# Idea");
    expect(fs.readFileSync(path.join(rootDir, "mcp-actions.jsonl"), "utf8")).toContain('"event":"completed"');
  });

  it("requires approval for important non-note domain writes", async () => {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "sitku-domain-")); tempDirs.push(rootDir);
    const gateway = createMcpActionGateway({ rootDir });
    let writes = 0;
    const core = createSitkuCore(() => rootDir, {
      actionGateway: gateway,
      extraTools: [{
        name: "finance_update_transaction",
        description: "update transaction",
        inputSchema: { type: "object", properties: { id: { type: "string" } }, required: ["id"] },
        run: async () => ({ ok: true, writes: ++writes }),
      }],
    });
    const response: any = await core.dispatch({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "finance_update_transaction", arguments: { id: "txn-1" } } }, { client: { id: "codex", scopes: ["*"] } });
    const proposal = resultText(response);
    expect(proposal.status).toBe("confirmation_required");
    expect(writes).toBe(0);
    await gateway.approve(proposal.action.id);
    expect(writes).toBe(1);
  });

  it("enforces client scopes and optimistic note conflicts", async () => {
    const notes = createMemoryNotes();
    await notes.writeNote({ path: "Plan.md", content: "# Plan\nold" });
    const core = createSitkuCore(() => "/tmp/vault", { notes });
    const denied: any = await core.dispatch({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "read_note", arguments: { path: "Plan.md" } } }, { client: { scopes: ["finance:read"] } });
    expect(denied.result.isError).toBe(true);
    expect(denied.result.content[0].text).toContain("notes:read");

    const conflict: any = await core.dispatch({ jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "update_note", arguments: { path: "Plan.md", content: "new", expected_hash: "stale" } } }, { client: { scopes: ["*"] } });
    expect(conflict.result.isError).toBe(true);
    expect(conflict.result.content[0].text).toContain("changed since it was read");
    expect(notes.records.get("Plan.md").content).toContain("old");

    const resourceDenied: any = await core.dispatch({ jsonrpc: "2.0", id: 3, method: "resources/read", params: { uri: "sitku://note/Plan.md" } }, { client: { scopes: ["finance:read"] } });
    expect(resourceDenied.error.message).toContain("notes:read");
  });

  it("protects the localhost HTTP transport and returns MCP JSON-RPC", async () => {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "sitku-http-")); tempDirs.push(rootDir);
    const gateway = createMcpActionGateway({ rootDir });
    const notes = createMemoryNotes();
    const client = { id: "claude", name: "Claude", scopes: ["*"] };
    const server = await startMcpHttpServer({
      getVault: () => rootDir,
      port: 0,
      authenticate: (token: string) => token === "valid-token" ? client : null,
      notes,
      actionGateway: gateway,
    });
    try {
      expect((await fetch(server.url, { method: "POST", body: "{}" })).status).toBe(401);
      expect((await fetch(server.url, { method: "POST", headers: { authorization: "Bearer valid-token", origin: "https://attacker.example" }, body: "{}" })).status).toBe(403);
      const response = await fetch(server.url, {
        method: "POST",
        headers: { authorization: "Bearer valid-token", "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 7, method: "tools/list" }),
      });
      expect(response.status).toBe(200);
      const payload: any = await response.json();
      expect(payload.id).toBe(7);
      expect(payload.result.tools.some((tool: any) => tool.name === "create_note")).toBe(true);
    } finally {
      await server.close();
    }
  });
});
