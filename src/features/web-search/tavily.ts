export type TavilySearchDepth = "basic" | "advanced" | "fast" | "ultra-fast";
export type TavilyTopic = "general" | "news" | "finance";
export type TavilyTimeRange = "day" | "week" | "month" | "year";

export interface TavilySearchInput {
  query: string;
  searchDepth?: TavilySearchDepth;
  maxResults?: number;
  topic?: TavilyTopic;
  timeRange?: TavilyTimeRange;
  signal?: AbortSignal;
}

export interface TavilySearchResult {
  query: string;
  answer: string;
  results: Array<{
    title: string;
    url: string;
    content: string;
    score: number | null;
    publishedDate?: string;
  }>;
  requestId?: string;
  responseTime?: string | number;
  usage?: unknown;
}

const STATUS_EVENT = "beebot:tavily-key-changed";
const desktopBridge = () => typeof window !== "undefined" ? window.beebotDesktop : undefined;
const unavailable = () => new Error("TAVILY_DESKTOP_REQUIRED: Tavily credentials require the Electron desktop secure-storage bridge");
const notify = () => typeof window !== "undefined" && window.dispatchEvent(new Event(STATUS_EVENT));

export const tavilyKey = {
  EVENT: STATUS_EVENT,
  available: () => Boolean(desktopBridge()?.tavilyKeyStatus),
  async has(): Promise<boolean> {
    const desktop = desktopBridge();
    if (!desktop?.tavilyKeyStatus) return false;
    return (await desktop.tavilyKeyStatus()).hasKey;
  },
  async set(value: string): Promise<boolean> {
    const desktop = desktopBridge();
    if (!desktop?.tavilySetKey) throw unavailable();
    const status = await desktop.tavilySetKey(value.trim());
    notify();
    return status.hasKey;
  },
  async test(key?: string) {
    const desktop = desktopBridge();
    if (!desktop?.tavilyTest) throw unavailable();
    return desktop.tavilyTest(key);
  },
};

export async function searchTavily(input: TavilySearchInput): Promise<TavilySearchResult> {
  const desktop = desktopBridge();
  if (!desktop?.tavilySearch) throw unavailable();
  return desktop.tavilySearch(input);
}

/**
 * LangChain is the bounded orchestration boundary only. Sitku remains responsible
 * for secret storage, explicit-web policy, cancellation, evidence, and journaling.
 */
export function createLangChainTavilySearch() {
  let pipelinePromise: Promise<{ invoke(input: TavilySearchInput, options?: { signal?: AbortSignal; tags?: string[] }): Promise<TavilySearchResult> }> | null = null;
  const pipeline = () => {
    pipelinePromise ||= import("@langchain/core/runnables").then(({ RunnableLambda }) => RunnableLambda.from(async (input: TavilySearchInput) => {
      const query = input.query.trim();
      if (!query) throw new Error("TAVILY_QUERY_REQUIRED: A web search query is required");
      if (input.signal?.aborted) throw input.signal.reason || new DOMException("Tavily search cancelled", "AbortError");
      return searchTavily({ ...input, query });
    }) as unknown as { invoke(input: TavilySearchInput, options?: { signal?: AbortSignal; tags?: string[] }): Promise<TavilySearchResult> });
    return pipelinePromise;
  };
  return async (input: TavilySearchInput) => {
    const runnable = await pipeline();
    return runnable.invoke(input, { signal: input.signal, tags: ["sitku", "ev", "tavily", "web-search"] });
  };
}
