import { useState, useEffect, useRef, useCallback } from "react";
import { useDebounce } from "@/hooks/useDebounce";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  Users, Plus, Trash2, Bot, Loader2, CheckCircle2, AlertCircle,
  Eye, EyeOff, Lock, Wifi, Power, MessageSquare, Globe, AtSign, Brain,
  ChevronDown, ChevronRight, KeyRound, Save, Info, ShieldCheck, Copy, Check,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import type { GroupBot, GroupBotVerifyResult } from "./types";

interface GroupBotsSectionProps {
  userId: string;
  groupBots: GroupBot[];
  fetchAll: () => Promise<void>;
  ownerDisplayName: string;
}


interface GroupBotCardProps {
  groupBot: GroupBot;
  userId: string;
  fetchAll: () => Promise<void>;
  ownerDisplayName: string;
}

function GroupBotCard({ groupBot, userId, fetchAll, ownerDisplayName }: GroupBotCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [triggerWord, setTriggerWord] = useState(groupBot.trigger_word || "");
  const [customInstruction, setCustomInstruction] = useState(groupBot.custom_instruction || "");
  const [isPersonaOpen, setIsPersonaOpen] = useState(!!groupBot.custom_instruction);
  const [isSavingTrigger, setIsSavingTrigger] = useState(false);
  const [isSavingInstruction, setIsSavingInstruction] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [webhookActive, setWebhookActive] = useState(groupBot.webhook_active);
  const [isActivating, setIsActivating] = useState(false);
  // Token management state
  const [isTokenOpen, setIsTokenOpen] = useState(false);
  const [tokenValue, setTokenValue] = useState(groupBot.bot_token || "");
  const [showTokenValue, setShowTokenValue] = useState(false);
  const [isSavingToken, setIsSavingToken] = useState(false);
  const [isVerifyingToken, setIsVerifyingToken] = useState(false);
  const [tokenCopied, setTokenCopied] = useState(false);
  const tokenDirty = tokenValue !== (groupBot.bot_token || "");

  // Check webhook status on mount + sync back to DB (Fix 6)
  useEffect(() => {
    if (!groupBot.bot_token) return;
    const check = async () => {
      try {
        const { data } = await supabase.functions.invoke('telegram-webhook', {
          body: { action: 'check-group-webhook', group_bot_id: groupBot.id },
        });
        const isActive = !!data?.webhook_active;
        setWebhookActive(isActive);
        // Sync webhook_active back to group_bots table if changed
        if (groupBot.webhook_active !== isActive) {
          await supabase.from('group_bots').update({ webhook_active: isActive }).eq('id', groupBot.id);
        }
      } catch {
        setWebhookActive(false);
      }
    };
    check();
  }, [groupBot.id, groupBot.bot_token]);

  const updateGroupBot = async (updates: Partial<GroupBot>) => {
    const { error } = await supabase
      .from("group_bots")
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq("id", groupBot.id)
      .eq("user_id", userId);
    if (error) throw error;
  };

  // Debounced trigger word save
  const debouncedTriggerWord = useDebounce(triggerWord, 800);
  const lastSavedTrigger = useRef(groupBot.trigger_word || "");
  useEffect(() => {
    if (debouncedTriggerWord === lastSavedTrigger.current) return;
    const save = async () => {
      setIsSavingTrigger(true);
      try {
        await updateGroupBot({ trigger_word: debouncedTriggerWord || null } as any);
        lastSavedTrigger.current = debouncedTriggerWord;
      } catch { toast.error("Failed to save trigger word"); }
      finally { setIsSavingTrigger(false); }
    };
    save();
  }, [debouncedTriggerWord]);

  // Debounced instruction save
  const debouncedInstruction = useDebounce(customInstruction, 1200);
  const lastSavedInstruction = useRef(groupBot.custom_instruction || "");
  useEffect(() => {
    if (debouncedInstruction === lastSavedInstruction.current) return;
    const save = async () => {
      setIsSavingInstruction(true);
      try {
        await updateGroupBot({ custom_instruction: debouncedInstruction || null } as any);
        lastSavedInstruction.current = debouncedInstruction;
      } catch { toast.error("Failed to save persona"); }
      finally { setIsSavingInstruction(false); }
    };
    save();
  }, [debouncedInstruction]);

  const handleToggle = async (field: 'is_active' | 'allow_dm' | 'allow_web_search', value: boolean) => {
    try {
      await updateGroupBot({ [field]: value } as any);
      fetchAll();
    } catch { toast.error("Failed to update"); }
  };

  const handleActivateWebhook = async () => {
    setIsActivating(true);
    try {
      const { data, error } = await supabase.functions.invoke("telegram-webhook", {
        body: { action: "setup-group-webhook", group_bot_id: groupBot.id },
      });
      if (error) throw error;
      if (data?.ok) { setWebhookActive(true); toast.success("🟢 Group Bot webhook activated!"); }
      else toast.error(data?.error || "Failed to activate webhook");
    } catch { toast.error("Failed to activate webhook"); }
    finally { setIsActivating(false); }
  };

  const handleSaveToken = async () => {
    if (!tokenValue.trim()) return;
    setIsSavingToken(true);
    try {
      // Verify first
      setIsVerifyingToken(true);
      const response = await supabase.functions.invoke("telegram-webhook", {
        body: { action: "validate-group-token-standalone", group_bot_token: tokenValue.trim() },
      });
      setIsVerifyingToken(false);
      if (response.error) throw response.error;
      const data = response.data;
      if (!data?.ok) {
        toast.error(data?.error || "Token verification failed");
        setIsSavingToken(false);
        return;
      }
      // Save to DB
      await updateGroupBot({
        bot_token: tokenValue.trim(),
        bot_username: data.bot_username,
        bot_name: data.bot_name,
      } as any);
      toast.success(`✅ Token saved — @${data.bot_username}`);
      fetchAll();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save token");
    } finally { setIsSavingToken(false); setIsVerifyingToken(false); }
  };

  const handleCopyToken = async () => {
    if (!tokenValue) return;
    try {
      await navigator.clipboard.writeText(tokenValue);
      setTokenCopied(true);
      toast.success("Token copied");
      setTimeout(() => setTokenCopied(false), 2000);
    } catch { toast.error("Failed to copy"); }
  };

  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      const { error } = await supabase.from("group_bots").delete().eq("id", groupBot.id).eq("user_id", userId);
      if (error) throw error;
      toast.success("Group Bot deleted");
      fetchAll();
    } catch { toast.error("Failed to delete"); }
    finally { setIsDeleting(false); setShowDeleteConfirm(false); }
  };

  const healthScore = [!!groupBot.bot_username, webhookActive, groupBot.is_active].filter(Boolean).length;

  return (
    <Card className="bg-card/50 backdrop-blur-sm border-border/50 overflow-hidden">
      {/* Header - always visible */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center gap-3 p-3 hover:bg-muted/20 transition-colors"
      >
        <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-emerald-500/15 to-green-500/15 flex items-center justify-center shrink-0 border border-emerald-500/20">
          <Users className="h-4 w-4 text-emerald-500" />
        </div>
        <div className="flex-1 min-w-0 text-left">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium truncate">{groupBot.name || groupBot.bot_name || 'Group Bot'}</span>
            {groupBot.bot_username && (
              <Badge className="text-[8px] px-1.5 py-0 h-3.5 bg-emerald-500/10 text-emerald-400 border-emerald-500/20 shrink-0">
                @{groupBot.bot_username}
              </Badge>
            )}
          </div>
          <p className="text-[10px] text-muted-foreground truncate">
            {groupBot.bot_username ? (webhookActive ? 'Active' : 'Webhook inactive') : 'Not configured'}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <div className={cn(
            "flex items-center gap-1 px-1.5 py-0.5 rounded-full border text-[8px] font-medium",
            healthScore === 3 ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
            : healthScore >= 1 ? "bg-amber-500/10 text-amber-400 border-amber-500/20"
            : "bg-muted/30 text-muted-foreground border-border/30"
          )}>
            {healthScore}/3
          </div>
          {isExpanded ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />}
        </div>
      </button>

      {/* Expanded content */}
      {isExpanded && (
        <CardContent className="pt-0 pb-3 px-3 space-y-2.5 animate-in slide-in-from-top-1 duration-200">
          {/* Bot Identity — verified */}
          {groupBot.bot_username ? (
            <div className="flex items-center gap-2.5 p-2.5 rounded-xl bg-card/30 border border-emerald-500/20">
              <div className="h-8 w-8 rounded-xl bg-emerald-500/10 border border-emerald-500/12 flex items-center justify-center">
                <Bot className="h-3.5 w-3.5 text-emerald-400" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[12px] font-medium truncate leading-tight">{groupBot.bot_name || "Group Bot"}</p>
                <p className="text-[10px] text-muted-foreground leading-tight">@{groupBot.bot_username}</p>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                {webhookActive && (
                  <Badge className="text-[7px] px-1.5 py-0 h-3.5 bg-emerald-500/10 text-emerald-400 border-emerald-500/15 gap-0.5 rounded-full">
                    <Wifi className="h-2 w-2" /> Active
                  </Badge>
                )}
                <Badge className="text-[7px] px-1.5 py-0 h-3.5 bg-emerald-500/10 text-emerald-400 border-emerald-500/15 gap-0.5 rounded-full">
                  <ShieldCheck className="h-2 w-2" /> Verified
                </Badge>
              </div>
            </div>
          ) : (
            /* Not configured — prominent CTA */
            <div className="p-3 rounded-xl bg-gradient-to-br from-amber-500/5 to-orange-500/5 border border-amber-500/20 space-y-2">
              <div className="flex items-center gap-2">
                <div className="h-8 w-8 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center">
                  <KeyRound className="h-3.5 w-3.5 text-amber-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[12px] font-medium leading-tight text-amber-300">Token Required</p>
                  <p className="text-[9px] text-muted-foreground leading-tight">Add your @BotFather token to activate this bot</p>
                </div>
              </div>
              <Button
                size="sm" variant="outline"
                onClick={() => setIsTokenOpen(true)}
                className="w-full h-7 gap-1.5 text-[10px] border-amber-500/30 hover:border-amber-500/60 hover:bg-amber-500/5 text-amber-300"
              >
                <KeyRound className="h-3 w-3" /> Setup Bot Token
              </Button>
            </div>
          )}

          {/* Activate webhook */}
          {groupBot.bot_username && !webhookActive && (
            <Button
              size="sm" onClick={handleActivateWebhook} disabled={isActivating}
              className="w-full h-7 gap-1.5 text-[11px] bg-gradient-to-r from-emerald-600 to-green-600 hover:from-emerald-500 hover:to-green-500 rounded-xl"
            >
              {isActivating ? <Loader2 className="h-3 w-3 animate-spin" /> : <Wifi className="h-3 w-3" />}
              Activate Webhook
            </Button>
          )}

          {/* ─── Bot Token Management ─── */}
          <Collapsible open={isTokenOpen} onOpenChange={setIsTokenOpen}>
            <div className="rounded-xl bg-card/30 border border-border/30 overflow-hidden">
              <CollapsibleTrigger className="w-full flex items-center justify-between px-3 py-2 hover:bg-muted/5 transition-colors">
                <div className="flex items-center gap-2">
                  <div className="h-5 w-5 rounded-lg bg-amber-500/10 flex items-center justify-center">
                    <KeyRound className="h-2.5 w-2.5 text-amber-400" />
                  </div>
                  <span className="text-[11px] font-medium">Bot Token</span>
                  {groupBot.bot_token ? (
                    <div className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                  ) : (
                    <Badge className="text-[7px] px-1 py-0 h-3 bg-amber-500/10 text-amber-400 border-amber-500/20 rounded-full">
                      required
                    </Badge>
                  )}
                </div>
                {isTokenOpen ? <ChevronDown className="h-3 w-3 text-muted-foreground" /> : <ChevronRight className="h-3 w-3 text-muted-foreground" />}
              </CollapsibleTrigger>
              <CollapsibleContent>
                <div className="px-3 pb-3 space-y-2.5">
                  {/* Token input with show/hide and copy */}
                  <div className="relative flex gap-1">
                    <div className="relative flex-1">
                      <Lock className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground/50" />
                      <Input
                        type={showTokenValue ? "text" : "password"}
                        value={tokenValue}
                        onChange={(e) => setTokenValue(e.target.value)}
                        placeholder="123456789:ABCdef..."
                        className="h-8 text-[11px] bg-background/50 border-border/50 focus:border-primary/50 pl-8 pr-2 font-mono"
                      />
                    </div>
                    <Button
                      type="button" variant="ghost" size="icon"
                      onClick={() => setShowTokenValue(!showTokenValue)}
                      className="h-8 w-8 shrink-0 hover:bg-muted/30"
                    >
                      {showTokenValue ? <EyeOff className="h-3 w-3 text-muted-foreground" /> : <Eye className="h-3 w-3 text-muted-foreground" />}
                    </Button>
                    <Button
                      type="button" variant="ghost" size="icon"
                      onClick={handleCopyToken}
                      disabled={!tokenValue}
                      className="h-8 w-8 shrink-0 hover:bg-muted/30"
                    >
                      {tokenCopied ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3 text-muted-foreground" />}
                    </Button>
                  </div>

                  {/* Save button — only when dirty */}
                  {tokenDirty && tokenValue.trim() && (
                    <Button
                      size="sm" onClick={handleSaveToken} disabled={isSavingToken}
                      className="w-full h-7 gap-1.5 text-[10px] bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 rounded-lg"
                    >
                      {isSavingToken ? (
                        <>
                          <Loader2 className="h-3 w-3 animate-spin" />
                          {isVerifyingToken ? "Verifying..." : "Saving..."}
                        </>
                      ) : (
                        <><Save className="h-3 w-3" /> Verify & Save Token</>
                      )}
                    </Button>
                  )}

                  <p className="text-[8px] text-muted-foreground/50 flex items-center gap-1">
                    <Info className="h-2 w-2 shrink-0" />
                    Get your token from <span className="text-primary/60 font-medium">@BotFather</span> on Telegram
                  </p>
                </div>
              </CollapsibleContent>
            </div>
          </Collapsible>

          {/* KB info */}
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-card/30 border border-border/30">
            <Lock className="h-2.5 w-2.5 text-emerald-400 shrink-0" />
            <p className="text-[10px] text-muted-foreground leading-tight">
              <span className="text-emerald-400 font-medium">KB access only</span>
              {ownerDisplayName && <>{" "}· <span className="text-primary/80 font-medium">{ownerDisplayName}</span></>}
            </p>
          </div>

          {/* Control Strip */}
          <div className="rounded-xl bg-card/30 border border-border/30 overflow-hidden">
            <div className={cn("flex items-center justify-between px-3 py-2 transition-colors", !groupBot.is_active && "bg-destructive/[0.04]")}>
              <div className="flex items-center gap-2.5">
                <div className={cn("h-5 w-5 rounded-lg flex items-center justify-center", groupBot.is_active ? "bg-emerald-500/10" : "bg-destructive/10")}>
                  <Power className={cn("h-2.5 w-2.5", groupBot.is_active ? "text-emerald-400" : "text-destructive")} />
                </div>
                <div>
                  <p className="text-[11px] font-medium leading-tight">Bot Active</p>
                  <p className={cn("text-[8px] leading-tight", groupBot.is_active ? "text-emerald-400/60" : "text-destructive/60")}>
                    {groupBot.is_active ? "Responding" : "Silent"}
                  </p>
                </div>
              </div>
              <Switch checked={groupBot.is_active} onCheckedChange={(v) => handleToggle('is_active', v)} />
            </div>
            <div className="h-px bg-border/20 mx-3" />
            <div className={cn("flex items-center justify-between px-3 py-2 transition-all", !groupBot.is_active && "opacity-30 pointer-events-none")}>
              <div className="flex items-center gap-2.5">
                <div className={cn("h-5 w-5 rounded-lg flex items-center justify-center", groupBot.allow_dm ? "bg-blue-500/10" : "bg-muted/30")}>
                  <MessageSquare className={cn("h-2.5 w-2.5", groupBot.allow_dm ? "text-blue-400" : "text-muted-foreground/50")} />
                </div>
                <div>
                  <p className="text-[11px] font-medium leading-tight">Private DM</p>
                  <p className={cn("text-[8px] leading-tight", groupBot.allow_dm ? "text-blue-400/60" : "text-muted-foreground/40")}>
                    {groupBot.allow_dm ? "Anyone can chat privately" : "DMs blocked"}
                  </p>
                </div>
              </div>
              <Switch checked={groupBot.allow_dm} onCheckedChange={(v) => handleToggle('allow_dm', v)} disabled={!groupBot.is_active} />
            </div>
            <div className="h-px bg-border/20 mx-3" />
            <div className={cn("flex items-center justify-between px-3 py-2 transition-all", !groupBot.is_active && "opacity-30 pointer-events-none")}>
              <div className="flex items-center gap-2.5">
                <div className={cn("h-5 w-5 rounded-lg flex items-center justify-center", groupBot.allow_web_search ? "bg-teal-500/10" : "bg-muted/30")}>
                  <Globe className={cn("h-2.5 w-2.5", groupBot.allow_web_search ? "text-teal-400" : "text-muted-foreground/50")} />
                </div>
                <div>
                  <p className="text-[11px] font-medium leading-tight">Web Search</p>
                  <p className={cn("text-[8px] leading-tight", groupBot.allow_web_search ? "text-teal-400/60" : "text-muted-foreground/40")}>
                    {groupBot.allow_web_search ? "Can search the internet" : "Knowledge Base only"}
                  </p>
                </div>
              </div>
              <Switch checked={groupBot.allow_web_search} onCheckedChange={(v) => handleToggle('allow_web_search', v)} disabled={!groupBot.is_active} />
            </div>
          </div>

          {/* Trigger Word */}
          <div className="px-3 py-2 rounded-xl bg-card/30 border border-border/30">
            <div className="flex items-center gap-2 mb-1.5">
              <div className="h-5 w-5 rounded-lg bg-amber-500/10 flex items-center justify-center">
                <AtSign className="h-2.5 w-2.5 text-amber-400" />
              </div>
              <Label className="text-[11px] font-medium flex-1">Trigger Word</Label>
              {isSavingTrigger && <span className="text-[8px] text-muted-foreground/50 flex items-center gap-1"><Loader2 className="h-2 w-2 animate-spin" /> saving...</span>}
            </div>
            <input
              type="text" value={triggerWord} onChange={(e) => setTriggerWord(e.target.value)}
              placeholder="ဗျို့မောင်တက်ကြွ"
              className="flex h-7 w-full px-2.5 text-[11px] shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring placeholder:text-muted-foreground/40 bg-card/20 border border-border/30 rounded-lg"
            />
            <p className="text-[8px] text-muted-foreground/50 mt-1">
              ⚡ <span className="text-amber-400/60">"{triggerWord}"</span> ပါမှ bot reply မယ် · auto-saved
            </p>
          </div>

          {/* Custom Persona */}
          <Collapsible open={isPersonaOpen} onOpenChange={setIsPersonaOpen}>
            <div className="rounded-xl bg-card/30 border border-border/30 overflow-hidden">
              <CollapsibleTrigger className="w-full flex items-center justify-between px-3 py-2 hover:bg-muted/5 transition-colors">
                <div className="flex items-center gap-2">
                  <div className="h-5 w-5 rounded-lg bg-purple-500/10 flex items-center justify-center">
                    <Brain className="h-2.5 w-2.5 text-purple-400" />
                  </div>
                  <span className="text-[11px] font-medium">Custom Persona</span>
                  {customInstruction && <div className="h-1.5 w-1.5 rounded-full bg-purple-400" />}
                </div>
                {isPersonaOpen ? <ChevronDown className="h-3 w-3 text-muted-foreground" /> : <ChevronRight className="h-3 w-3 text-muted-foreground" />}
              </CollapsibleTrigger>
              <CollapsibleContent>
                <div className="px-3 pb-3 space-y-2">
                  <Textarea
                    value={customInstruction} onChange={(e) => setCustomInstruction(e.target.value)}
                    placeholder="Custom instructions for this group bot..."
                    className="min-h-[60px] text-[11px] bg-card/20 border-border/30 resize-none"
                    maxLength={2000}
                  />
                  <div className="flex items-center justify-between">
                    <span className="text-[8px] text-muted-foreground/50">{customInstruction.length}/2000</span>
                    {isSavingInstruction && <span className="text-[8px] text-muted-foreground/50 flex items-center gap-1"><Loader2 className="h-2 w-2 animate-spin" /> saving...</span>}
                  </div>
                </div>
              </CollapsibleContent>
            </div>
          </Collapsible>

          {/* Danger Zone */}
          <div className="pt-2 border-t border-border/20">
            {!showDeleteConfirm ? (
              <Button variant="ghost" size="sm" onClick={() => setShowDeleteConfirm(true)} className="w-full h-7 text-[10px] text-destructive hover:text-destructive hover:bg-destructive/10 gap-1.5">
                <Trash2 className="h-3 w-3" /> Delete Group Bot
              </Button>
            ) : (
              <div className="flex items-center gap-2">
                <Button variant="destructive" size="sm" onClick={handleDelete} disabled={isDeleting} className="flex-1 h-7 text-[10px] gap-1.5">
                  {isDeleting ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />} Confirm Delete
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setShowDeleteConfirm(false)} className="h-7 text-[10px]">Cancel</Button>
              </div>
            )}
          </div>
        </CardContent>
      )}
    </Card>
  );
}

