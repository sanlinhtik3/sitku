// ═══════════════════════════════════════════════════════════════════════════
// ZoeCrypto "Apex" Multi-Core AI Model Registry
// Gemini 3 + Claude 4.6 — Cloud-Only Architecture
// ═══════════════════════════════════════════════════════════════════════════

export type AIProvider = 'google' | 'anthropic' | 'openrouter';
export type ModelTier = 'flash' | 'pro' | 'opus';

export interface AIModelInfo {
  displayName: string;
  displayNameMM: string;
  provider: AIProvider;
  tier: ModelTier;
  rpm: number;  // Requests per minute
  tpm: number;  // Tokens per minute
  rpd: number;  // Requests per day
  color: string;
  isNew?: boolean;
  isBeta?: boolean;
  isFree?: boolean;
  supportsTools?: boolean; // Whether model supports tool-calling (BeeBot requirement)
  minTierLevel: number; // 0=explorer, 1=analyst, 2=alpha, 3=admin
  description?: string;
  descriptionMM?: string;
}

export const AI_MODELS: Record<string, AIModelInfo> = {
  // ═══ GEMINI MODELS (Google) ═══
  "gemini-2.5-flash-lite": {
    displayName: "Gemini 2.5 Flash Lite",
    displayNameMM: "Gemini 2.5 Flash Lite",
    provider: "google",
    tier: "flash",
    rpm: 30,
    tpm: 1000000,
    rpd: 1500,
    color: "hsl(160, 70%, 50%)",
    minTierLevel: 0,
    description: "Fastest & most economical. Great for simple tasks.",
    descriptionMM: "အမြန်ဆုံးနှင့် ငွေအချွေတာဆုံး။ ရိုးရှင်းသော လုပ်ငန်းများအတွက် အကောင်းဆုံး။",
  },
  "gemini-2.5-flash-image": {
    displayName: "Nano Banana",
    displayNameMM: "Nano Banana",
    provider: "google",
    tier: "flash",
    rpm: 10,
    tpm: 500000,
    rpd: 500,
    color: "hsl(340, 70%, 55%)",
    minTierLevel: 0,
    description: "Fast image generation from text prompts.",
    descriptionMM: "Text prompt များမှ ပုံများ မြန်ဆန်စွာ ဖန်တီးပေးနိုင်သည်။",
  },
  "gemini-2.5-flash": {
    displayName: "Gemini 2.5 Flash",
    displayNameMM: "Gemini 2.5 Flash",
    provider: "google",
    tier: "flash",
    rpm: 15,
    tpm: 1000000,
    rpd: 1500,
    color: "hsl(260, 70%, 50%)",
    minTierLevel: 0,
    description: "Balanced speed and capability for everyday tasks.",
    descriptionMM: "နေ့စဉ် လုပ်ငန်းများအတွက် အမြန်နှုန်းနှင့် စွမ်းရည် ဟန်ချက်ညီ။",
  },
  "gemini-2.5-pro": {
    displayName: "Gemini 2.5 Pro",
    displayNameMM: "Gemini 2.5 Pro",
    provider: "google",
    tier: "pro",
    rpm: 5,
    tpm: 250000,
    rpd: 50,
    color: "hsl(240, 70%, 55%)",
    minTierLevel: 1,
    description: "Advanced reasoning for complex tasks.",
    descriptionMM: "ရှုပ်ထွေးသော လုပ်ငန်းများအတွက် အဆင့်မြင့် ဆင်ခြင်တုံတရားစွမ်းရည်။",
  },
  "gemini-3-flash-preview": {
    displayName: "Gemini 3 Flash",
    displayNameMM: "Gemini 3 Flash",
    provider: "google",
    tier: "flash",
    rpm: 10,
    tpm: 250000,
    rpd: 500,
    color: "hsl(200, 70%, 50%)",
    isNew: true,
    isBeta: true,
    minTierLevel: 1,
    description: "Next-gen fast model. Preview of Google's latest.",
    descriptionMM: "နောက်မျိုးဆက် အမြန်မော်ဒယ်။ Google ၏ အသစ်ဆုံး preview။",
  },
  "gemini-3.5-flash": {
    displayName: "Gemini 3.5 Flash",
    displayNameMM: "Gemini 3.5 Flash",
    provider: "google",
    tier: "flash",
    rpm: 10,
    tpm: 1000000,
    rpd: 500,
    color: "hsl(190, 80%, 55%)",
    isNew: true,
    minTierLevel: 1,
    description: "Stable Gemini 3 family model for fast agentic work.",
    descriptionMM: "မြန်ဆန်သော agentic လုပ်ငန်းများအတွက် stable Gemini 3 family model။",
  },
  "gemini-3.1-pro-preview": {
    displayName: "Gemini 3.1 Pro",
    displayNameMM: "Gemini 3.1 Pro",
    provider: "google",
    tier: "pro",
    rpm: 2,
    tpm: 32000,
    rpd: 50,
    color: "hsl(290, 75%, 55%)",
    isNew: true,
    minTierLevel: 2,
    description: "Latest reasoning model. Better thinking & token efficiency.",
    descriptionMM: "အသစ်ဆုံး reasoning model။ ပိုကောင်းသော တွေးခေါ်မှုနှင့် token ချွေတာမှု။",
  },
  "gemini-3.1-flash-lite": {
    displayName: "Gemini 3.1 Flash-Lite",
    displayNameMM: "Gemini 3.1 Flash-Lite",
    provider: "google",
    tier: "flash",
    rpm: 30,
    tpm: 1000000,
    rpd: 1500,
    color: "hsl(170, 70%, 45%)",
    isNew: true,
    minTierLevel: 0,
    description: "Stable low-latency Gemini 3 family model for high-volume tasks.",
    descriptionMM: "အရေအတွက်များပြီး latency နိမ့်သော လုပ်ငန်းများအတွက် stable Gemini 3 family model။",
  },
  "gemini-3.1-flash-lite-preview": {
    displayName: "Gemini 3.1 Flash Lite",
    displayNameMM: "Gemini 3.1 Flash Lite",
    provider: "google",
    tier: "flash",
    rpm: 30,
    tpm: 1000000,
    rpd: 1500,
    color: "hsl(170, 70%, 45%)",
    isNew: true,
    isBeta: true,
    minTierLevel: 0,
    description: "Fastest 3.x model. Best for simple, high-volume tasks.",
    descriptionMM: "3.x series တွင် အမြန်ဆုံး။ ရိုးရှင်းပြီး အရေအတွက်များသော လုပ်ငန်းများအတွက် အကောင်းဆုံး။",
  },
  "gemini-3.1-flash-image-preview": {
    displayName: "Nano Banana 2",
    displayNameMM: "Nano Banana 2",
    provider: "google",
    tier: "flash",
    rpm: 10,
    tpm: 500000,
    rpd: 500,
    color: "hsl(35, 85%, 50%)",
    isNew: true,
    isBeta: true,
    minTierLevel: 0,
    description: "Next-gen AI image generation. Faster & higher quality.",
    descriptionMM: "နောက်မျိုးဆက် AI ပုံထုတ်လုပ်မှု။ ပိုမြန်ပြီး ပိုအရည်အသွေးကောင်း။",
  },
  "gemini-3-pro-image-preview": {
    displayName: "Nano Banana Pro",
    displayNameMM: "Nano Banana Pro",
    provider: "google",
    tier: "flash",
    rpm: 5,
    tpm: 100000,
    rpd: 100,
    color: "hsl(45, 80%, 55%)",
    isNew: true,
    minTierLevel: 1,
    description: "Highest quality AI image generation.",
    descriptionMM: "အရည်အသွေးအမြင့်ဆုံး AI ပုံထုတ်လုပ်မှု။",
  },

  // ═══ CLAUDE MODELS (Anthropic) ═══
  "claude-4-5-sonnet": {
    displayName: "Claude 4.5 Sonnet",
    displayNameMM: "Claude 4.5 Sonnet",
    provider: "anthropic",
    tier: "pro",
    rpm: 5,
    tpm: 100000,
    rpd: 100,
    color: "hsl(20, 70%, 55%)",
    minTierLevel: 1,
    description: "Eloquent and creative. Great for writing.",
    descriptionMM: "ကဗျာဆန်ပြီး ဖန်တီးနိုင်စွမ်းမြင့်။ စာရေးသားမှုအတွက် အကောင်းဆုံး။",
  },
  "claude-4-6-opus": {
    displayName: "Claude 4.6 Opus",
    displayNameMM: "Claude 4.6 Opus (The God Model)",
    provider: "anthropic",
    tier: "opus",
    rpm: 2,
    tpm: 50000,
    rpd: 50,
    color: "hsl(30, 80%, 50%)",
    isNew: true,
    minTierLevel: 2,
    description: "The God Model. Ultimate intelligence.",
    descriptionMM: "The God Model - အမြင့်ဆုံး ဉာဏ်ရည်။ Alpha tier exclusive။",
  },

};

