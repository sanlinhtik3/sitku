import { useState, useEffect, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { BotSettings, BroadcastChannel, ChannelIdentity, ChatLog, BotSubscription, GroupBot } from "./types";



export function useNeuralLinkData(userId: string, open: boolean, isAdmin?: boolean) {
  const queryClient = useQueryClient();
  const [selectedBotId, setSelectedBotId] = useState<string | null>(null);
  const [ownerIdentity, setOwnerIdentity] = useState<ChannelIdentity | null>(null);
  const [ownerDisplayName, setOwnerDisplayName] = useState("");

  // Fetch all bots
  const {
    data: bots = [],
    isLoading: isLoadingBots,
    refetch: refetchBots,
  } = useQuery({
    queryKey: ['neural-link-bots', userId],
    queryFn: async () => {
      if (!userId) return [];
      const { data, error } = await supabase
        .from('bot_settings')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: true });
      if (error) throw error;
      return (data || []) as BotSettings[];
    },
    enabled: !!userId && open,
    staleTime: 30000,
  });

  // Fetch subscription
  const {
    data: subscription,
    isLoading: isLoadingSubscription,
    refetch: refetchSubscription,
  } = useQuery({
    queryKey: ['neural-link-subscription', userId],
    queryFn: async () => {
      if (!userId) return null;
      const { data, error } = await supabase
        .from('telegram_bot_subscriptions')
        .select('*')
        .eq('user_id', userId)
        .maybeSingle();
      if (error && error.code !== 'PGRST116') throw error;
      return data as BotSubscription | null;
    },
    enabled: !!userId && open,
    staleTime: 30000,
  });

  // AI user settings (shared key)
  const { data: aiSettings, refetch: refetchAISettings } = useQuery({
    queryKey: ['ai-user-settings-bot', userId],
    queryFn: async () => {
      if (!userId) return null;
      const { data, error } = await supabase
        .from('ai_user_settings')
        .select('gemini_api_key, gemini_model')
        .eq('user_id', userId)
        .maybeSingle();
      if (error && error.code !== 'PGRST116') throw error;
      return data;
    },
    enabled: !!userId && open,
    staleTime: 30000,
  });

  // Auto-select first bot
  useEffect(() => {
    if (bots.length > 0 && !selectedBotId) {
      setSelectedBotId(bots[0].id);
    }
    if (selectedBotId && !bots.find(b => b.id === selectedBotId)) {
      setSelectedBotId(bots.length > 0 ? bots[0].id : null);
    }
  }, [bots, selectedBotId]);

  const selectedBot = bots.find(b => b.id === selectedBotId) || null;

  // Fetch chat logs for selected bot
  const {
    data: chatLogs = [],
    isLoading: isLoadingLogs,
    refetch: refetchLogs,
  } = useQuery({
    queryKey: ['neural-link-chat-logs', selectedBotId],
    queryFn: async () => {
      if (!selectedBotId || !userId) return [];
      const { data, error } = await supabase
        .from('bot_chat_logs')
        .select('*')
        .eq('user_id', userId)
        .eq('bot_id', selectedBotId)
        .order('created_at', { ascending: false })
        .limit(100);
      if (error) throw error;
      return (data || []) as ChatLog[];
    },
    enabled: !!selectedBotId && open,
    staleTime: 30000,
  });

  // Fetch channels
  const {
    data: channels = [],
    isLoading: isLoadingChannels,
    refetch: refetchChannels,
  } = useQuery({
    queryKey: ['neural-link-channels', userId],
    queryFn: async () => {
      if (!userId) return [];
      const { data } = await supabase
        .from("broadcast_channels")
        .select("*")
        .eq("user_id", userId)
        .order("created_at", { ascending: false });
      return (data || []) as BroadcastChannel[];
    },
    enabled: !!userId && open,
    staleTime: 30000,
  });

  // Fetch group bots
  const {
    data: groupBots = [],
    isLoading: isLoadingGroupBots,
    refetch: refetchGroupBots,
  } = useQuery({
    queryKey: ['neural-link-group-bots', userId],
    queryFn: async () => {
      if (!userId) return [];
      const { data } = await supabase
        .from("group_bots")
        .select("*")
        .eq("user_id", userId)
        .order("created_at", { ascending: false });
      return (data || []) as GroupBot[];
    },
    enabled: !!userId && open,
    staleTime: 30000,
  });

  // Fetch owner identity & profile
  useEffect(() => {
    if (!userId || !open) return;
    const fetchIdentity = async () => {
      const [profileRes, identityRes] = await Promise.all([
        supabase.from("profiles").select("full_name").eq("user_id", userId).maybeSingle(),
        supabase.from("channel_identities").select("id, channel, external_username, is_verified").eq("user_id", userId).eq("channel", "telegram").maybeSingle(),
      ]);
      setOwnerDisplayName(profileRes.data?.full_name || "");
      setOwnerIdentity(identityRes.data as ChannelIdentity | null);
    };
    fetchIdentity();
  }, [userId, open]);

  // Everything is free — no restrictions
  const isSubscriptionActive = useCallback(() => true, []);
  const getRemainingTrialDays = useCallback(() => 0, []);
  const getMaxBots = useCallback(() => 999, []);
  const canCreateBot = useCallback(() => !!userId, [userId]);

  // Create bot mutation
  const createBotMutation = useMutation({
    mutationFn: async (input: { name: string; description?: string }) => {
      if (!userId) throw new Error("User not authenticated");
      if (!canCreateBot()) throw new Error("Cannot create more bots. Please upgrade.");

      const { data, error } = await supabase
        .from('bot_settings')
        .insert({
          user_id: userId,
          name: input.name,
          description: input.description || null,
          is_active: false,
          use_shared_key: true,
          allow_dm: false,
        })
        .select()
        .single();
      if (error) throw error;
      return data as BotSettings;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['neural-link-bots', userId] });
      queryClient.invalidateQueries({ queryKey: ['neural-link-subscription', userId] });
      setSelectedBotId(data.id);
      toast.success(`Bot "${data.name}" created!`);
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Failed to create bot");
    },
  });

  // Update bot mutation
  const updateBotMutation = useMutation({
    mutationFn: async (input: Partial<BotSettings> & { id: string }) => {
      if (!userId) throw new Error("User not authenticated");
      const { id, ...updateData } = input;
      const { error } = await supabase
        .from('bot_settings')
        .update({ ...updateData, updated_at: new Date().toISOString() })
        .eq('id', id)
        .eq('user_id', userId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['neural-link-bots', userId] });
      toast.success("Bot updated!");
    },
    onError: () => toast.error("Failed to update bot"),
  });

  // Delete bot mutation
  const deleteBotMutation = useMutation({
    mutationFn: async (botId: string) => {
      if (!userId) throw new Error("User not authenticated");
      const { error } = await supabase
        .from('bot_settings')
        .delete()
        .eq('id', botId)
        .eq('user_id', userId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['neural-link-bots', userId] });
      toast.success("Bot deleted!");
    },
    onError: () => toast.error("Failed to delete bot"),
  });

  // Toggle bot
  const toggleBotMutation = useMutation({
    mutationFn: async ({ botId, isActive }: { botId: string; isActive: boolean }) => {
      if (!userId) throw new Error("User not authenticated");
      const { error } = await supabase
        .from('bot_settings')
        .update({ is_active: isActive, updated_at: new Date().toISOString() })
        .eq('id', botId)
        .eq('user_id', userId);
      if (error) throw error;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['neural-link-bots', userId] });
      toast.success(variables.isActive ? "Bot activated!" : "Bot deactivated");
    },
    onError: () => toast.error("Failed to update bot status"),
  });

  const fetchAll = useCallback(async () => {
    await Promise.all([refetchBots(), refetchSubscription(), refetchChannels(), refetchLogs(), refetchAISettings(), refetchGroupBots()]);
  }, [refetchBots, refetchSubscription, refetchChannels, refetchLogs, refetchAISettings, refetchGroupBots]);

  // Derived
  const hasSharedKey = Boolean(aiSettings?.gemini_api_key);
  const sharedKeyModel = aiSettings?.gemini_model || 'gemini-3.5-flash';
  const isTokenSet = !!selectedBot?.telegram_bot_token;
  const isWebhookActive = !!selectedBot?.webhook_url && !!selectedBot?.is_active;
  const isOwnerLinked = !!ownerIdentity?.is_verified;
  const isLevel4 = isTokenSet && isWebhookActive && isOwnerLinked;

  return {
    // Bots
    bots,
    isLoadingBots,
    selectedBot,
    selectedBotId,
    setSelectedBotId,
    createBot: createBotMutation.mutateAsync,
    isCreatingBot: createBotMutation.isPending,
    updateBot: updateBotMutation.mutateAsync,
    isUpdatingBot: updateBotMutation.isPending,
    deleteBot: deleteBotMutation.mutateAsync,
    isDeletingBot: deleteBotMutation.isPending,
    toggleBot: toggleBotMutation.mutateAsync,
    isTogglingBot: toggleBotMutation.isPending,

    // Subscription
    subscription,
    isLoadingSubscription,
    isSubscriptionActive: isSubscriptionActive(),
    remainingTrialDays: getRemainingTrialDays(),
    maxBots: getMaxBots(),
    canCreateBot: canCreateBot(),

    // Chat logs
    chatLogs,
    isLoadingLogs,

    // Channels
    channels: channels as BroadcastChannel[],
    isLoadingChannels,

    // Group bots
    groupBots: groupBots as GroupBot[],
    isLoadingGroupBots,

    // AI settings
    hasSharedKey,
    sharedKeyModel,

    // Identity
    ownerIdentity, setOwnerIdentity,
    ownerDisplayName,

    // Status
    isTokenSet, isWebhookActive, isOwnerLinked, isLevel4,

    // Actions
    fetchAll,
  };
}
