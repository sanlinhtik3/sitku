import { afterEach, beforeEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
// @ts-expect-error The Electron service is intentionally runtime-native ESM.
import { createEvTerminalService, tokenizeTerminalCommand } from "../../electron/ev-terminal.mjs";

describe("E.V terminal access policy", () => {
  let home: string;

  beforeEach(() => {
    home = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "sitku-ev-terminal-")));
  });

  afterEach(() => {
    fs.rmSync(home, { recursive: true, force: true });
  });

  it("tokenizes quoted arguments but rejects shell chaining and substitution", () => {
    expect(tokenizeTerminalCommand("rg 'hello world' Notes")).toEqual(["rg", "hello world", "Notes"]);
    expect(() => tokenizeTerminalCommand("ls && rm -rf Notes")).toThrow(/chaining are disabled/i);
    expect(() => tokenizeTerminalCommand("echo $(pwd)")).toThrow(/substitution is not supported/i);
  });

  it("runs a read-only command without approval and reports verified process completion", async () => {
    const service = createEvTerminalService({ homeDir: home });
    const planned = await service.plan({ command: "pwd", cwd: home, purpose: "Check the active folder" });
    expect(planned).toEqual(expect.objectContaining({
      ok: true,
      plan: expect.objectContaining({ risk: "read_only", requiresConfirmation: false, cwd: home }),
    }));
    const result = await service.execute({ planId: planned.plan.planId, idempotencyKey: "read-1", approved: false });
    expect(result).toEqual(expect.objectContaining({ ok: true, exitCode: 0, verified: true }));
    expect(result.stdout.trim()).toBe(home);
  });

  it("holds file writes for approval and prevents duplicate execution", async () => {
    const service = createEvTerminalService({ homeDir: home });
    const planned = await service.plan({ command: "mkdir Project", cwd: home });
    expect(planned.plan).toEqual(expect.objectContaining({ risk: "state_change", requiresConfirmation: true }));
    const denied = await service.execute({ planId: planned.plan.planId, idempotencyKey: "mkdir-denied", approved: false });
    expect(denied).toEqual(expect.objectContaining({ ok: false, error: expect.objectContaining({ code: "PERMISSION_DENIED" }) }));
    expect(fs.existsSync(path.join(home, "Project"))).toBe(false);

    const approvedPlan = await service.plan({ command: "mkdir Project", cwd: home });
    const approved = await service.execute({ planId: approvedPlan.plan.planId, idempotencyKey: "mkdir-approved", approved: true });
    expect(approved).toEqual(expect.objectContaining({ ok: true, verified: true }));
    expect(fs.existsSync(path.join(home, "Project"))).toBe(true);
    const duplicate = await service.execute({ planId: "does-not-matter", idempotencyKey: "mkdir-approved", approved: true });
    expect(duplicate).toEqual(expect.objectContaining({ ok: true, duplicate: true }));
  });

  it("requires explicit approval for delete and verifies the target is gone", async () => {
    const target = path.join(home, "remove-me.txt");
    fs.writeFileSync(target, "test");
    const service = createEvTerminalService({ homeDir: home });
    const planned = await service.plan({ command: "rm remove-me.txt", cwd: home });
    expect(planned.plan).toEqual(expect.objectContaining({
      risk: "destructive",
      requiresConfirmation: true,
      destructiveTargets: [target],
    }));
    const result = await service.execute({ planId: planned.plan.planId, idempotencyKey: "delete-approved", approved: true });
    expect(result).toEqual(expect.objectContaining({ ok: true, verified: true, exitCode: 0 }));
    expect(fs.existsSync(target)).toBe(false);
  });

  it("blocks system-level commands, protected deletes, and cwd outside home", async () => {
    const service = createEvTerminalService({ homeDir: home });
    await expect(service.plan({ command: "sudo ls", cwd: home })).resolves.toEqual(expect.objectContaining({
      ok: false,
      error: expect.objectContaining({ code: "PERMISSION_DENIED" }),
    }));
    await expect(service.plan({ command: "rm .", cwd: home })).resolves.toEqual(expect.objectContaining({
      ok: false,
      error: expect.objectContaining({ code: "PERMISSION_DENIED" }),
    }));
    await expect(service.plan({ command: "pwd", cwd: path.dirname(home) })).resolves.toEqual(expect.objectContaining({
      ok: false,
      error: expect.objectContaining({ code: "PERMISSION_DENIED" }),
    }));
  });
});
