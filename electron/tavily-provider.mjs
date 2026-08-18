import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const SEARCH_ENDPOINT = "https://api.tavily.com/search";
const USAGE_ENDPOINT = "https://api.tavily.com/usage";
const DEPTHS = new Set(["basic", "advanced", "fast", "ultra-fast"]);
const RETRYABLE_STATUS = new Set([408, 429, 500, 502, 503, 504]);
const SEARCH_TIMEOUT_MS = 12_000;
const MAX_SEARCH_ATTEMPTS = 3;

const trimText = (value, max) => String(value ?? "").trim().slice(0, max);

export function createTavilyProvider({
  rootDir,
  safeStorage,
  fetchImpl = globalThis.fetch,
  auditPath,
  sleepImpl = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
}) {
  const secretPath = path.join(rootDir, "secrets", "tavily.json");

  const audit = (event, detail = {}) => {
    if (!auditPath) return;
    try {
      fs.mkdirSync(path.dirname(auditPath), { recursive: true, mode: 0o700 });
      fs.appendFileSync(auditPath, `${JSON.stringify({ timestamp: new Date().toISOString(), event, ...detail })}\n`, { mode: 0o600 });
    } catch (error) {
      console.warn("[Tavily] audit write failed", error?.message || error);
    }
  };

  const readKey = () => {
    if (!safeStorage.isEncryptionAvailable()) throw new Error("OS secure storage is unavailable");
    try {
      const data = JSON.parse(fs.readFileSync(secretPath, "utf8"));
      return safeStorage.decryptString(Buffer.from(String(data.tavily || ""), "base64")).trim();
    } catch (error) {
      if (error?.code === "ENOENT") return "";
      throw new Error("Tavily secret could not be decrypted");
    }
  };

  const writeKey = (value) => {
    if (!safeStorage.isEncryptionAvailable()) throw new Error("OS secure storage is unavailable");
    const key = trimText(value, 512);
    fs.mkdirSync(path.dirname(secretPath), { recursive: true, mode: 0o700 });
    if (!key) {
      try { fs.unlinkSync(secretPath); } catch (error) { if (error?.code !== "ENOENT") throw error; }
      audit("key_removed");
      return;
    }
    if (/\s/.test(key) || key.length < 16) throw new Error("Invalid Tavily API key");
    const payload = JSON.stringify({ tavily: safeStorage.encryptString(key).toString("base64") });
    const tempPath = `${secretPath}.${process.pid}.tmp`;
    fs.writeFileSync(tempPath, payload, { mode: 0o600 });
    fs.renameSync(tempPath, secretPath);
    audit("key_saved");
  };

  const authorizedFetch = async (url, init = {}, keyOverride = "") => {
    const key = trimText(keyOverride, 512) || readKey();
    if (!key) throw new Error("TAVILY_KEY_MISSING: Tavily API key is not configured");
    return fetchImpl(url, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${key}`,
        ...(init.headers || {}),
      },
    });
  };

  const retryDelay = (response, attempt) => {
    const retryAfterHeader = response?.headers?.get?.("retry-after");
    const retryAfter = retryAfterHeader == null ? Number.NaN : Number(retryAfterHeader);
    if (Number.isFinite(retryAfter) && retryAfter >= 0) return Math.min(retryAfter * 1_000, 2_000);
    return Math.min(250 * (2 ** attempt), 1_000);
  };

  const errorCode = (status) => {
    if (status === 401 || status === 403) return "TAVILY_AUTH_FAILED";
    if (status === 429) return "TAVILY_RATE_LIMITED";
    if (status === 432 || status === 433) return "TAVILY_CREDITS_EXHAUSTED";
    if (status >= 500) return "TAVILY_UPSTREAM_UNAVAILABLE";
    return "TAVILY_REQUEST_FAILED";
  };

  const requestWithRetry = async (url, init, { operation, queryHash, key } = {}) => {
    let lastError;
    for (let attempt = 0; attempt < MAX_SEARCH_ATTEMPTS; attempt += 1) {
      if (init.signal?.aborted) throw init.signal.reason || new DOMException("Tavily request cancelled", "AbortError");
      const timeout = AbortSignal.timeout(SEARCH_TIMEOUT_MS);
      const signal = init.signal ? AbortSignal.any([init.signal, timeout]) : timeout;
      try {
        const response = await authorizedFetch(url, { ...init, signal }, key);
        if (!RETRYABLE_STATUS.has(response.status) || attempt === MAX_SEARCH_ATTEMPTS - 1) return response;
        audit(`${operation}_retry`, {
          queryHash,
          status: response.status,
          attempt: attempt + 1,
          delayMs: retryDelay(response, attempt),
        });
        await sleepImpl(retryDelay(response, attempt));
      } catch (error) {
        if (init.signal?.aborted || error?.name === "AbortError") throw error;
        lastError = error;
        if (attempt === MAX_SEARCH_ATTEMPTS - 1) break;
        const delayMs = Math.min(250 * (2 ** attempt), 1_000);
        audit(`${operation}_retry`, { queryHash, status: "network", attempt: attempt + 1, delayMs });
        await sleepImpl(delayMs);
      }
    }
    const timedOut = lastError?.name === "TimeoutError";
    throw new Error(`${timedOut ? "TAVILY_TIMEOUT" : "TAVILY_NETWORK_ERROR"}: ${timedOut ? "Tavily did not respond in time" : "Tavily could not be reached"}`);
  };

  const test = async ({ signal, key } = {}) => {
    const startedAt = Date.now();
    const response = await requestWithRetry(USAGE_ENDPOINT, { method: "GET", signal }, { operation: "test", key });
    const text = await response.text();
    if (!response.ok) {
      audit("test_failed", { status: response.status, durationMs: Date.now() - startedAt });
      throw new Error(`${errorCode(response.status)}: Tavily key validation failed (${response.status}): ${text.slice(0, 240)}`);
    }
    let data = {};
    try { data = JSON.parse(text); } catch { /* Valid status is enough. */ }
    audit("test_completed", { status: response.status, durationMs: Date.now() - startedAt });
    return { ok: true, usage: data?.key || null, account: data?.account || null };
  };

  const search = async (input = {}) => {
    const query = trimText(input.query, 1_000);
    if (!query) throw new Error("TAVILY_QUERY_REQUIRED: A web search query is required");
    const searchDepth = DEPTHS.has(input.searchDepth) ? input.searchDepth : "basic";
    const maxResults = Math.max(1, Math.min(10, Number(input.maxResults) || 5));
    const startedAt = Date.now();
    const queryHash = createHash("sha256").update(query).digest("hex").slice(0, 16);
    const response = await requestWithRetry(SEARCH_ENDPOINT, {
      method: "POST",
      signal: input.signal,
      body: JSON.stringify({
        query,
        search_depth: searchDepth,
        max_results: maxResults,
        include_answer: "basic",
        include_raw_content: false,
        include_images: false,
        include_usage: true,
        ...(input.topic ? { topic: input.topic } : {}),
        ...(input.timeRange ? { time_range: input.timeRange } : {}),
      }),
    }, { operation: "search", queryHash });
    const text = await response.text();
    if (!response.ok) {
      audit("search_failed", { queryHash, status: response.status, durationMs: Date.now() - startedAt });
      throw new Error(`${errorCode(response.status)}: Tavily search failed (${response.status}): ${text.slice(0, 300)}`);
    }
    let payload;
    try { payload = JSON.parse(text); } catch { throw new Error("TAVILY_INVALID_RESPONSE: Tavily returned invalid JSON"); }
    const results = Array.isArray(payload.results) ? payload.results.slice(0, maxResults).map((item) => ({
      title: trimText(item?.title, 300),
      url: trimText(item?.url, 2_000),
      content: trimText(item?.content, 2_000),
      score: Number.isFinite(Number(item?.score)) ? Number(item.score) : null,
      publishedDate: trimText(item?.published_date, 80) || undefined,
    })).filter((item) => /^https?:\/\//i.test(item.url)) : [];
    audit("search_completed", {
      queryHash,
      status: response.status,
      resultCount: results.length,
      durationMs: Date.now() - startedAt,
      requestId: trimText(payload.request_id, 120) || undefined,
      credits: payload.usage?.credits,
    });
    return {
      query,
      answer: trimText(payload.answer, 6_000),
      results,
      requestId: trimText(payload.request_id, 120) || undefined,
      responseTime: payload.response_time,
      usage: payload.usage || null,
    };
  };

  return {
    hasKey: () => Boolean(readKey()),
    setKey: (key) => { writeKey(key); return { hasKey: Boolean(trimText(key, 512)) }; },
    test,
    search,
  };
}
