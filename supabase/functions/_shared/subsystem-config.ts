// ═══════════════════════════════════════════════════════════════
// Subsystem AI Model Override Resolver
// Reads ai_subsystem_overrides + ai_user_settings and returns the
// effective {provider, model, apiKey, endpoint} for a given subsystem.
// Falls back gracefully when no override is configured.
// ═══════════════════════════════════════════════════════════════

import { GEMINI_OPENAI_ENDPOINT, OPENROUTER_ENDPOINT } from "./api-endpoints.ts";

export type SubsystemKey = "automate" | "consultant" | "flowstate";
export type SubsystemProvider = "google" | "openrouter";

export interface SubsystemConfig {
  provider: SubsystemProvider;
  model: string;
  apiKey: string;
  apiEndpoint: string;
  source: "user_override" | "default";
}

interface DefaultsBySubsystem {
  automate: { provider: SubsystemProvider; model: string };
  consultant: { provider: SubsystemProvider; model: string };
  flowstate: { provider: SubsystemProvider; model: string };
}

const DEFAULTS: DefaultsBySubsystem = {
  automate: { provider: "google", model: "gemini-3.5-flash" },
  consultant: { provider: "google", model: "gemini-3.5-flash" },
  flowstate: { provider: "google", model: "gemini-3.5-flash" },
};

/**
 * Resolve the effective AI config for a given subsystem.
 * @param supabase service-role client
 * @param userId target user
 * @param subsystem one of automate | consultant | flowstate
 * @param systemKeys fallback system keys when user has no personal key. OpenRouter always requires user or subsystem key.
 */
export async function loadSubsystemConfig(
  supabase: any,
  userId: string,
  subsystem: SubsystemKey,
  systemKeys: { google?: string | null } = {},
): Promise<SubsystemConfig> {
  let provider: SubsystemProvider = DEFAULTS[subsystem].provider;
  let model = DEFAULTS[subsystem].model;
  let source: SubsystemConfig["source"] = "default";
  let subsystemOwnKey: string | null = null;

  try {
    const { data: override } = await supabase
      .from("ai_subsystem_overrides")
      .select("provider, model, enabled, api_key")
      .eq("user_id", userId)
      .eq("subsystem", subsystem)
      .maybeSingle();
    if (override?.enabled && override.provider && override.model) {
      provider = override.provider === "openrouter" ? "openrouter" : "google";
      model = override.model;
      source = "user_override";
      if (override.api_key && typeof override.api_key === "string") {
        subsystemOwnKey = override.api_key;
      }
    }
  } catch (_) {
    // table may not yet be visible to PostgREST cache — fall back silently
  }

  // Resolve API key:
  //  1) Subsystem's own dedicated key (if set)
  //  2) User's main personal key
  //  3) System fallback
  let apiKey = "";
  try {
    const { data: settings } = await supabase
      .from("ai_user_settings")
      .select("gemini_api_key")
      .eq("user_id", userId)
      .maybeSingle();
    if (provider === "google") {
      apiKey = subsystemOwnKey || settings?.gemini_api_key || systemKeys.google || "";
    } else {
      const { data: openrouterKey } = await supabase
        .from("user_api_keys")
        .select("api_key_encrypted")
        .eq("user_id", userId)
        .eq("provider", "openrouter")
        .eq("is_active", true)
        .maybeSingle();
      apiKey = subsystemOwnKey || openrouterKey?.api_key_encrypted || "";
    }
  } catch (_) {
    apiKey = subsystemOwnKey || (provider === "google" ? (systemKeys.google || "") : "");
  }

  const apiEndpoint = provider === "openrouter" ? OPENROUTER_ENDPOINT : GEMINI_OPENAI_ENDPOINT;

  return { provider, model, apiKey, apiEndpoint, source };
}