// ═══ OPENROUTER MODELS ═══
export const OPENROUTER_MODELS: Record<string, AIModelInfo> = {
  // ═══ BeeBot-Compatible Models (verified tool-calling support) ═══
  "openai/gpt-4o": {
    displayName: "GPT-4o",
    displayNameMM: "GPT-4o",
    provider: "openrouter",
    tier: "pro",
    rpm: 10, tpm: 500000, rpd: 500,
    color: "hsl(140, 60%, 45%)",
    supportsTools: true,
    minTierLevel: 0,
    description: "OpenAI's multimodal flagship. BeeBot-compatible ✓",
  },
  "anthropic/claude-sonnet-4": {
    displayName: "Claude Sonnet 4",
    displayNameMM: "Claude Sonnet 4",
    provider: "openrouter",
    tier: "pro",
    rpm: 5, tpm: 200000, rpd: 200,
    color: "hsl(25, 70%, 50%)",
    supportsTools: true,
    minTierLevel: 0,
    description: "Anthropic's balanced model via OpenRouter. BeeBot-compatible ✓",
  },
  "qwen/qwen3.6-plus-preview:free": {
    displayName: "Qwen3.6 Plus Preview (Free)",
    displayNameMM: "Qwen3.6 Plus Preview (Free)",
    provider: "openrouter",
    tier: "pro",
    rpm: 10, tpm: 500000, rpd: 200,
    color: "hsl(190, 65%, 50%)",
    isFree: true,
    supportsTools: true,
    minTierLevel: 0,
    description: "Qwen's latest plus model. Free on OpenRouter. BeeBot-compatible ✓",
  },
};

