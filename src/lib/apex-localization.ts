// ═══════════════════════════════════════════════════════════════════════════
// ZoeCrypto "Apex" Elite Burmese Localization
// Professional messaging for dual-core AI system
// ═══════════════════════════════════════════════════════════════════════════

export const APEX_MESSAGES = {
  // ═══ TIER IDENTITY MESSAGES ═══
  tiers: {
    explorer: {
      greeting: "Explorer Tier မှ ကြိုဆိုပါတယ်။ Gemini Flash ဖြင့် စူးစမ်းလေ့လာနိုင်ပါပြီ။",
      limit: "Explorer Tier အတွက် IU 10 ခုသာ ခွင့်ပြုထားပါသည်။",
      upgrade: "Analyst Tier သို့ upgrade လုပ်ပြီး Gemini 3 နှင့် Claude ကို အသုံးပြုပါ။",
    },
    analyst: {
      greeting: "Analyst Tier အသုံးပြုသူဖြစ်ပါသည်။ Gemini 3 နှင့် Claude Sonnet တို့ကို High Priority ဖြင့် အသုံးပြုနိုင်ပါပြီ။",
      limit: "Analyst Tier အတွက် IU 200 ခု ရရှိပါသည်။",
      upgrade: "Alpha Tier သို့ upgrade လုပ်ပြီး Claude 4.6 Opus ကို unlimited သုံးပါ။",
    },
    alpha: {
      greeting: "Alpha Tier အသုံးပြုသူဖြစ်သည့်အတွက် Claude 4.6 Opus ၏ အဆင့်မြင့်ဆုံး ဉာဏ်ရည်ကို Quantum Priority Lane မှ အသုံးပြုနေပါသည်။",
      limit: "Alpha Tier - Fair Use Unlimited ဖြစ်ပါသည်။",
      upgrade: null,
    },
    admin: {
      greeting: "Sovereign Tier - Dedicated Lane မှ unlimited access ရရှိနေပါသည်။ ကမ္ဘာ့အကောင်းဆုံး AI models အားလုံး သင့်အတွက် အဆင်သင့်ဖြစ်ပါသည်။",
      limit: "Sovereign Tier - No Limits",
      upgrade: null,
    },
  },

  // ═══ MODEL STATUS MESSAGES ═══
  modelActive: {
    "gemini-2.5-flash-lite": "Gemini Flash Lite ၏ အမြန်ဆုံး မုဒ်ဖြင့် ဖြေဆိုနေပါသည်။",
    "gemini-2.5-flash": "Gemini 2.5 Flash ၏ ဟန်ချက်ညီသော စွမ်းရည်ဖြင့် ဖြေဆိုနေပါသည်။",
    "gemini-2.5-pro": "Gemini 2.5 Pro ၏ အဆင့်မြင့် reasoning ဖြင့် ခွဲခြမ်းစိတ်ဖြာနေပါသည်။",
    "gemini-3.5-flash": "Gemini 3.5 Flash ၏ stable agentic အမြန်နှုန်းဖြင့် ဖြေဆိုနေပါသည်။",
    "gemini-3-flash-preview": "Gemini 3 Flash ၏ နောက်ဆုံးပေါ် အမြန်နှုန်းဖြင့် ဖြေဆိုနေပါသည်။",
    "gemini-3.1-pro-preview": "Gemini 3.1 Pro ၏ အဆင့်မြင့် reasoning ဖြင့် ခွဲခြမ်းစိတ်ဖြာနေပါသည်။",
    "claude-4-5-sonnet": "Claude 4.5 Sonnet ၏ ကဗျာဆန်သော ဉာဏ်ရည်ဖြင့် ဖန်တီးနေပါသည်။",
    "claude-4-6-opus": "Claude 4.6 Opus - The God Model ၏ အမြင့်ဆုံး ဉာဏ်ရည်ကို အသုံးပြုနေပါသည်။",
  },

  // ═══ PRIORITY LANE MESSAGES ═══
  priority: {
    standard: "Standard Lane မှ ဝန်ဆောင်မှုပေးနေပါသည်။",
    high: "High Priority Lane မှ ဝန်ဆောင်မှုပေးနေပါသည်။",
    quantum: "Quantum Priority Lane မှ ဝန်ဆောင်မှုပေးနေပါသည်။",
    dedicated: "Dedicated Lane - သီးသန့် channel မှ ဝန်ဆောင်မှုပေးနေပါသည်။",
  },

  // ═══ ERROR MESSAGES ═══
  errors: {
    insufficient_iu: "Intelligence Units ကုန်ဆုံးသွားပါပြီ။ နက်ဖြန် Reset ကျပါလိမ့်မယ်။",
    model_access_denied: "ဤ AI Model ကို သင့် Tier တွင် အသုံးပြုခွင့် မရှိပါ။ Upgrade လုပ်ပါ။",
    api_key_missing: "Admin မှ API Key configure မလုပ်ရသေးပါ။",
    google_key_missing: "Google Gemini API Key မရှိသေးပါ။ Admin Panel မှ configure လုပ်ပါ။",
    anthropic_key_missing: "Anthropic Claude API Key မရှိသေးပါ။ Admin Panel မှ configure လုပ်ပါ။",
    rate_limited: "Request များ များလွန်းပါသည်။ ခဏစောင့်ပြီး ပြန်ကြိုးစားပါ။",
    network_error: "ကွန်ရက် ပြဿနာရှိနေပါသည်။ ခဏစောင့်ပြီး ပြန်ကြိုးစားပါ။",
  },

  // ═══ SUCCESS MESSAGES ═══
  success: {
    model_changed: "AI Model ပြောင်းလဲပြီးပါပြီ။",
    tier_upgraded: "🎉 အဆင့်မြင့်တင်မှု အောင်မြင်ပါပြီ။",
    iu_purchased: "Intelligence Units ဝယ်ယူပြီးပါပြီ။",
    api_key_saved: "API Key သိမ်းဆည်းပြီးပါပြီ။",
  },

  // ═══ UI LABELS ═══
  ui: {
    selectModel: "Model ရွေးပါ",
    geminiModels: "Gemini (Google)",
    claudeModels: "Claude (Anthropic)",
    dailyIU: "နေ့စဉ် IU",
    bonusIU: "Bonus IU",
    balanceIU: "Balance IU",
    refreshesIn: "Reset ကျမည်",
    unlimited: "Unlimited",
    new: "NEW",
    beta: "BETA",
    theGodModel: "The God Model",
    quantumPriority: "Quantum Priority",
    dedicatedLane: "Dedicated Lane",
  },

  // ═══ PROVIDER LABELS ═══
  providers: {
    google: {
      name: "Google",
      description: "Gemini AI Models - Fast & Reliable",
      descriptionMM: "Gemini AI Models - မြန်ဆန်ပြီး ယုံကြည်စိတ်ချရ",
    },
    anthropic: {
      name: "Anthropic",
      description: "Claude AI Models - Creative & Intelligent",
      descriptionMM: "Claude AI Models - ဖန်တီးနိုင်စွမ်းမြင့်ပြီး ဉာဏ်ရည်ထက်",
    },
  },
};

