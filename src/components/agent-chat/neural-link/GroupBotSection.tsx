import { useState, useEffect, useRef, useCallback } from "react";
import { useDebounce } from "@/hooks/useDebounce";
import { GroupEtiquettePanel } from "./GroupEtiquettePanel";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { BotSettings, GroupBotVerifyResult } from "./types";

interface GroupBotSectionProps {
  userId: string;
  bot: BotSettings | null;
  setBot: (bot: BotSettings | null) => void;
  ownerDisplayName: string;
  groupBotWebhookActive: boolean;
  setGroupBotWebhookActive: (active: boolean) => void;
}


export function GroupBotSection({
  userId, bot, setBot, ownerDisplayName,
  groupBotWebhookActive, setGroupBotWebhookActive,
}: GroupBotSectionProps) {
  const [triggerWord, setTriggerWord] = useState(bot?.trigger_word || "");
  const [groupBotToken, setGroupBotToken] = useState(bot?.group_bot_token || "");
  const [groupBotUsername, setGroupBotUsername] = useState<string | null>(bot?.group_bot_username || null);
  const [groupBotName, setGroupBotName] = useState<string | null>(bot?.group_bot_name || null);
  const [isVerifyingGroupBot, setIsVerifyingGroupBot] = useState(false);
  const [groupBotVerifyResult, setGroupBotVerifyResult] = useState<GroupBotVerifyResult | null>(null);
  const [groupBotVerifyError, setGroupBotVerifyError] = useState<string | null>(null);
  const [isActivatingGroupBot, setIsActivatingGroupBot] = useState(false);
  const [groupBotCustomInstruction, setGroupBotCustomInstruction] = useState(bot?.group_bot_custom_instruction || "");
  const [groupBotActive, setGroupBotActive] = useState(bot?.group_bot_active !== false);
  const [groupBotAllowDm, setGroupBotAllowDm] = useState(bot?.group_bot_allow_dm === true);
  const [groupBotAllowWebSearch, setGroupBotAllowWebSearch] = useState(bot?.group_bot_allow_web_search === true);

  const [isSavingToken, setIsSavingToken] = useState(false);
  const [isSavingTrigger, setIsSavingTrigger] = useState(false);
  const [isSavingInstruction, setIsSavingInstruction] = useState(false);
  const [tokenSaved, setTokenSaved] = useState(false);
  const [tokenDirty, setTokenDirty] = useState(false);
  const [isDeletingGroupBot, setIsDeletingGroupBot] = useState(false);

  const prevBotId = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    if (!bot) return;
    const isNewBotRecord = bot.id !== prevBotId.current;
    prevBotId.current = bot.id;

    if (isNewBotRecord) {
      setTriggerWord(bot.trigger_word || "");
      setGroupBotToken(bot.group_bot_token || "");
      setGroupBotUsername(bot.group_bot_username || null);
      setGroupBotName(bot.group_bot_name || null);
      setGroupBotCustomInstruction(bot.group_bot_custom_instruction || "");
      setGroupBotActive(bot.group_bot_active !== false);
      setGroupBotAllowDm(bot.group_bot_allow_dm === true);
      setGroupBotAllowWebSearch(bot.group_bot_allow_web_search === true);
      setGroupBotVerifyResult(null);
      setGroupBotVerifyError(null);
      setTokenDirty(false);
    } else {
      if (!tokenDirty) setGroupBotToken(bot.group_bot_token || "");
      setTriggerWord(t => bot.trigger_word ?? t);
      setGroupBotUsername(bot.group_bot_username || null);
      setGroupBotName(bot.group_bot_name || null);
      setGroupBotActive(bot.group_bot_active !== false);
      setGroupBotAllowDm(bot.group_bot_allow_dm === true);
      setGroupBotAllowWebSearch(bot.group_bot_allow_web_search === true);
    }
  }, [bot]);

  const ensureBotRecord = useCallback(async (): Promise<string | null> => {
    if (bot?.id) return bot.id;
    try {
      const { data: existing } = await supabase
        .from("bot_settings")
        .select("*")
        .eq("user_id", userId)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();

      if (existing) {
        setBot(existing as BotSettings);
        return existing.id;
      }

      const { data: newBot, error } = await supabase
        .from("bot_settings")
        .insert({ user_id: userId, name: "Neural Link" })
        .select("*")
        .single();
      if (error) throw error;

      setBot(newBot as BotSettings);
      return newBot.id;
    } catch (e) {
      console.error("[GroupBot] ensureBotRecord failed:", e);
      toast.error("Could not initialize bot settings");
      return null;
    }
  }, [bot, userId, setBot]);

  const handleSaveToken = async () => {
    if (!groupBotToken.trim()) { toast.error("Enter a bot token first"); return; }
    setIsSavingToken(true);
    try {
      const botId = await ensureBotRecord();
      if (!botId) return;
      const { error } = await supabase.from("bot_settings").update({ group_bot_token: groupBotToken.trim() }).eq("id", botId);
      if (error) throw error;
      setTokenDirty(false);
      setTokenSaved(true);
      setTimeout(() => setTokenSaved(false), 2500);
      toast.success("Token saved ✓");
    } catch {
      toast.error("Failed to save token");
    } finally {
      setIsSavingToken(false);
    }
  };

  const debouncedTriggerWord = useDebounce(triggerWord, 800);
  const lastSavedTrigger = useRef<string>(bot?.trigger_word || "");
  useEffect(() => {
    if (debouncedTriggerWord === lastSavedTrigger.current) return;
    const saveTrigger = async () => {
      setIsSavingTrigger(true);
      try {
        const botId = await ensureBotRecord();
        if (!botId) return;
        const { error } = await supabase.from("bot_settings").update({ trigger_word: debouncedTriggerWord }).eq("id", botId);
        if (error) throw error;
        lastSavedTrigger.current = debouncedTriggerWord;
      } catch {
        toast.error("Failed to save trigger word");
      } finally {
        setIsSavingTrigger(false);
      }
    };
    saveTrigger();
  }, [debouncedTriggerWord, ensureBotRecord]);

  const debouncedInstruction = useDebounce(groupBotCustomInstruction, 1200);
  const lastSavedInstruction = useRef<string>(bot?.group_bot_custom_instruction || "");
  useEffect(() => {
    if (debouncedInstruction === lastSavedInstruction.current) return;
    const saveInstruction = async () => {
      setIsSavingInstruction(true);
      try {
        const botId = await ensureBotRecord();
        if (!botId) return;
        const { error } = await supabase.from("bot_settings").update({ group_bot_custom_instruction: debouncedInstruction || null }).eq("id", botId);
        if (error) throw error;
        lastSavedInstruction.current = debouncedInstruction;
      } catch {
        toast.error("Failed to save persona");
      } finally {
        setIsSavingInstruction(false);
      }
    };
    saveInstruction();
  }, [debouncedInstruction, ensureBotRecord]);

  const handleDeleteGroupBot = async () => {
    if (!bot?.id) { toast.error("No bot config to reset"); return; }
    setIsDeletingGroupBot(true);
    try {
      const { error } = await supabase.from("bot_settings").update({
        group_bot_token: null, group_bot_username: null, group_bot_name: null,
        group_bot_custom_instruction: null, group_bot_active: true,
        group_bot_allow_dm: false, group_bot_allow_web_search: false, trigger_word: null,
      }).eq("id", bot.id);
      if (error) throw error;

      setGroupBotToken(""); setGroupBotUsername(null); setGroupBotName(null);
      setGroupBotCustomInstruction(""); setGroupBotActive(true);
      setGroupBotAllowDm(false); setGroupBotAllowWebSearch(false);
      setTriggerWord(""); setGroupBotVerifyResult(null); setGroupBotVerifyError(null);
      setTokenDirty(false); setTokenSaved(false); setGroupBotWebhookActive(false);
      lastSavedTrigger.current = ""; lastSavedInstruction.current = "";
      toast.success("Group Bot config reset ✓");
    } catch {
      toast.error("Failed to reset Group Bot");
    } finally {
      setIsDeletingGroupBot(false);
    }
  };

  const handleToggleActive = async (active: boolean) => {
    setGroupBotActive(active);
    try {
      const botId = await ensureBotRecord();
      if (!botId) return;
      await supabase.from("bot_settings").update({ group_bot_active: active }).eq("id", botId);
    } catch { toast.error("Failed to save toggle"); }
  };

  const handleToggleDm = async (allow: boolean) => {
    setGroupBotAllowDm(allow);
    try {
      const botId = await ensureBotRecord();
      if (!botId) return;
      await supabase.from("bot_settings").update({ group_bot_allow_dm: allow }).eq("id", botId);
    } catch { toast.error("Failed to save toggle"); }
  };

  const handleToggleWebSearch = async (allow: boolean) => {
    setGroupBotAllowWebSearch(allow);
    try {
      const botId = await ensureBotRecord();
      if (!botId) return;
      await supabase.from("bot_settings").update({ group_bot_allow_web_search: allow }).eq("id", botId);
    } catch { toast.error("Failed to save toggle"); }
  };

  return (
    <GroupEtiquettePanel
      isIndependent={true}
      hasPersonalAssistant={!!bot?.telegram_bot_token}
      triggerWord={triggerWord}
      onTriggerWordChange={setTriggerWord}
      isSavingTrigger={isSavingTrigger}
      verifyResult={null}
      botId={bot?.id}
      hasBotToken={!!bot?.telegram_bot_token}
      groupBotToken={groupBotToken}
      onGroupBotTokenChange={(token) => {
        setGroupBotToken(token); setTokenDirty(true); setTokenSaved(false);
        setGroupBotVerifyResult(null); setGroupBotVerifyError(null);
      }}
      onSaveGroupBotToken={handleSaveToken}
      isSavingToken={isSavingToken}
      tokenSaved={tokenSaved}
      tokenDirty={tokenDirty}
      groupBotUsername={groupBotUsername}
      groupBotName={groupBotName}
      groupBotWebhookActive={groupBotWebhookActive}
      isVerifyingGroupBot={isVerifyingGroupBot}
      groupBotVerifyResult={groupBotVerifyResult}
      groupBotVerifyError={groupBotVerifyError}
      isActivatingGroupBot={isActivatingGroupBot}
      ownerDisplayName={ownerDisplayName}
      groupBotCustomInstruction={groupBotCustomInstruction}
      onGroupBotCustomInstructionChange={setGroupBotCustomInstruction}
      isSavingInstruction={isSavingInstruction}
      groupBotActive={groupBotActive}
      onGroupBotActiveChange={handleToggleActive}
      groupBotAllowDm={groupBotAllowDm}
      onGroupBotAllowDmChange={handleToggleDm}
      groupBotAllowWebSearch={groupBotAllowWebSearch}
      onGroupBotAllowWebSearchChange={handleToggleWebSearch}
      onDeleteGroupBot={handleDeleteGroupBot}
      isDeletingGroupBot={isDeletingGroupBot}
      onVerifyGroupBot={async () => {
        if (!groupBotToken.trim()) { toast.error("Please enter a Group Bot Token first"); return; }
        setIsVerifyingGroupBot(true); setGroupBotVerifyResult(null); setGroupBotVerifyError(null);
        try {
          const botId = await ensureBotRecord();
          if (!botId) return;
          await supabase.from("bot_settings").update({ group_bot_token: groupBotToken.trim() }).eq("id", botId);
          setTokenDirty(false);
          const { data, error } = await supabase.functions.invoke("telegram-webhook", {
            body: { action: "validate-group-token", bot_id: botId, group_bot_token: groupBotToken.trim() },
          });
          if (error) throw error;
          if (data?.ok) {
            setGroupBotVerifyResult({ bot_username: data.bot_username, bot_name: data.bot_name, can_join_groups: data.can_join_groups, can_read_all_group_messages: data.can_read_all_group_messages });
            setGroupBotUsername(data.bot_username); setGroupBotName(data.bot_name);
            await supabase.from("bot_settings").update({ group_bot_username: data.bot_username, group_bot_name: data.bot_name }).eq("id", botId);
            toast.success(`✅ Group Bot verified: @${data.bot_username}`);
          } else {
            setGroupBotVerifyError(data?.error || "Verification failed");
            toast.error(data?.error || "Group Bot verification failed");
          }
        } catch (err) {
          setGroupBotVerifyError(err instanceof Error ? err.message : "Network error");
          toast.error("Failed to verify Group Bot token");
        } finally { setIsVerifyingGroupBot(false); }
      }}
      onActivateGroupBot={async () => {
        if (!bot?.id) { toast.error("Bot settings not found"); return; }
        if (!groupBotUsername) { toast.error("Please verify your Group Bot first"); return; }
        setIsActivatingGroupBot(true);
        try {
          const { data, error } = await supabase.functions.invoke("telegram-webhook", {
            body: { action: "setup-group-webhook", bot_id: bot.id },
          });
          if (error) throw error;
          if (data?.ok) { setGroupBotWebhookActive(true); toast.success("🟢 Group Bot webhook activated!"); }
          else toast.error(data?.error || "Failed to activate Group Bot webhook");
        } catch { toast.error("Failed to activate Group Bot webhook"); }
        finally { setIsActivatingGroupBot(false); }
      }}
    />
  );
}
