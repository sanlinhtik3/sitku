import fs from "node:fs";
import path from "node:path";

const MODEL_PATTERN = /^gemini-[a-z0-9.-]{1,80}$/;
const LIVE_MODEL = "gemini-3.1-flash-live-preview";

const normalizeModel = (model) => String(model || LIVE_MODEL).replace(/^models\//, "");

export function createEvProvider({ rootDir, safeStorage, fetchImpl = globalThis.fetch }) {
  const secretPath = path.join(rootDir, "secrets", "ev-voice.json");
  const legacySecretPath = path.join(rootDir, "secrets", "jarvis.json");

  const readKey = () => {
    if (!safeStorage.isEncryptionAvailable()) throw new Error("OS secure storage is unavailable");
    for (const candidate of [secretPath, legacySecretPath]) {
      try {
        const data = JSON.parse(fs.readFileSync(candidate, "utf8"));
        return safeStorage.decryptString(Buffer.from(String(data.gemini || ""), "base64")).trim();
      } catch (error) {
        if (error?.code === "ENOENT") continue;
        throw new Error("E.V secret could not be decrypted");
      }
    }
    return "";
  };

  const writeKey = (value) => {
    if (!safeStorage.isEncryptionAvailable()) throw new Error("OS secure storage is unavailable");
    const key = String(value || "").trim();
    fs.mkdirSync(path.dirname(secretPath), { recursive: true, mode: 0o700 });
    if (!key) {
      for (const candidate of [secretPath, legacySecretPath]) {
        try { fs.unlinkSync(candidate); } catch (error) { if (error?.code !== "ENOENT") throw error; }
      }
      return;
    }
    const payload = JSON.stringify({ gemini: safeStorage.encryptString(key).toString("base64") });
    const tempPath = `${secretPath}.${process.pid}.tmp`;
    fs.writeFileSync(tempPath, payload, { mode: 0o600 });
    fs.renameSync(tempPath, secretPath);
  };

  const request = async ({ model, body, stream = false, signal } = {}) => {
    const safeModel = normalizeModel(model);
    if (!MODEL_PATTERN.test(safeModel)) throw new Error("Invalid Gemini model");
    const key = readKey();
    if (!key) throw new Error("no key");
    const payload = JSON.stringify(body ?? {});
    if (payload.length > 8 * 1024 * 1024) throw new Error("E.V provider payload is too large");
    const operation = stream ? "streamGenerateContent?alt=sse" : "generateContent";
    return fetchImpl(`https://generativelanguage.googleapis.com/v1beta/models/${safeModel}:${operation}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      body: payload,
      signal,
    });
  };

  const createLiveToken = async (model = LIVE_MODEL, translation = null) => {
    const safeModel = normalizeModel(model);
    if (!MODEL_PATTERN.test(safeModel)) throw new Error("Invalid Gemini Live model");
    const key = readKey();
    if (!key) throw new Error("no key");
    const now = Date.now();
    const baseToken = {
      uses: 1,
      expireTime: new Date(now + 30 * 60_000).toISOString(),
      newSessionExpireTime: new Date(now + 60_000).toISOString(),
    };
    const requestToken = async (body) => {
      const response = await fetchImpl("https://generativelanguage.googleapis.com/v1beta/auth_tokens", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": key },
        body: JSON.stringify(body),
      });
      return { response, text: await response.text() };
    };
    const translationConfig = translation && typeof translation === "object"
      ? {
          targetLanguageCode: String(translation.targetLanguageCode || "").trim(),
          echoTargetLanguage: translation.echoTargetLanguage === true,
        }
      : null;
    if (translationConfig && !/^[a-z]{2,3}(?:-[A-Za-z]{2,4})?$/.test(translationConfig.targetLanguageCode)) {
      throw new Error("Invalid Gemini Live translation target language");
    }
    const constrainedConfig = translationConfig
      ? {
          responseModalities: ["AUDIO"],
          inputAudioTranscription: {},
          outputAudioTranscription: {},
          translationConfig,
        }
      : {
          responseModalities: ["AUDIO"],
          sessionResumption: {},
        };
    let tokenResponse = await requestToken({
      ...baseToken,
      liveConnectConstraints: {
        model: `models/${safeModel}`,
        config: constrainedConfig,
      },
    });
    // Gemini provisioning schemas are rolled out independently. Some v1beta
    // projects issue ephemeral tokens but reject liveConnectConstraints. A basic
    // one-use token still keeps the API key in the main process; the Live setup
    // then supplies the model and translationConfig over the constrained socket.
    if (tokenResponse.response.status === 400 && /liveConnectConstraints|Cannot find field/i.test(tokenResponse.text)) {
      tokenResponse = await requestToken(baseToken);
    }
    const { response, text } = tokenResponse;
    if (!response.ok) throw new Error(`Gemini Live token ${response.status}: ${text.slice(0, 300)}`);
    let payload;
    try { payload = JSON.parse(text); }
    catch { throw new Error("Gemini Live token response was invalid JSON"); }
    if (!payload?.name) throw new Error("Gemini Live token response did not include a token");
    return { token: payload.name, model: `models/${safeModel}` };
  };

  return {
    hasKey: () => Boolean(readKey()),
    setKey: (key) => { writeKey(key); return { hasKey: Boolean(String(key || "").trim()) }; },
    createLiveToken,
    request,
  };
}
