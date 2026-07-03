import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  Users, AtSign, ShieldCheck, Eye, EyeOff, AlertCircle,
  Loader2, Lock, Wifi, Bot, Brain, Power, MessageSquare,
  Globe, ChevronDown, ChevronRight, KeyRound, CheckCircle2,
  Save, Unlink, Info, Trash2,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface GroupEtiquettePanelProps {
  isIndependent?: boolean;
  hasPersonalAssistant?: boolean;
  triggerWord: string;
  onTriggerWordChange: (word: string) => void;
  isSavingTrigger?: boolean;
  verifyResult: { bot_username: string; can_join_groups?: boolean; can_read_all_group_messages?: boolean } | null;
  botId: string | undefined;
  hasBotToken: boolean;
  groupBotToken?: string;
  onGroupBotTokenChange?: (token: string) => void;
  onSaveGroupBotToken?: () => Promise<void>;
  isSavingToken?: boolean;
  tokenSaved?: boolean;
  tokenDirty?: boolean;
  groupBotUsername?: string | null;
  groupBotName?: string | null;
  onVerifyGroupBot?: () => Promise<void>;
  isVerifyingGroupBot?: boolean;
  groupBotVerifyResult?: { bot_username: string; bot_name: string; can_join_groups: boolean; can_read_all_group_messages: boolean } | null;
  groupBotVerifyError?: string | null;
  onActivateGroupBot?: () => Promise<void>;
  isActivatingGroupBot?: boolean;
  groupBotWebhookActive?: boolean;
  ownerDisplayName?: string;
  groupBotCustomInstruction?: string;
  onGroupBotCustomInstructionChange?: (instruction: string) => void;
  isSavingInstruction?: boolean;
  groupBotActive?: boolean;
  onGroupBotActiveChange?: (active: boolean) => void;
  groupBotAllowDm?: boolean;
  onGroupBotAllowDmChange?: (allow: boolean) => void;
  groupBotAllowWebSearch?: boolean;
  onGroupBotAllowWebSearchChange?: (allow: boolean) => void;
  onDeleteGroupBot?: () => Promise<void>;
  isDeletingGroupBot?: boolean;
}

function StatusRow({ label, ok, detail }: { label: string; ok: boolean | null; detail?: string }) {
  return (
    <div className="flex items-center justify-between py-1">
      <span className="text-[10px] text-muted-foreground">{label}</span>
      <div className="flex items-center gap-1.5">
        {detail && <span className="text-[9px] text-muted-foreground/60">{detail}</span>}
        <div className={cn("h-1.5 w-1.5 rounded-full", ok === null ? "bg-amber-400/50 animate-pulse" : ok ? "bg-emerald-400" : "bg-red-400/70")} />
      </div>
    </div>
  );
}

