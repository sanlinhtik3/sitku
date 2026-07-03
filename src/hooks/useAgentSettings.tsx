import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface AgentSettings {
  id: string;
  user_id: string;
  bot_name: string;
  bot_emoji: string;
  personality_mode: string;
  personality_level: string; // 'normal' | 'sassy' | 'roast'
  welcome_shown: boolean;
  custom_instructions: string | null;
  preferred_language: string;
  created_at: string;
  updated_at: string;
}

export function useAgentSettings(userId: string | undefined) {
  const queryClient = useQueryClient();

  const { data: settings, isLoading, refetch } = useQuery({
    queryKey: ["agent-settings", userId],
    queryFn: async () => {
      if (!userId) return null;
      
      const { data, error } = await supabase
        .from("user_agent_settings")
        .select("*")
        .eq("user_id", userId)
        .single();

      if (error && error.code !== "PGRST116") {
        console.error("Error fetching agent settings:", error);
        return null;
      }

      return data as AgentSettings | null;
    },
    enabled: !!userId,
    staleTime: 1000 * 60 * 5, // 5 minutes
  });

  const updateSettings = useMutation({
    mutationFn: async (updates: Partial<AgentSettings>) => {
      if (!userId) throw new Error("No user ID");

      const { error } = await supabase
        .from("user_agent_settings")
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq("user_id", userId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["agent-settings", userId] });
    },
  });

  return {
    settings,
    isLoading,
    refetch,
    updateSettings: updateSettings.mutateAsync,
    isUpdating: updateSettings.isPending,
    // Computed values with defaults
    botName: settings?.bot_name || "BeeBot",
    botEmoji: settings?.bot_emoji || "🐝",
    personalityMode: settings?.personality_mode || "friendly",
    personalityLevel: settings?.personality_level || "normal",
  };
}