/**
 * Get tier message by tier key
 */
export function getTierMessage(tierKey: string, type: 'greeting' | 'limit' | 'upgrade'): string {
  const tier = APEX_MESSAGES.tiers[tierKey as keyof typeof APEX_MESSAGES.tiers];
  if (!tier) return APEX_MESSAGES.tiers.explorer[type] || '';
  return tier[type] || '';
}

/**
 * Get model active message
 */
export function getModelActiveMessage(modelId: string): string {
  return APEX_MESSAGES.modelActive[modelId as keyof typeof APEX_MESSAGES.modelActive] 
    || `${modelId} model ဖြင့် ဖြေဆိုနေပါသည်။`;
}

/**
 * Get priority lane message
 */
export function getPriorityMessage(priorityLevel: number): string {
  switch (priorityLevel) {
    case 0: return APEX_MESSAGES.priority.standard;
    case 1: return APEX_MESSAGES.priority.high;
    case 2: return APEX_MESSAGES.priority.quantum;
    case 3: return APEX_MESSAGES.priority.dedicated;
    default: return APEX_MESSAGES.priority.standard;
  }
}

/**
 * Get error message by key
 */
export function getErrorMessage(errorKey: string): string {
  return APEX_MESSAGES.errors[errorKey as keyof typeof APEX_MESSAGES.errors] 
    || "တစ်ခုခု မှားယွင်းနေပါသည်။";
}

/**
 * Format IU remaining message
 */
export function formatIURemainingMessage(remaining: number, limit: number): string {
  if (limit === -1) return "Unlimited";
  return `${remaining.toFixed(1)} / ${limit} IU`;
}

/**
 * Format countdown message for reset time
 */
export function formatResetCountdown(resetsAt: string): string {
  const reset = new Date(resetsAt);
  const now = new Date();
  const diffMs = Math.max(0, reset.getTime() - now.getTime());
  const hours = Math.floor(diffMs / (1000 * 60 * 60));
  const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
}