export function GroupEtiquettePanel({
  isIndependent = false,
  hasPersonalAssistant = false,
  triggerWord,
  onTriggerWordChange,
  isSavingTrigger = false,
  groupBotToken = "",
  onGroupBotTokenChange,
  onSaveGroupBotToken,
  isSavingToken = false,
  tokenSaved = false,
  tokenDirty = false,
  groupBotUsername,
  groupBotName,
  onVerifyGroupBot,
  isVerifyingGroupBot = false,
  groupBotVerifyResult,
  groupBotVerifyError,
  onActivateGroupBot,
  isActivatingGroupBot = false,
  groupBotWebhookActive = false,
  ownerDisplayName,
  groupBotCustomInstruction = "",
  onGroupBotCustomInstructionChange,
  isSavingInstruction = false,
  groupBotActive = true,
  onGroupBotActiveChange,
  groupBotAllowDm = false,
  onGroupBotAllowDmChange,
  groupBotAllowWebSearch = false,
  onGroupBotAllowWebSearchChange,
  onDeleteGroupBot,
  isDeletingGroupBot = false,
}: GroupEtiquettePanelProps) {
  const [showGroupToken, setShowGroupToken] = useState(false);
  const [isPersonaOpen, setIsPersonaOpen] = useState(!!groupBotCustomInstruction);
  const [isTokenOpen, setIsTokenOpen] = useState(true);
  const [isHealthOpen, setIsHealthOpen] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const isVerifiedOrSaved = !!(groupBotVerifyResult || groupBotUsername);

  const healthTokenOk = isVerifiedOrSaved;
  const healthWebhookOk = groupBotWebhookActive;
  const healthActiveOk = groupBotActive;
  const healthScore = [healthTokenOk, healthWebhookOk, healthActiveOk].filter(Boolean).length;

  return (
    <Card className="bg-card/50 backdrop-blur-sm border-border/50">
      {/* Header */}
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-cyan-500 to-blue-500 flex items-center justify-center">
              <Users className="h-4 w-4 text-white" />
            </div>
            Group Etiquette
            <Badge className="text-[8px] px-1.5 py-0 h-3.5 bg-muted/60 text-cyan-400 border-border/40 font-medium rounded-full">
              Social Intelligence
            </Badge>
          </CardTitle>

          <div className="flex items-center gap-2">
            {groupBotWebhookActive ? (
              <div className="flex items-center gap-1">
                <div className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                <span className="text-[8px] text-emerald-400 font-medium uppercase tracking-wider">Live</span>
              </div>
            ) : (
              <div className="flex items-center gap-1">
                <div className="h-1.5 w-1.5 rounded-full bg-muted-foreground/30" />
                <span className="text-[8px] text-muted-foreground/50 font-medium uppercase tracking-wider">Offline</span>
              </div>
            )}

            <button
              onClick={() => setIsHealthOpen(o => !o)}
              className={cn("flex items-center gap-1 px-1.5 py-0.5 rounded-full border text-[8px] font-medium transition-colors",
                healthScore === 3 ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20 hover:bg-emerald-500/15"
                : healthScore >= 1 ? "bg-amber-500/10 text-amber-400 border-amber-500/20 hover:bg-amber-500/15"
                : "bg-red-500/10 text-red-400 border-red-500/20 hover:bg-red-500/15"
              )}
            >
              <Info className="h-2 w-2" />
              {healthScore}/3
            </button>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-2 pt-0">
        {/* Health Dashboard */}
        {isHealthOpen && (
          <div className="px-3 py-2 rounded-xl bg-card/30 border border-border/30">
            <p className="text-[9px] text-muted-foreground/60 font-medium uppercase tracking-wider mb-1.5">Connection Health</p>
            <StatusRow label="Bot Token" ok={healthTokenOk} detail={groupBotUsername ? `@${groupBotUsername}` : "not verified"} />
            <StatusRow label="Webhook Active" ok={healthWebhookOk} detail={groupBotWebhookActive ? "receiving messages" : "not connected"} />
            <StatusRow label="Bot Active" ok={healthActiveOk} detail={groupBotActive ? "responding" : "silent mode"} />
            <div className="h-px bg-border/20 mx-3 my-1.5" />
            <StatusRow label="Allow DM" ok={groupBotAllowDm} detail={groupBotAllowDm ? "enabled" : "disabled"} />
            <StatusRow label="Web Search" ok={groupBotAllowWebSearch} detail={groupBotAllowWebSearch ? "enabled" : "KB only"} />
            <StatusRow label="Personal Assistant" ok={hasPersonalAssistant} detail={hasPersonalAssistant ? "connected" : "not required"} />
          </div>
        )}

        {/* Independence notice */}
        {isIndependent && !hasPersonalAssistant && (
          <div className="flex items-start gap-2 px-3 py-2 rounded-xl bg-card/30 border border-blue-500/15">
            <Unlink className="h-2.5 w-2.5 text-blue-400 shrink-0 mt-0.5" />
            <p className="text-[10px] text-muted-foreground leading-tight">
              <span className="text-blue-400 font-medium">Independent mode</span>
              {" "}· Group Bot works without a Personal AI Assistant.
            </p>
          </div>
        )}

        {/* Info banner */}
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-card/30 border border-border/30">
          <Lock className="h-2.5 w-2.5 text-emerald-400 shrink-0" />
          <p className="text-[10px] text-muted-foreground leading-tight">
            <span className="text-emerald-400 font-medium">KB access only</span>
            {ownerDisplayName && (
              <>{" "}· <span className="text-white/50">by</span>{" "}<span className="text-primary/80 font-medium">{ownerDisplayName}</span></>
            )}
          </p>
        </div>

        {/* Bot Identity — Verified */}
        {groupBotVerifyResult && (
          <div className="p-2.5 rounded-xl bg-card/30 border border-emerald-500/20 shadow-[0_0_16px_-4px_rgba(16,185,129,0.12)]">
            <div className="flex items-center gap-2.5">
              <div className="h-8 w-8 rounded-xl bg-emerald-500/10 border border-emerald-500/15 flex items-center justify-center">
                <Bot className="h-3.5 w-3.5 text-emerald-400" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[12px] font-semibold truncate leading-tight">{groupBotVerifyResult.bot_name}</p>
                <p className="text-[10px] text-muted-foreground leading-tight">@{groupBotVerifyResult.bot_username}</p>
              </div>
              <div className="shrink-0">
                {groupBotVerifyResult.can_read_all_group_messages ? (
                  <Badge className="text-[7px] px-1.5 py-0 h-3.5 bg-emerald-500/10 text-emerald-400 border-emerald-500/15 gap-0.5 rounded-full">
                    <EyeOff className="h-2 w-2" /> Privacy Off
                  </Badge>
                ) : (
                  <Badge className="text-[7px] px-1.5 py-0 h-3.5 bg-amber-500/10 text-amber-400 border-amber-500/15 gap-0.5 rounded-full">
                    <Eye className="h-2 w-2" /> Privacy On
                  </Badge>
                )}
              </div>
            </div>
            {!groupBotVerifyResult.can_read_all_group_messages && (
              <div className="flex items-start gap-1.5 mt-1.5 pl-[42px]">
                <AlertCircle className="h-2 w-2 text-amber-400 shrink-0 mt-0.5" />
                <p className="text-[8px] text-amber-400/70 leading-tight">
                  Privacy Mode ON — @BotFather → /setprivacy → Disable
                </p>
              </div>
            )}
          </div>
        )}

        {/* Bot Identity — Saved (no fresh verify) */}
        {!groupBotVerifyResult && groupBotUsername && (
          <div className="flex items-center gap-2.5 p-2.5 rounded-xl bg-card/30 border border-border/30">
            <div className="h-8 w-8 rounded-xl bg-emerald-500/10 border border-emerald-500/12 flex items-center justify-center">
              <Bot className="h-3.5 w-3.5 text-emerald-400" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[12px] font-medium truncate leading-tight">{groupBotName || "Group Bot"}</p>
              <p className="text-[10px] text-muted-foreground leading-tight">@{groupBotUsername}</p>
            </div>
            {groupBotWebhookActive && (
              <Badge className="text-[7px] px-1.5 py-0 h-3.5 bg-emerald-500/10 text-emerald-400 border-emerald-500/15 gap-0.5 rounded-full shrink-0">
                <Wifi className="h-2 w-2" /> Active
              </Badge>
            )}
          </div>
        )}

        {/* Verify Error */}
        {groupBotVerifyError && (
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-card/30 border border-destructive/20">
            <AlertCircle className="h-2.5 w-2.5 text-destructive shrink-0" />
            <p className="text-[10px] text-destructive leading-tight">{groupBotVerifyError}</p>
          </div>
        )}

        {/* Activate Button */}
        {isVerifiedOrSaved && !groupBotWebhookActive && (
          <Button
            size="sm"
            onClick={onActivateGroupBot}
            disabled={isActivatingGroupBot}
            className="w-full h-7 gap-1.5 text-[11px] bg-gradient-to-r from-emerald-600 to-green-600 hover:from-emerald-500 hover:to-green-500 rounded-xl"
          >
            {isActivatingGroupBot ? <Loader2 className="h-3 w-3 animate-spin" /> : <Wifi className="h-3 w-3" />}
            Activate Group Assistant
          </Button>
        )}

        {/* Control Strip */}
        {isVerifiedOrSaved && (
          <div className="rounded-xl bg-card/30 border border-border/30 overflow-hidden">
            <div className={cn("flex items-center justify-between px-3 py-2 transition-colors", !groupBotActive && "bg-destructive/[0.04]")}>
              <div className="flex items-center gap-2.5">
                <div className={cn("h-5 w-5 rounded-lg flex items-center justify-center", groupBotActive ? "bg-emerald-500/10" : "bg-destructive/10")}>
                  <Power className={cn("h-2.5 w-2.5", groupBotActive ? "text-emerald-400" : "text-destructive")} />
                </div>
                <div>
                  <p className="text-[11px] font-medium leading-tight">Bot Active</p>
                  <p className={cn("text-[8px] leading-tight", groupBotActive ? "text-emerald-400/60" : "text-destructive/60")}>
                    {groupBotActive ? "Responding normally" : "Completely silent"}
                  </p>
                </div>
              </div>
              <Switch checked={groupBotActive} onCheckedChange={onGroupBotActiveChange} />
            </div>

            <div className="h-px bg-border/20 mx-3" />

            <div className={cn("flex items-center justify-between px-3 py-2 transition-all", !groupBotActive && "opacity-30 pointer-events-none")}>
              <div className="flex items-center gap-2.5">
                <div className={cn("h-5 w-5 rounded-lg flex items-center justify-center", groupBotAllowDm ? "bg-blue-500/10" : "bg-muted/30")}>
                  <MessageSquare className={cn("h-2.5 w-2.5", groupBotAllowDm ? "text-blue-400" : "text-muted-foreground/50")} />
                </div>
                <div>
                  <p className="text-[11px] font-medium leading-tight">Private DM</p>
                  <p className={cn("text-[8px] leading-tight", groupBotAllowDm ? "text-blue-400/60" : "text-muted-foreground/40")}>
                    {groupBotAllowDm ? "Anyone can chat privately" : "DMs blocked"}
                  </p>
                </div>
              </div>
              <Switch checked={groupBotAllowDm} onCheckedChange={onGroupBotAllowDmChange} disabled={!groupBotActive} />
            </div>

            <div className="h-px bg-border/20 mx-3" />

            <div className={cn("flex items-center justify-between px-3 py-2 transition-all", !groupBotActive && "opacity-30 pointer-events-none")}>
              <div className="flex items-center gap-2.5">
                <div className={cn("h-5 w-5 rounded-lg flex items-center justify-center", groupBotAllowWebSearch ? "bg-teal-500/10" : "bg-muted/30")}>
                  <Globe className={cn("h-2.5 w-2.5", groupBotAllowWebSearch ? "text-teal-400" : "text-muted-foreground/50")} />
                </div>
                <div>
                  <p className="text-[11px] font-medium leading-tight">Web Search</p>
                  <p className={cn("text-[8px] leading-tight", groupBotAllowWebSearch ? "text-teal-400/60" : "text-muted-foreground/40")}>
                    {groupBotAllowWebSearch ? "Can search the internet" : "Knowledge Base only"}
                  </p>
                </div>
              </div>
              <Switch checked={groupBotAllowWebSearch} onCheckedChange={onGroupBotAllowWebSearchChange} disabled={!groupBotActive} />
            </div>
          </div>
        )}

        {/* Trigger Word */}
        <div className="px-3 py-2 rounded-xl bg-card/30 border border-border/30">
          <div className="flex items-center gap-2 mb-1.5">
            <div className="h-5 w-5 rounded-lg bg-amber-500/10 flex items-center justify-center">
              <AtSign className="h-2.5 w-2.5 text-amber-400" />
            </div>
            <Label htmlFor="trigger-word-neural" className="text-[11px] font-medium flex-1">
              Trigger Word
            </Label>
            {isSavingTrigger && (
              <span className="text-[8px] text-muted-foreground/50 flex items-center gap-1">
                <Loader2 className="h-2 w-2 animate-spin" /> saving...
              </span>
            )}
          </div>
          <input
            id="trigger-word-neural"
            type="text"
            value={triggerWord}
            onChange={(e) => onTriggerWordChange(e.target.value)}
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
            <CollapsibleTrigger className="w-full flex items-center justify-between px-3 py-2 hover:bg-white/[0.02] transition-colors">
              <div className="flex items-center gap-2">
                <div className="h-5 w-5 rounded-lg bg-purple-500/10 flex items-center justify-center">
                  <Brain className="h-2.5 w-2.5 text-purple-400" />
                </div>
                <span className="text-[11px] font-medium">Custom Persona</span>
                {groupBotCustomInstruction && (
                  <Badge className="text-[7px] px-1 py-0 h-3 bg-purple-500/10 text-purple-400 border-purple-500/15 rounded-full">Active</Badge>
                )}
                {isSavingInstruction && (
                  <Loader2 className="h-2 w-2 animate-spin text-muted-foreground/40" />
                )}
              </div>
              {isPersonaOpen ? <ChevronDown className="h-2.5 w-2.5 text-muted-foreground/50" /> : <ChevronRight className="h-2.5 w-2.5 text-muted-foreground/50" />}
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="px-3 pb-2.5 space-y-1">
                <Textarea
                  value={groupBotCustomInstruction}
                  onChange={(e) => onGroupBotCustomInstructionChange?.(e.target.value)}
                  placeholder="e.g., You are a Crypto Expert who specializes in DeFi..."
                  className="min-h-[60px] text-[10px] resize-none bg-card/20 border border-border/30 rounded-lg"
                  maxLength={2000}
                />
                <div className="flex items-center justify-between">
                  <p className="text-[7px] text-muted-foreground/40">💡 Auto-saved · BeeBot can configure remotely</p>
                  <span className="text-[7px] text-muted-foreground/30">{groupBotCustomInstruction.length}/2000</span>
                </div>
              </div>
            </CollapsibleContent>
          </div>
        </Collapsible>

        {/* Bot Token */}
        <Collapsible open={isTokenOpen} onOpenChange={setIsTokenOpen}>
          <div className="rounded-xl bg-card/30 border border-border/30 overflow-hidden">
            <CollapsibleTrigger className="w-full flex items-center justify-between px-3 py-2 hover:bg-white/[0.02] transition-colors">
              <div className="flex items-center gap-2">
                <div className="h-5 w-5 rounded-lg bg-cyan-500/10 flex items-center justify-center">
                  <KeyRound className="h-2.5 w-2.5 text-cyan-400" />
                </div>
                <span className="text-[11px] font-medium">Bot Token</span>
                {isVerifiedOrSaved && !tokenDirty && (
                  <Badge className="text-[7px] px-1 py-0 h-3 bg-emerald-500/10 text-emerald-400 border-emerald-500/15 rounded-full">Configured</Badge>
                )}
                {tokenDirty && (
                  <Badge className="text-[7px] px-1 py-0 h-3 bg-amber-500/10 text-amber-400 border-amber-500/15 rounded-full">Unsaved</Badge>
                )}
                {tokenSaved && (
                  <CheckCircle2 className="h-2.5 w-2.5 text-emerald-400" />
                )}
              </div>
              {isTokenOpen ? <ChevronDown className="h-2.5 w-2.5 text-muted-foreground/50" /> : <ChevronRight className="h-2.5 w-2.5 text-muted-foreground/50" />}
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="px-3 pb-2.5 space-y-1.5">
                <div className="relative">
                  <Lock className="absolute left-2 top-1/2 -translate-y-1/2 h-2.5 w-2.5 text-muted-foreground/40" />
                  <input
                    type={showGroupToken ? "text" : "password"}
                    value={groupBotToken}
                    onChange={(e) => onGroupBotTokenChange?.(e.target.value)}
                    placeholder="Bot Token from @BotFather"
                    className="flex h-7 w-full pl-7 pr-7 text-[10px] font-mono shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring placeholder:text-muted-foreground/30 bg-card/20 border border-border/30 rounded-lg"
                  />
                  <button
                    type="button"
                    onClick={() => setShowGroupToken(!showGroupToken)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground/40 hover:text-foreground transition-colors"
                  >
                    {showGroupToken ? <EyeOff className="h-2.5 w-2.5" /> : <Eye className="h-2.5 w-2.5" />}
                  </button>
                </div>

                <div className="flex gap-1.5">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={onSaveGroupBotToken}
                    disabled={isSavingToken || !groupBotToken.trim() || !tokenDirty}
                    className={cn("flex-1 h-7 gap-1 text-[9px] rounded-lg transition-all",
                      tokenSaved ? "border-emerald-500/30 bg-emerald-500/[0.06] text-emerald-400" : "border-border/40 hover:border-border/70"
                    )}
                  >
                    {isSavingToken ? <Loader2 className="h-2.5 w-2.5 animate-spin" /> : tokenSaved ? <CheckCircle2 className="h-2.5 w-2.5" /> : <Save className="h-2.5 w-2.5" />}
                    {tokenSaved ? "Saved" : "Save"}
                  </Button>

                  <Button
                    variant="outline"
                    size="sm"
                    onClick={onVerifyGroupBot}
                    disabled={isVerifyingGroupBot || !groupBotToken.trim() || isVerifiedOrSaved}
                    className={cn("flex-1 h-7 gap-1 text-[9px] rounded-lg transition-all",
                      isVerifiedOrSaved
                        ? "border-emerald-500/30 bg-emerald-500/[0.06] text-emerald-400"
                        : "border-emerald-500/15 hover:border-emerald-500/30 hover:bg-emerald-500/[0.04]"
                    )}
                  >
                    {isVerifyingGroupBot ? <Loader2 className="h-2.5 w-2.5 animate-spin" /> : isVerifiedOrSaved ? <CheckCircle2 className="h-2.5 w-2.5" /> : <ShieldCheck className="h-2.5 w-2.5" />}
                    {isVerifiedOrSaved ? "Verified" : "Verify"}
                  </Button>
                </div>

                <p className="text-[8px] text-muted-foreground/40">
                  Save stores the token · Verify confirms it's valid with Telegram · Create a separate bot via @BotFather
                </p>
              </div>
            </CollapsibleContent>
          </div>
        </Collapsible>

        {/* Reset Group Bot — Standalone Danger Zone */}
        {onDeleteGroupBot && (groupBotUsername || groupBotToken) && (
          <div className="rounded-xl bg-card/30 border border-destructive/10 p-3">
            <div className="flex items-center gap-2 mb-1.5">
              <div className="h-5 w-5 rounded-lg bg-destructive/10 flex items-center justify-center">
                <Trash2 className="h-2.5 w-2.5 text-destructive/60" />
              </div>
              <span className="text-[11px] font-medium text-destructive/70">Danger Zone</span>
            </div>
            {!showDeleteConfirm ? (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowDeleteConfirm(true)}
                className="w-full h-7 text-[10px] text-destructive/60 hover:text-destructive hover:bg-destructive/10 gap-1.5"
              >
                <Trash2 className="h-2.5 w-2.5" /> Reset Group Bot
              </Button>
            ) : (
              <div className="flex items-center gap-1.5 p-2 rounded-lg border border-destructive/20 bg-destructive/[0.04]">
                <p className="text-[9px] text-destructive/80 flex-1">Reset all Group Bot config?</p>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={async () => { await onDeleteGroupBot(); setShowDeleteConfirm(false); }}
                  disabled={isDeletingGroupBot}
                  className="h-5 px-2 text-[8px] rounded-md"
                >
                  {isDeletingGroupBot ? <Loader2 className="h-2 w-2 animate-spin" /> : "Confirm"}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowDeleteConfirm(false)}
                  className="h-5 px-2 text-[8px] rounded-md"
                >
                  Cancel
                </Button>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