// ═══ HELPER FUNCTIONS ═══

/**
 * Get display name for a model ID
 */
export function getModelDisplayName(modelId: string | undefined): string {
  if (!modelId) return "Default";
  return AI_MODELS[modelId]?.displayName || OPENROUTER_MODELS[modelId]?.displayName || modelId;
}

/**
 * Get Burmese display name for a model ID
 */
export function getModelDisplayNameMM(modelId: string | undefined): string {
  if (!modelId) return "Default";
  return AI_MODELS[modelId]?.displayNameMM || OPENROUTER_MODELS[modelId]?.displayNameMM || modelId;
}

/**
 * Get full model info for a model ID
 */
export function getModelInfo(modelId: string | undefined): AIModelInfo | null {
  if (!modelId) return null;
  return AI_MODELS[modelId] || OPENROUTER_MODELS[modelId] || null;
}

/**
 * Get model color for charts
 */
export function getModelColor(modelId: string | undefined): string {
  if (!modelId) return "hsl(var(--primary))";
  return AI_MODELS[modelId]?.color || OPENROUTER_MODELS[modelId]?.color || "hsl(var(--primary))";
}

/**
 * Get provider from model ID
 */
export function getModelProvider(modelId: string): AIProvider {
  if (modelId.startsWith('google/')) return 'google';
  if (modelId.startsWith('claude') && !modelId.startsWith('anthropic/')) return 'anthropic';
  if (modelId.includes('/')) return 'openrouter';
  return 'google';
}

/**
 * Get models available for a specific tier level
 */
export function getModelsByTierLevel(tierLevel: number): Record<string, AIModelInfo> {
  const result: Record<string, AIModelInfo> = {};
  for (const [id, model] of Object.entries(AI_MODELS)) {
    if (model.minTierLevel <= tierLevel) {
      result[id] = model;
    }
  }
  return result;
}

/**
 * Get models grouped by provider for a tier level
 */
export function getModelsGroupedByProvider(tierLevel: number): {
  google: Array<{ id: string } & AIModelInfo>;
  anthropic: Array<{ id: string } & AIModelInfo>;
  openrouter: Array<{ id: string } & AIModelInfo>;
} {
  const models = getModelsByTierLevel(tierLevel);
  const google: Array<{ id: string } & AIModelInfo> = [];
  const anthropic: Array<{ id: string } & AIModelInfo> = [];
  const openrouter: Array<{ id: string } & AIModelInfo> = [];
  
  for (const [id, model] of Object.entries(models)) {
    const entry = { id, ...model };
    if (model.provider === 'anthropic') {
      anthropic.push(entry);
    } else if (model.provider === 'openrouter') {
      openrouter.push(entry);
    } else {
      google.push(entry);
    }
  }

  // Add OpenRouter models (always available, filtered by UI connector state)
  for (const [id, model] of Object.entries(OPENROUTER_MODELS)) {
    openrouter.push({ id, ...model });
  }
  
  return { google, anthropic, openrouter };
}




/**
 * Check if a model is available for a tier
 */
export function isModelAvailableForTier(modelId: string, tierLevel: number): boolean {
  const model = AI_MODELS[modelId] || OPENROUTER_MODELS[modelId];
  if (!model) return false;
  return model.minTierLevel <= tierLevel;
}

// ═══ TIER DEFINITIONS ═══

export interface TierInfo {
  key: string;
  displayName: string;
  displayNameMM: string;
  icon: string;
  gradient: string;
  level: number;
}

export const TIERS: Record<string, TierInfo> = {
  explorer: {
    key: 'explorer',
    displayName: 'Explorer',
    displayNameMM: 'Explorer',
    icon: 'sparkles',
    gradient: 'from-slate-500 to-slate-400',
    level: 0,
  },
  analyst: {
    key: 'analyst',
    displayName: 'Analyst',
    displayNameMM: 'Analyst',
    icon: 'brain',
    gradient: 'from-primary to-blue-500',
    level: 1,
  },
  alpha: {
    key: 'alpha',
    displayName: 'Alpha',
    displayNameMM: 'Alpha',
    icon: 'crown',
    gradient: 'from-amber-500 to-orange-500',
    level: 2,
  },
  admin: {
    key: 'admin',
    displayName: 'Sovereign',
    displayNameMM: 'Sovereign',
    icon: 'shield',
    gradient: 'from-purple-600 to-violet-500',
    level: 3,
  },
};

export function getTierInfo(tierKey: string): TierInfo {
  return TIERS[tierKey] || TIERS.explorer;
}
