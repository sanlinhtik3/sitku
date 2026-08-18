import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { createEvProvider } from "../../electron/ev-provider.mjs";

const createJarvisProvider = createEvProvider;

const fakeSafeStorage = {
  isEncryptionAvailable: () => true,
  encryptString: (value: string) => Buffer.from(`encrypted:${value}`),
  decryptString: (value: Buffer) => value.toString().replace(/^encrypted:/, ""),
};

describe("Jarvis desktop provider boundary", () => {
  it("keeps the key in encrypted storage and injects it only in the main-process request", async () => {
    const rootDir = mkdtempSync(join(tmpdir(), "sitku-provider-"));
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 }));
    const provider = createJarvisProvider({ rootDir, safeStorage: fakeSafeStorage, fetchImpl });

    expect(provider.hasKey()).toBe(false);
    provider.setKey("secret-key");
    expect(provider.hasKey()).toBe(true);
    await provider.request({ model: "gemini-2.5-flash", body: { contents: [] } });

    expect(fetchImpl).toHaveBeenCalledWith(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent",
      expect.objectContaining({ headers: expect.objectContaining({ "x-goog-api-key": "secret-key" }) }),
    );
  });

  it("rejects untrusted model paths before network access", async () => {
    const rootDir = mkdtempSync(join(tmpdir(), "sitku-provider-"));
    const fetchImpl = vi.fn();
    const provider = createJarvisProvider({ rootDir, safeStorage: fakeSafeStorage, fetchImpl });
    provider.setKey("secret-key");
    await expect(provider.request({ model: "../../bad", body: {} })).rejects.toThrow("Invalid Gemini model");
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("mints a constrained short-lived token for E.V without exposing the saved key", async () => {
    const rootDir = mkdtempSync(join(tmpdir(), "sitku-provider-"));
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ name: "ephemeral-token" }), { status: 200 }));
    const provider = createJarvisProvider({ rootDir, safeStorage: fakeSafeStorage, fetchImpl });
    provider.setKey("secret-key");
    const result = await provider.createLiveToken("models/gemini-3.1-flash-live-preview");
    expect(result).toEqual({ token: "ephemeral-token", model: "models/gemini-3.1-flash-live-preview" });
    expect(fetchImpl).toHaveBeenCalledWith(
      "https://generativelanguage.googleapis.com/v1beta/auth_tokens",
      expect.objectContaining({
        headers: expect.objectContaining({ "x-goog-api-key": "secret-key" }),
        body: expect.stringContaining("gemini-3.1-flash-live-preview"),
      }),
    );
    expect(JSON.stringify(result)).not.toContain("secret-key");
  });

  it("falls back once to the documented basic token when constraints are not rolled out", async () => {
    const rootDir = mkdtempSync(join(tmpdir(), "sitku-provider-"));
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: { message: "Unknown name liveConnectConstraints: Cannot find field" } }), { status: 400 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ name: "basic-ephemeral-token" }), { status: 200 }));
    const provider = createEvProvider({ rootDir, safeStorage: fakeSafeStorage, fetchImpl });
    provider.setKey("secret-key");

    await expect(provider.createLiveToken()).resolves.toEqual({
      token: "basic-ephemeral-token",
      model: "models/gemini-3.1-flash-live-preview",
    });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(JSON.parse(fetchImpl.mock.calls[0][1].body)).toHaveProperty("liveConnectConstraints");
    expect(JSON.parse(fetchImpl.mock.calls[1][1].body)).not.toHaveProperty("liveConnectConstraints");
  });

  it("binds Live Translate tokens to the translation-only model and target", async () => {
    const rootDir = mkdtempSync(join(tmpdir(), "sitku-provider-"));
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ name: "translation-token" }), { status: 200 }));
    const provider = createEvProvider({ rootDir, safeStorage: fakeSafeStorage, fetchImpl });
    provider.setKey("secret-key");

    await expect(provider.createLiveToken("models/gemini-3.5-live-translate-preview", {
      targetLanguageCode: "my",
      echoTargetLanguage: false,
    })).resolves.toEqual({
      token: "translation-token",
      model: "models/gemini-3.5-live-translate-preview",
    });

    const payload = JSON.parse(fetchImpl.mock.calls[0][1].body);
    expect(payload.liveConnectConstraints).toEqual({
      model: "models/gemini-3.5-live-translate-preview",
      config: {
        responseModalities: ["AUDIO"],
        inputAudioTranscription: {},
        outputAudioTranscription: {},
        translationConfig: { targetLanguageCode: "my", echoTargetLanguage: false },
      },
    });
  });

  it("falls back to a one-use translation token when constraints are not rolled out", async () => {
    const rootDir = mkdtempSync(join(tmpdir(), "sitku-provider-"));
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(new Response(
        JSON.stringify({ error: { message: "Unknown name liveConnectConstraints: Cannot find field" } }),
        { status: 400 },
      ))
      .mockResolvedValueOnce(new Response(JSON.stringify({ name: "translation-basic-token" }), { status: 200 }));
    const provider = createEvProvider({ rootDir, safeStorage: fakeSafeStorage, fetchImpl });
    provider.setKey("secret-key");

    await expect(provider.createLiveToken("models/gemini-3.5-live-translate-preview", {
      targetLanguageCode: "ja",
      echoTargetLanguage: false,
    })).resolves.toEqual({
      token: "translation-basic-token",
      model: "models/gemini-3.5-live-translate-preview",
    });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(JSON.parse(fetchImpl.mock.calls[0][1].body)).toHaveProperty("liveConnectConstraints");
    expect(JSON.parse(fetchImpl.mock.calls[1][1].body)).toEqual(expect.objectContaining({ uses: 1 }));
    expect(JSON.parse(fetchImpl.mock.calls[1][1].body)).not.toHaveProperty("liveConnectConstraints");
  });
});
