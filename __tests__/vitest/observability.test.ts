import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { formatTerminalEvent, LocalObservabilityService, redactLogMetadata } from "../../electron/observability.mjs";

describe("LocalObservabilityService", () => {
  it("writes queryable status events and redacts private payloads", async () => {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "sitku-observability-"));
    const output = { lines: "", write(value: string) { this.lines += value; } };
    const service = new LocalObservabilityService({ rootDir, terminal: output });

    service.record({
      domain: "ev",
      event: "action.completed",
      traceId: "ev-42",
      status: "completed",
      durationMs: 84,
      metadata: { apiKey: "secret", transcript: "private speech", resultCount: 1 },
    });
    await service.flush();

    expect(service.list({ traceId: "ev-42" })).toEqual([
      expect.objectContaining({
        event: "action.completed",
        status: "completed",
        metadata: { apiKey: "[redacted]", transcript: "[redacted]", resultCount: 1 },
      }),
    ]);
    expect(output.lines).toContain("#ev-42");
    const logsDir = path.join(rootDir, "logs");
    const jsonl = fs.readFileSync(path.join(logsDir, fs.readdirSync(logsDir)[0]), "utf8");
    expect(jsonl).not.toContain("private speech");
    expect(jsonl).not.toContain("secret");
    await service.close();
  });

  it("redacts nested sensitive metadata without changing safe fields", () => {
    expect(redactLogMetadata({ status: "completed", nested: { token: "private", count: 3 } })).toEqual({
      status: "completed",
      nested: { token: "[redacted]", count: 3 },
    });
  });

  it("renders aligned plain logs and opt-in status colors", () => {
    const event = {
      timestamp: "2026-08-09T18:54:58.123Z",
      level: "info",
      domain: "ev",
      event: "action.completed",
      traceId: "ev-42",
      status: "completed",
      durationMs: 84,
    };
    const plain = formatTerminalEvent(event);
    const colored = formatTerminalEvent(event, { color: true });

    expect(plain).toContain("18:54:58.123 | INFO  | EV");
    expect(plain).toContain("ACTION");
    expect(plain).toContain("COMPLETED");
    expect(plain).toContain("    84ms | #ev-42");
    expect(plain).not.toContain("\u001b[");
    expect(colored).toContain("\u001b[38;5;84mCOMPLETED");
    expect(colored.replace(/\u001b\[[0-9;]*m/g, "")).toBe(plain);
  });

  it("prunes old indexed diagnostics without touching recent trust events", async () => {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "sitku-observability-retention-"));
    const service = new LocalObservabilityService({ rootDir, terminal: { write() {} } });
    service.record({ timestamp: "2025-01-01T00:00:00.000Z", domain: "app", event: "old", traceId: "old-trace", status: "completed" });
    service.record({ domain: "app", event: "recent", traceId: "recent-trace", status: "completed" });
    await service.flush();
    service.prune();

    expect(service.list({ traceId: "old-trace" })).toHaveLength(0);
    expect(service.list({ traceId: "recent-trace" })).toHaveLength(1);
    await service.close();
  });

  it("drains every buffered event before shutdown", async () => {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "sitku-observability-drain-"));
    const service = new LocalObservabilityService({ rootDir, terminal: { write() {} } });
    for (let index = 0; index < 250; index += 1) {
      service.record({ domain: "performance", event: "sample", traceId: "bulk-trace", status: "completed", metadata: { index } });
    }
    await service.close();

    const reopened = new LocalObservabilityService({ rootDir, terminal: { write() {} } });
    expect(reopened.list({ traceId: "bulk-trace", limit: 500 })).toHaveLength(250);
    await reopened.close();
  });
});
