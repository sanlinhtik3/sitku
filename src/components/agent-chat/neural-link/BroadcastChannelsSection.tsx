import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { ChannelTasksPanel } from "./ChannelTasksPanel";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Switch } from "@/components/ui/switch";
import {
  Megaphone, Plus, Hash, Star, Trash2, Radio, Send,
  ShieldCheck, AlertCircle, Loader2, CheckCircle2, Users,
  Eye, EyeOff, Bot, Lock
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { BroadcastChannel, ChannelVerifyResult } from "./types";

interface VerifyResultExtended extends ChannelVerifyResult {
  resolved_bot_id?: string;
  token_source?: string;
}

interface BroadcastChannelsSectionProps {
  userId: string;
  botId: string | undefined;
  channels: BroadcastChannel[];
  isLoadingChannels: boolean;
  fetchAll: () => Promise<void>;
}

export function BroadcastChannelsSection({ userId, botId, channels, isLoadingChannels, fetchAll }: BroadcastChannelsSectionProps) {
  const [showAddChannel, setShowAddChannel] = useState(false);
  const [newChannelId, setNewChannelId] = useState("");
  const [isVerifyingChannel, setIsVerifyingChannel] = useState(false);
  const [channelVerifyResult, setChannelVerifyResult] = useState<VerifyResultExtended | null>(null);
  const [channelVerifyError, setChannelVerifyError] = useState<string | null>(null);
  const [isSavingChannel, setIsSavingChannel] = useState(false);
  const [deletingChannelId, setDeletingChannelId] = useState<string | null>(null);
  const [useDedicatedBot, setUseDedicatedBot] = useState(false);
  const [dedicatedBotToken, setDedicatedBotToken] = useState("");
  const [showDedicatedToken, setShowDedicatedToken] = useState(false);

  // Test post state
  const [testPostChannelId, setTestPostChannelId] = useState<string | null>(null);
  const [testPostMessage, setTestPostMessage] = useState("");
  const [isSendingTestPost, setIsSendingTestPost] = useState(false);
  const [testPostResult, setTestPostResult] = useState<{ channelId: string; success: boolean; message: string } | null>(null);
  const testInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (testPostChannelId && testInputRef.current) {
      setTimeout(() => testInputRef.current?.focus(), 100);
    }
  }, [testPostChannelId]);

  // Derive the preferred broadcast bot: stored bot_token > bot_settings_id > selected bot
  const getPreferredBroadcastBot = (): { id: string | null; username?: string; token?: string } | null => {
    // 1. Check existing channels for a stored bot_token (highest priority - actual working token)
    const defaultWithToken = channels.find(ch => ch.is_default && ch.bot_token);
    if (defaultWithToken?.bot_token) return { id: defaultWithToken.bot_settings_id || null, username: defaultWithToken.bot_username || undefined, token: defaultWithToken.bot_token };
    const anyWithToken = channels.find(ch => ch.bot_token);
    if (anyWithToken?.bot_token) return { id: anyWithToken.bot_settings_id || null, username: anyWithToken.bot_username || undefined, token: anyWithToken.bot_token };
    // 2. Check existing channels for bot_username (even without token, for display)
    const anyWithUsername = channels.find(ch => ch.bot_username);
    if (anyWithUsername) return { id: anyWithUsername.bot_settings_id || null, username: anyWithUsername.bot_username || undefined };
    // 3. Fall back to selected bot
    if (botId) return { id: botId };
    return null;
  };

  const preferredBot = getPreferredBroadcastBot();
  const effectiveBotId = preferredBot?.id || botId;
  const effectiveBotUsername = preferredBot?.username;
  const existingChannelBotToken = preferredBot?.token;

  const handleVerifyChannel = async () => {
    if (!newChannelId.trim()) return;
    // Must have either a token or a bot_id to verify
    if (!effectiveBotId && !existingChannelBotToken) return;
    setIsVerifyingChannel(true); setChannelVerifyResult(null); setChannelVerifyError(null);
    try {
      const body: Record<string, string> = { action: "verify-channel", channel_id: newChannelId.trim() };
      if (effectiveBotId) body.bot_id = effectiveBotId;
      if (existingChannelBotToken) body.existing_channel_bot_token = existingChannelBotToken;
      if (useDedicatedBot && dedicatedBotToken.trim()) body.dedicated_bot_token = dedicatedBotToken.trim();
      const { data, error } = await supabase.functions.invoke("telegram-webhook", { body });
      if (error) throw error;
      if (data?.ok) {
        setChannelVerifyResult(data as VerifyResultExtended);
        if (!data.is_admin) toast.warning(`Bot @${data.bot_username || 'unknown'} is not admin in this channel (source: ${data.token_source || 'unknown'})`);
        else if (!data.can_post_messages) toast.warning("Bot cannot post messages");
        else toast.success(`Verified! @${data.bot_username || "Bot"} is authorized for ${data.channel_name}`);
      } else setChannelVerifyError(data?.error || "Verification failed");
    } catch { setChannelVerifyError("Network error"); }
    finally { setIsVerifyingChannel(false); }
  };

  const handleSaveChannel = async () => {
    if (!channelVerifyResult) return;
    setIsSavingChannel(true);
    try {
      const insertPayload: any = {
        user_id: userId, channel_id: channelVerifyResult.channel_id,
        channel_name: channelVerifyResult.channel_name, channel_type: channelVerifyResult.channel_type,
        is_active: true, is_default: channels.length === 0,
      };
      // Always persist the bot binding
      if (channelVerifyResult.resolved_bot_id) {
        insertPayload.bot_settings_id = channelVerifyResult.resolved_bot_id;
      }
      if (channelVerifyResult.bot_username) {
        insertPayload.bot_username = channelVerifyResult.bot_username;
      }
      if (useDedicatedBot && dedicatedBotToken.trim()) {
        insertPayload.bot_token = dedicatedBotToken.trim();
      } else if (existingChannelBotToken) {
        // Carry over the working bot_token from existing channels
        insertPayload.bot_token = existingChannelBotToken;
      }
      const { error } = await supabase.from("broadcast_channels").upsert(insertPayload, { onConflict: "user_id,channel_id" });
      if (error) throw error;
      toast.success(`Channel "${channelVerifyResult.channel_name}" added!`);
      setShowAddChannel(false); setNewChannelId(""); setChannelVerifyResult(null);
      setUseDedicatedBot(false); setDedicatedBotToken(""); setShowDedicatedToken(false);
      fetchAll();
    } catch { toast.error("Failed to save channel"); }
    finally { setIsSavingChannel(false); }
  };

  const handleDeleteChannel = async (id: string) => {
    setDeletingChannelId(id);
    try { await supabase.from("broadcast_channels").delete().eq("id", id).eq("user_id", userId); toast.success("Channel removed"); fetchAll(); }
    catch { toast.error("Failed to remove channel"); }
    finally { setDeletingChannelId(null); }
  };

  const handleSetDefault = async (id: string) => {
    await supabase.from("broadcast_channels").update({ is_default: false }).eq("user_id", userId);
    await supabase.from("broadcast_channels").update({ is_default: true }).eq("id", id);
    toast.success("Default channel updated"); fetchAll();
  };

  const handleTestPost = async (channelId: string) => {
    if (!testPostMessage.trim()) return;
    setIsSendingTestPost(true); setTestPostResult(null);
    try {
      const { data, error } = await supabase.functions.invoke("telegram-webhook", { body: { action: "test-post", channel_id: channelId, message: testPostMessage.trim() } });
      if (error) throw error;
      if (data?.ok && data?.message_id) {
        setTestPostResult({ channelId, success: true, message: `Signal Received (ID: ${data.message_id})` });
        toast.success(`✅ Test post verified in ${data.channel_name || channelId}`);
      } else {
        const errMsg = `Error ${data?.error_code || '?'}: ${data?.description || data?.error || 'Unknown error'}`;
        setTestPostResult({ channelId, success: false, message: errMsg }); toast.error(errMsg);
      }
    } catch (err: any) {
      setTestPostResult({ channelId, success: false, message: err.message || "Network error" }); toast.error("Test post failed");
    } finally { setIsSendingTestPost(false); setTimeout(() => setTestPostResult(null), 8000); }
  };

  return (
    <Card className="bg-card/50 backdrop-blur-sm border-border/50 overflow-hidden">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-cyan-500 to-blue-500 flex items-center justify-center">
            <Megaphone className="h-4 w-4 text-white" />
          </div>
          Broadcast Channels
          <Badge className="text-[8px] px-1.5 py-0 h-3.5 bg-muted/60 text-cyan-400 border-border/40 font-medium rounded-full">
            {channels.length} linked
          </Badge>
        </CardTitle>
        <p className="text-[10px] text-muted-foreground">Channels where BeeBot can publish content on your behalf.</p>
      </CardHeader>
      <CardContent className="space-y-3 pt-0">

      {isLoadingChannels ? (
        <div className="flex items-center justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
      ) : (
        <>
          {channels.length === 0 && !showAddChannel ? (
            <div className="text-center py-6">
              <div className="h-12 w-12 rounded-2xl bg-muted/30 flex items-center justify-center mx-auto mb-3"><Radio className="h-6 w-6 text-muted-foreground" /></div>
              <p className="text-xs text-muted-foreground mb-3">No broadcast channels linked</p>
            </div>
          ) : (
            <ScrollArea className="max-h-[250px]">
              <div className="space-y-2">
                {channels.map((ch) => (
                  <div key={ch.id} className="space-y-0">
                    <div className="group flex items-center gap-3 p-3 rounded-xl bg-card/30 border border-border/30 hover:border-cyan-500/20 transition-all">
                      <div className="h-9 w-9 rounded-lg bg-cyan-500/15 flex items-center justify-center shrink-0">
                        {ch.bot_username ? <Bot className="h-4 w-4 text-cyan-500" /> : <Hash className="h-4 w-4 text-cyan-500" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs font-medium truncate">{ch.channel_name}</span>
                          {ch.is_default && <Badge className="text-[9px] px-1 py-0 h-3.5 bg-amber-500/10 text-amber-500 border-amber-500/20"><Star className="h-2 w-2 mr-0.5" />Default</Badge>}
                          {ch.bot_username && <Badge className="text-[9px] px-1.5 py-0 h-3.5 bg-cyan-500/10 text-cyan-500 border-cyan-500/20 shadow-[0_0_8px_-2px] shadow-cyan-500/30"><Bot className="h-2 w-2 mr-0.5" />via @{ch.bot_username}</Badge>}
                          {ch.is_active && <div className="h-1.5 w-1.5 rounded-full bg-green-500" />}
                        </div>
                        <p className="text-[10px] text-muted-foreground">{ch.channel_id}</p>
                      </div>
                      <div className="flex items-center gap-1 lg:opacity-0 lg:group-hover:opacity-100 transition-opacity">
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-cyan-500 hover:text-cyan-400 hover:bg-cyan-500/10" onClick={() => { setTestPostChannelId(testPostChannelId === ch.channel_id ? null : ch.channel_id); setTestPostMessage(""); setTestPostResult(null); }} title="Test Post"><Send className="h-3 w-3" /></Button>
                        {!ch.is_default && <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleSetDefault(ch.id)} title="Set default"><Star className="h-3 w-3" /></Button>}
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive hover:bg-destructive/10" onClick={() => handleDeleteChannel(ch.id)} disabled={deletingChannelId === ch.id}>
                          {deletingChannelId === ch.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
                        </Button>
                      </div>
                    </div>
                    {testPostChannelId === ch.channel_id && (
                      <div className="ml-12 mt-1.5 space-y-1.5 animate-in slide-in-from-top-1 duration-200">
                        <div className="flex items-center gap-2">
                          <Input ref={testInputRef} value={testPostMessage} onChange={(e) => setTestPostMessage(e.target.value)} placeholder="Test message..." className="h-8 text-xs bg-background/50 border-cyan-500/20 focus-visible:ring-cyan-500/30" onKeyDown={(e) => { if (e.key === "Enter" && !isSendingTestPost && testPostMessage.trim()) handleTestPost(ch.channel_id); }} disabled={isSendingTestPost} />
                          <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0 text-cyan-500 hover:text-cyan-400 hover:bg-cyan-500/10 border border-cyan-500/30" onClick={() => handleTestPost(ch.channel_id)} disabled={isSendingTestPost || !testPostMessage.trim()}>
                            {isSendingTestPost ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                          </Button>
                        </div>
                        {testPostResult && testPostResult.channelId === ch.channel_id && (
                          <div className={cn("flex items-center gap-1.5 px-2 py-1 rounded-lg text-[11px] font-medium", testPostResult.success ? "bg-green-500/10 text-green-500 border border-green-500/20 shadow-[0_0_8px_-2px] shadow-green-500/30" : "bg-destructive/10 text-destructive border border-destructive/20")}>
                            {testPostResult.success ? <CheckCircle2 className="h-3 w-3 shrink-0" /> : <AlertCircle className="h-3 w-3 shrink-0" />}
                            <span className="truncate">{testPostResult.message}</span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </ScrollArea>
          )}

          {!showAddChannel && (
            <Button variant="outline" size="sm" onClick={() => setShowAddChannel(true)} disabled={!botId && !existingChannelBotToken} className="w-full gap-2 border-dashed border-cyan-500/40 hover:border-cyan-500 hover:bg-cyan-500/5">
              <Plus className="h-3.5 w-3.5" />Add Channel
            </Button>
          )}

          {showAddChannel && (
            <div className="p-3 rounded-xl bg-card/30 border border-cyan-500/20 space-y-3 animate-fade-in">
              <div className="flex items-center gap-2 text-xs font-medium"><Plus className="h-3.5 w-3.5 text-cyan-500" />Add Broadcast Channel</div>
              <div className="flex gap-2">
                <Input value={newChannelId} onChange={(e) => { setNewChannelId(e.target.value); setChannelVerifyResult(null); setChannelVerifyError(null); }} placeholder="@channel_username or -100xxxxxxxxxx" className="h-9 text-xs bg-background/50" />
                <Button variant="outline" size="sm" onClick={handleVerifyChannel} disabled={isVerifyingChannel || !newChannelId.trim() || !effectiveBotId} className={cn("h-9 px-3 gap-1.5 shrink-0 transition-all", isVerifyingChannel && "animate-pulse ring-1 ring-cyan-500/30", useDedicatedBot && dedicatedBotToken.trim() && "border-cyan-500/50 bg-cyan-500/5 hover:bg-cyan-500/10 hover:border-cyan-500")}>
                  {isVerifyingChannel ? <><div className="h-3 w-3 rounded-full bg-gradient-to-r from-cyan-500 to-blue-500 animate-pulse" /><span className="text-xs">Checking</span></> : <><ShieldCheck className="h-3.5 w-3.5" /><span className="text-xs">Verify</span></>}
                </Button>
              </div>

              {/* Bot source indicator */}
              {!useDedicatedBot && effectiveBotUsername && (
                <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-cyan-500/10 border border-cyan-500/20">
                  <Bot className="h-3 w-3 text-cyan-500" />
                  <span className="text-[10px] text-cyan-400">Verifying with <strong>@{effectiveBotUsername}</strong></span>
                </div>
              )}
              {!useDedicatedBot && !effectiveBotUsername && effectiveBotId && (
                <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-muted/30 border border-border/30">
                  <Bot className="h-3 w-3 text-muted-foreground" />
                  <span className="text-[10px] text-muted-foreground">Using selected bot for verification</span>
                </div>
              )}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-[10px] text-muted-foreground flex items-center gap-1.5 cursor-pointer"><Bot className="h-3 w-3" />Use dedicated bot for this channel</label>
                  <Switch checked={useDedicatedBot} onCheckedChange={(checked) => { setUseDedicatedBot(checked); if (!checked) { setDedicatedBotToken(""); setShowDedicatedToken(false); } setChannelVerifyResult(null); setChannelVerifyError(null); }} className="scale-75" />
                </div>
                {useDedicatedBot && (
                  <div className="relative animate-fade-in">
                    <Lock className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
                    <Input type={showDedicatedToken ? "text" : "password"} value={dedicatedBotToken} onChange={(e) => { setDedicatedBotToken(e.target.value); setChannelVerifyResult(null); setChannelVerifyError(null); }} placeholder="Dedicated Bot Token (from @BotFather)" className="h-9 text-xs bg-background/50 pl-8 pr-8 font-mono" />
                    <button type="button" onClick={() => setShowDedicatedToken(!showDedicatedToken)} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors">
                      {showDedicatedToken ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                    </button>
                  </div>
                )}
              </div>

              {/* Channel Verify Success */}
              {channelVerifyResult && (
                <div className={cn("p-3 rounded-xl border animate-fade-in", channelVerifyResult.is_admin && channelVerifyResult.can_post_messages ? "bg-card/30 border-green-500/30 shadow-[0_0_15px_-3px] shadow-green-500/20" : "bg-card/30 border-amber-500/30")}>
                  <div className="flex items-center gap-3">
                    <div className={cn("h-10 w-10 rounded-xl flex items-center justify-center border", channelVerifyResult.is_admin ? "bg-green-500/10 border-green-500/20" : "bg-amber-500/10 border-amber-500/20")}>
                      {channelVerifyResult.is_admin ? <ShieldCheck className="h-5 w-5 text-green-500" /> : <AlertCircle className="h-5 w-5 text-amber-500" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold">{channelVerifyResult.channel_name}</p>
                      <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                        <Badge variant="outline" className="text-[9px] px-1 py-0 h-3.5">{channelVerifyResult.channel_type}</Badge>
                        <span className="text-[10px] text-muted-foreground flex items-center gap-1"><Users className="h-2.5 w-2.5" />{channelVerifyResult.member_count.toLocaleString()}</span>
                        {channelVerifyResult.is_admin && channelVerifyResult.bot_username && (
                          <Badge className="text-[9px] px-1.5 py-0 h-3.5 bg-green-500/10 text-green-500 border-green-500/20 shadow-[0_0_8px_-2px] shadow-green-500/30"><Bot className="h-2 w-2 mr-0.5" />@{channelVerifyResult.bot_username} Verified ✓</Badge>
                        )}
                      </div>
                      {channelVerifyResult.is_admin && channelVerifyResult.bot_username && (
                        <p className="text-[10px] text-green-500 mt-1">✅ Verified! Bot @{channelVerifyResult.bot_username} is an authorized poster</p>
                      )}
                      {!channelVerifyResult.is_admin && (
                        <div className="mt-1 space-y-0.5">
                          <p className="text-[10px] text-amber-500">⚠️ Bot @{channelVerifyResult.bot_username || 'unknown'} is NOT admin in this channel.</p>
                          <p className="text-[10px] text-amber-500/70">Add @{channelVerifyResult.bot_username || 'your bot'} as Administrator and verify again.</p>
                          {channelVerifyResult.token_source === 'fallback_active_bot' && (
                            <p className="text-[10px] text-cyan-400/70">ℹ️ Selected bot has no token — using fallback bot @{channelVerifyResult.bot_username}</p>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                  {channelVerifyResult.is_admin && channelVerifyResult.can_post_messages && (
                    <Button size="sm" onClick={handleSaveChannel} disabled={isSavingChannel} className="w-full mt-3 gap-2 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-500 hover:to-emerald-500">
                      {isSavingChannel ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}Add Channel
                    </Button>
                  )}
                </div>
              )}

              {channelVerifyError && (
                <div className="p-3 rounded-xl bg-card/30 border border-red-500/30 animate-fade-in">
                  <div className="flex items-center gap-2"><AlertCircle className="h-4 w-4 text-red-500 shrink-0" /><p className="text-xs text-red-500">{channelVerifyError}</p></div>
                </div>
              )}

              <Button variant="ghost" size="sm" onClick={() => { setShowAddChannel(false); setNewChannelId(""); setChannelVerifyResult(null); setChannelVerifyError(null); setUseDedicatedBot(false); setDedicatedBotToken(""); setShowDedicatedToken(false); }} className="w-full text-xs text-muted-foreground">Cancel</Button>
            </div>
          )}
        </>
      )}

      {/* Broadcast Tasks — only when channels exist */}
      {channels.length > 0 && (
        <div className="pt-3 mt-3 border-t border-border/20">
          <ChannelTasksPanel userId={userId} />
        </div>
      )}
      </CardContent>
    </Card>
  );
}
