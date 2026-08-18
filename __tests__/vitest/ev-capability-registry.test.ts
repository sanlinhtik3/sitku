import { describe, expect, it, vi } from "vitest";
import {
  createEvCapabilities,
  EvCapabilityRegistry,
} from "@/features/ev-voice/capabilities/capabilityRegistry";
import type { EvidenceRef, EvFunctionDeclaration, EvToolResult } from "@/features/ev-voice/workspace/contracts";

const declaration = (name: string): EvFunctionDeclaration => ({
  name,
  description: `${name} description`,
  parameters: { type: "object", properties: {} },
});

const metadata = () => ({
  domain: "workspace" as const,
  transport: "local" as const,
  risk: "read_only" as const,
  confirmation: "never" as const,
  requiresEvidence: true,
});

const evidence: EvidenceRef = {
  id: "test-evidence",
  type: "workspace",
  capturedAt: "2026-08-13T00:00:00.000Z",
};
const success = (data: unknown): EvToolResult<unknown> => ({ ok: true, data, evidence: [evidence] });

describe("EvCapabilityRegistry", () => {
  it("publishes metadata and immutable declaration copies from one catalog", () => {
    const registry = new EvCapabilityRegistry().register({
      id: "workspace",
      capabilities: createEvCapabilities([declaration("workspace_get_state")], metadata),
      execute: async (name) => success({ name }),
    });

    expect(registry.has("workspace_get_state")).toBe(true);
    expect(registry.get("workspace_get_state")).toEqual(expect.objectContaining({
      domain: "workspace",
      risk: "read_only",
      requiresEvidence: true,
    }));
    const first = registry.declarations();
    first[0].description = "mutated caller copy";
    expect(registry.declarations()[0].description).toBe("workspace_get_state description");
  });

  it("routes execute and preview to the owning adapter", async () => {
    const execute = vi.fn(async (name: string) => success({ name }));
    const preview = vi.fn(async () => ({
      ok: true as const,
      requiresConfirmation: true,
      prompt: "Approve?",
      intent: "run_terminal_command",
      skill: "terminal_skill" as const,
      mode: "command" as const,
    }));
    const registry = new EvCapabilityRegistry().register({
      id: "terminal",
      capabilities: createEvCapabilities([declaration("terminal_run")], () => ({
        domain: "terminal",
        transport: "electron-ipc",
        risk: "dynamic",
        confirmation: "dynamic",
        requiresEvidence: true,
      })),
      execute,
      preview,
    });

    const approvedPreview = await registry.preview("terminal_run", { command: "pwd" }, { userTranscript: "run pwd" });
    await expect(registry.execute("terminal_run", { command: "pwd" }, {
      userTranscript: "run pwd",
      approved: true,
      preview: approvedPreview || undefined,
    }))
      .resolves.toEqual(expect.objectContaining({ ok: true, data: { name: "terminal_run" } }));
    await expect(registry.preview("terminal_run", { command: "pwd" }, { userTranscript: "run pwd" }))
      .resolves.toEqual(expect.objectContaining({ ok: true, requiresConfirmation: true }));
    expect(execute).toHaveBeenCalledOnce();
    expect(preview).toHaveBeenCalledTimes(2);
  });

  it("cancels each adapter once and rejects duplicate capability names", () => {
    const cancel = vi.fn();
    const registry = new EvCapabilityRegistry().register({
      id: "workspace",
      capabilities: createEvCapabilities([declaration("one"), declaration("two")], metadata),
      execute: async () => success({}),
      cancel,
    });
    registry.cancel();
    expect(cancel).toHaveBeenCalledOnce();
    expect(() => registry.register({
      id: "duplicate",
      capabilities: createEvCapabilities([declaration("one")], metadata),
      execute: async () => success({}),
    })).toThrow("Duplicate E.V capability: one");
  });

  it("passes scoped cancellation to adapters without cancelling unrelated work", () => {
    const cancel = vi.fn();
    const registry = new EvCapabilityRegistry().register({
      id: "workspace",
      capabilities: createEvCapabilities([declaration("web_search")], metadata),
      execute: async () => success({}),
      cancel,
    });

    registry.cancel({ interruptibility: "foreground" });
    expect(cancel).toHaveBeenCalledWith({ interruptibility: "foreground" });
  });

  it("normalizes legacy fallback results without exposing unknown calls as success", async () => {
    const registry = new EvCapabilityRegistry({
      fallbackExecute: async (name) => name === "legacy_ok" ? { value: 1 } : { error: `unknown tool: ${name}` },
    });

    await expect(registry.execute("legacy_ok")).resolves.toEqual({ ok: true, data: { value: 1 }, evidence: [] });
    await expect(registry.execute("missing")).resolves.toEqual(expect.objectContaining({
      ok: false,
      error: expect.objectContaining({ code: "UNSUPPORTED_OPERATION", message: "unknown tool: missing" }),
    }));
  });

  it("enforces metadata approval even when an adapter has no preview", async () => {
    const execute = vi.fn(async () => success({ changed: true }));
    const registry = new EvCapabilityRegistry().register({
      id: "notes",
      capabilities: createEvCapabilities([declaration("notes_delete")], () => ({
        domain: "notes",
        transport: "local",
        risk: "destructive",
        confirmation: "always",
        requiresEvidence: true,
      })),
      execute,
    });

    const preview = await registry.preview("notes_delete");
    expect(preview).toEqual(expect.objectContaining({ ok: true, requiresConfirmation: true }));
    await expect(registry.execute("notes_delete")).resolves.toEqual(expect.objectContaining({
      ok: false,
      error: expect.objectContaining({ code: "PERMISSION_DENIED" }),
    }));
    expect(execute).not.toHaveBeenCalled();

    await expect(registry.execute("notes_delete", {}, {
      userTranscript: "delete it",
      approved: true,
      preview: preview || undefined,
    })).resolves.toEqual(expect.objectContaining({ ok: true }));
    expect(execute).toHaveBeenCalledOnce();
  });

  it("rejects success without required evidence", async () => {
    const registry = new EvCapabilityRegistry().register({
      id: "workspace",
      capabilities: createEvCapabilities([declaration("workspace_get_state")], metadata),
      execute: async () => ({ ok: true, data: { room: "notes" }, evidence: [] }),
    });

    await expect(registry.execute("workspace_get_state")).resolves.toEqual(expect.objectContaining({
      ok: false,
      error: expect.objectContaining({ code: "ACTION_VERIFICATION_FAILED" }),
    }));
  });

  it("requires a runtime preview for dynamic-risk capabilities", async () => {
    const execute = vi.fn(async () => success({}));
    const registry = new EvCapabilityRegistry().register({
      id: "terminal",
      capabilities: createEvCapabilities([declaration("terminal_run")], () => ({
        domain: "terminal",
        transport: "electron-ipc",
        risk: "dynamic",
        confirmation: "dynamic",
        requiresEvidence: true,
      })),
      execute,
    });

    await expect(registry.execute("terminal_run")).resolves.toEqual(expect.objectContaining({
      ok: false,
      error: expect.objectContaining({ code: "UNSUPPORTED_OPERATION" }),
    }));
    expect(execute).not.toHaveBeenCalled();
  });

  it("emits bounded lifecycle events for approval and verified execution", async () => {
    const onLifecycle = vi.fn();
    const registry = new EvCapabilityRegistry({ onLifecycle }).register({
      id: "workspace",
      capabilities: createEvCapabilities([declaration("workspace_get_state")], metadata),
      execute: async () => success({ room: "notes" }),
    });

    await registry.execute("workspace_get_state");
    expect(onLifecycle).toHaveBeenNthCalledWith(1, expect.objectContaining({
      capability: "workspace_get_state",
      status: "started",
    }));
    expect(onLifecycle).toHaveBeenNthCalledWith(2, expect.objectContaining({
      capability: "workspace_get_state",
      status: "completed",
    }));
  });
});
