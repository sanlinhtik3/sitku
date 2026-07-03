import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

export interface SRTUserSettings {
  id: string;
  user_id: string;
  gemini_api_key: string | null;
  gemini_model: string;
  allow_gateway_fallback: boolean;
  total_translations: number;
  last_translation_at: string | null;
  granted_at: string | null;
  granted_by: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface SRTGlobalSettings {
  id: string;
  allow_personal_api_key: boolean;
  allow_gateway_access: boolean;
  gateway_model: string;
  updated_at: string;
  updated_by: string | null;
}

export const GEMINI_MODELS = [
  // Gemini 3 (Latest)
  { id: "gemini-3.5-flash", name: "Gemini 3.5 Flash", nameNative: "Stable + မြန်ဆန်သော Agentic Model", tier: "flash", icon: "🚀" },
  { id: "gemini-3-flash-preview", name: "Gemini 3 Flash", nameNative: "အသစ်ဆုံး + အမြန်ဆုံး", tier: "flash", icon: "🚀" },
  { id: "gemini-3.1-pro-preview", name: "Gemini 3.1 Pro", nameNative: "အသစ်ဆုံး Reasoning", tier: "pro", icon: "🧠" },
  { id: "gemini-3.1-flash-lite", name: "Gemini 3.1 Flash-Lite", nameNative: "Stable + High Volume", tier: "flash", icon: "💨" },
  // Gemini 2.5 (Stable)
  { id: "gemini-2.5-flash", name: "Gemini 2.5 Flash", nameNative: "မြန်ဆန် + ကောင်းမွန်", tier: "flash", icon: "⚡" },
  { id: "gemini-2.5-flash-lite", name: "Gemini 2.5 Flash Lite", nameNative: "အမြန်ဆုံး + စျေးအသက်သာဆုံး", tier: "flash", icon: "💨" },
  { id: "gemini-2.5-pro", name: "Gemini 2.5 Pro", nameNative: "အကောင်းဆုံး Reasoning", tier: "pro", icon: "🌟" },
];

export function useSRTSettings() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  // Fetch global settings
  const { data: globalSettings, isLoading: globalLoading } = useQuery({
    queryKey: ["srt-global-settings"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("srt_global_settings")
        .select("*")
        .single();
      
      if (error) throw error;
      return data as SRTGlobalSettings;
    },
  });

  // Fetch user settings (excluding API key for security)
  const { data: userSettings, isLoading: userLoading } = useQuery({
    queryKey: ["srt-user-settings", user?.id],
    queryFn: async () => {
      if (!user?.id) return null;
      
      // Use RPC to check if key exists (never fetch actual key)
      const { data: hasKey } = await supabase.rpc('check_user_has_srt_api_key', {
        p_user_id: user.id
      });
      
      // Fetch settings WITHOUT the API key
      const { data, error } = await supabase
        .from("srt_user_settings")
        .select("id, user_id, gemini_model, allow_gateway_fallback, total_translations, last_translation_at, granted_at, granted_by, notes, created_at, updated_at")
        .eq("user_id", user.id)
        .maybeSingle();
      
      if (error) throw error;
      
      // Return with hasKey boolean instead of actual key
      return data ? {
        ...data,
        gemini_api_key: hasKey ? 'EXISTS' : null, // Indicate key exists without exposing it
      } as SRTUserSettings : null;
    },
    enabled: !!user?.id,
  });

  // Save user settings mutation
  const saveSettings = useMutation({
    mutationFn: async (settings: { gemini_api_key?: string; gemini_model?: string }) => {
      if (!user?.id) throw new Error("Not authenticated");

      const { data: existing } = await supabase
        .from("srt_user_settings")
        .select("id")
        .eq("user_id", user.id)
        .maybeSingle();

      if (existing) {
        const { error } = await supabase
          .from("srt_user_settings")
          .update({
            ...settings,
            updated_at: new Date().toISOString(),
          })
          .eq("user_id", user.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("srt_user_settings")
          .insert({
            user_id: user.id,
            gemini_api_key: settings.gemini_api_key || null,
            gemini_model: settings.gemini_model || "gemini-3.5-flash",
          });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["srt-user-settings"] });
      toast.success("Settings saved successfully!");
    },
    onError: (error: any) => {
      toast.error("Failed to save settings: " + error.message);
    },
  });

  // Delete API key mutation
  const deleteApiKey = useMutation({
    mutationFn: async () => {
      if (!user?.id) throw new Error("Not authenticated");

      const { error } = await supabase
        .from("srt_user_settings")
        .update({
          gemini_api_key: null,
          updated_at: new Date().toISOString(),
        })
        .eq("user_id", user.id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["srt-user-settings"] });
      toast.success("API Key deleted");
    },
    onError: (error: any) => {
      toast.error("Failed to delete API key: " + error.message);
    },
  });

  // Test API key
  const testApiKey = async (apiKey: string): Promise<{ success: boolean; error?: string }> => {
    try {
      const { data, error } = await supabase.functions.invoke("verify-api-key", {
        body: { provider: "gemini", key: apiKey },
      });
      if (error) throw error;
      if (data?.ok) return { success: true };
      return { success: false, error: data?.error || "Invalid API key" };
    } catch (err: any) {
      return { success: false, error: err.message || "Connection error" };
    }
  };

  // Determine current AI mode
  const getAIMode = (): { mode: "personal" | "gateway" | "none"; model: string | null; message: string; messageEN: string } => {
    // Check if user has a key using the 'EXISTS' marker from our secure query
    const hasPersonalKey = userSettings?.gemini_api_key === 'EXISTS';
    const gatewayEnabled = globalSettings?.allow_gateway_access && userSettings?.allow_gateway_fallback !== false;

    if (hasPersonalKey) {
      return {
        mode: "personal",
        model: userSettings?.gemini_model || "gemini-3.5-flash",
        message: "🔑 ကိုယ်ပိုင် API Key သုံးနေပါသည်",
        messageEN: "Using Personal API Key",
      };
    } else if (gatewayEnabled) {
      return {
        mode: "gateway",
        model: globalSettings?.gateway_model || "gemini-3.5-flash",
        message: "📡 App Gateway သုံးနေပါသည်",
        messageEN: "Using App Gateway",
      };
    } else {
      return {
        mode: "none",
        model: null,
        message: "⚠️ ကိုယ်ပိုင် API Key ထည့်ပါ",
        messageEN: "Add Personal API Key",
      };
    }
  };

  return {
    globalSettings,
    userSettings,
    isLoading: globalLoading || userLoading,
    saveSettings,
    deleteApiKey,
    testApiKey,
    getAIMode,
  };
}