export function GroupBotsSection({ userId, groupBots, fetchAll, ownerDisplayName }: GroupBotsSectionProps) {
  const [showAddForm, setShowAddForm] = useState(false);
  const [newName, setNewName] = useState("Group Bot");
  const [newToken, setNewToken] = useState("");
  const [showToken, setShowToken] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [verifyResult, setVerifyResult] = useState<GroupBotVerifyResult | null>(null);
  const [verifyError, setVerifyError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const handleVerify = async () => {
    if (!newToken.trim()) return;
    setIsVerifying(true); setVerifyResult(null); setVerifyError(null);
    try {
      const response = await supabase.functions.invoke("telegram-webhook", {
        body: { action: "validate-group-token-standalone", group_bot_token: newToken.trim() },
      });
      if (response.error) throw response.error;
      const data = response.data;
      if (data?.ok) {
        setVerifyResult({ bot_username: data.bot_username, bot_name: data.bot_name, can_join_groups: data.can_join_groups, can_read_all_group_messages: data.can_read_all_group_messages });
        toast.success(`✅ Verified: @${data.bot_username}`);
      } else {
        setVerifyError(data?.error || "Verification failed");
      }
    } catch (err) {
      setVerifyError(err instanceof Error ? err.message : "Network error");
    } finally { setIsVerifying(false); }
  };

  const handleSave = async () => {
    if (!verifyResult) return;
    setIsSaving(true);
    try {
      const { error } = await supabase.from("group_bots").insert({
        user_id: userId,
        name: newName.trim() || "Group Bot",
        bot_token: newToken.trim(),
        bot_username: verifyResult.bot_username,
        bot_name: verifyResult.bot_name,
        is_active: true,
      });
      if (error) throw error;
      toast.success(`Group Bot "@${verifyResult.bot_username}" added!`);
      setShowAddForm(false); setNewName("Group Bot"); setNewToken(""); setVerifyResult(null); setVerifyError(null);
      fetchAll();
    } catch { toast.error("Failed to save group bot"); }
    finally { setIsSaving(false); }
  };

  const activeCount = groupBots.filter(g => g.is_active).length;

  return (
    <Card className="bg-card/50 backdrop-blur-sm border-border/50">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-emerald-500 to-green-600 flex items-center justify-center">
            <Users className="h-4 w-4 text-white" />
          </div>
          Group Sub Agents
          <Badge className="text-[8px] px-1.5 py-0 h-3.5 bg-muted/60 text-emerald-400 border-border/40 font-medium rounded-full">
            {groupBots.length} bots
          </Badge>
          {activeCount > 0 && (
            <Badge className="text-[8px] px-1.5 py-0 h-3.5 bg-emerald-500/10 text-emerald-400 border-emerald-500/20 rounded-full">
              {activeCount} active
            </Badge>
          )}
        </CardTitle>
        <p className="text-[10px] text-muted-foreground">Autonomous group bots — each with its own identity, persona, and controls.</p>
      </CardHeader>
      <CardContent className="space-y-3 pt-0">
        {/* Existing group bots */}
        {groupBots.length === 0 && !showAddForm && (
          <div className="text-center py-6">
            <div className="h-12 w-12 rounded-2xl bg-muted/30 flex items-center justify-center mx-auto mb-3"><Users className="h-6 w-6 text-muted-foreground" /></div>
            <p className="text-xs text-muted-foreground mb-3">No group bots yet</p>
          </div>
        )}

        {groupBots.length > 0 && (
          <ScrollArea className="max-h-[60vh]">
            <div className="space-y-2">
              {groupBots.map((gb) => (
                <GroupBotCard key={gb.id} groupBot={gb} userId={userId} fetchAll={fetchAll} ownerDisplayName={ownerDisplayName} />
              ))}
            </div>
          </ScrollArea>
        )}

        {/* Add Group Bot button */}
        {!showAddForm && (
          <Button variant="outline" size="sm" onClick={() => setShowAddForm(true)} className="w-full gap-2 border-dashed border-emerald-500/40 hover:border-emerald-500 hover:bg-emerald-500/5">
            <Plus className="h-3.5 w-3.5" />Add Group Bot
          </Button>
        )}

        {/* Add form */}
        {showAddForm && (
          <div className="p-3 rounded-xl bg-card/30 border border-emerald-500/20 space-y-3 animate-fade-in">
            <div className="flex items-center gap-2 text-xs font-medium"><Plus className="h-3.5 w-3.5 text-emerald-500" />Add Group Bot</div>
            
            <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Bot name" className="h-9 text-xs bg-background/50" maxLength={50} />
            
            <div className="relative">
              <Lock className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
              <Input
                type={showToken ? "text" : "password"} value={newToken}
                onChange={(e) => { setNewToken(e.target.value); setVerifyResult(null); setVerifyError(null); }}
                placeholder="Bot Token (from @BotFather)" className="h-9 text-xs bg-background/50 pl-8 pr-8 font-mono"
              />
              <button type="button" onClick={() => setShowToken(!showToken)} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors">
                {showToken ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
              </button>
            </div>

            <Button variant="outline" size="sm" onClick={handleVerify} disabled={isVerifying || !newToken.trim()} className="w-full h-9 gap-1.5">
              {isVerifying ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
              Verify Token
            </Button>

            {verifyResult && (
              <div className="p-3 rounded-xl bg-card/30 border border-emerald-500/30">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
                    <Bot className="h-5 w-5 text-emerald-500" />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-semibold">{verifyResult.bot_name}</p>
                    <p className="text-[10px] text-muted-foreground">@{verifyResult.bot_username}</p>
                  </div>
                </div>
                <Button size="sm" onClick={handleSave} disabled={isSaving} className="w-full mt-3 gap-2 bg-gradient-to-r from-emerald-600 to-green-600 hover:from-emerald-500 hover:to-green-500">
                  {isSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                  Add Group Bot
                </Button>
              </div>
            )}

            {verifyError && (
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-card/30 border border-destructive/20">
                <AlertCircle className="h-2.5 w-2.5 text-destructive shrink-0" />
                <p className="text-[10px] text-destructive">{verifyError}</p>
              </div>
            )}

            <Button variant="ghost" size="sm" onClick={() => { setShowAddForm(false); setNewToken(""); setVerifyResult(null); setVerifyError(null); }} className="w-full h-7 text-[10px]">
              Cancel
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
