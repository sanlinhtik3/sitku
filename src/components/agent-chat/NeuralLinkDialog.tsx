import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import * as VisuallyHidden from "@radix-ui/react-visually-hidden";
import { Brain, RefreshCw, Shield, Bot, MessageSquare, Megaphone, Loader2, Pencil, Save, Zap, Users, X, SlidersHorizontal, Send } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useNeuralLinkData } from "./neural-link/useNeuralLinkData";
import { BotListPanel } from "./neural-link/BotListPanel";
import { BotSettingsTab } from "./neural-link/BotSettingsTab";
import { BotChatLogsTab } from "./neural-link/BotChatLogsTab";
import { BroadcastChannelsSection } from "./neural-link/BroadcastChannelsSection";
import { GroupBotsSection } from "./neural-link/GroupBotsSection";
import { TelegramAgentControlCenter } from "./neural-link/TelegramAgentControlCenter";
import { CreateBotModal } from "./neural-link/CreateBotModal";
import { DeleteBotDialog } from "./neural-link/DeleteBotDialog";

import { toast } from "sonner";
import type { BotSettings as BotSettingsType } from "./neural-link/types";

interface NeuralLinkDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: string;
}

function HeaderChip({ icon: Icon, label, value }: { icon: typeof Bot; label: string; value: number }) {
  return (
    <div className="flex h-8 items-center gap-1.5 rounded-full border border-white/[0.07] bg-white/[0.035] px-2.5 text-[11px] text-muted-foreground">
      <Icon className="h-3.5 w-3.5 text-primary" />
      <span className="hidden lg:inline">{label}</span>
      <span className="font-semibold tabular-nums text-foreground">{value}</span>
    </div>
  );
}

export function NeuralLinkDialog({ open, onOpenChange, userId }: NeuralLinkDialogProps) {
  const { isAdmin } = useAuth();
  const [activeTab, setActiveTab] = useState("control");
  const [showCreateModal, setShowCreateModal] = useState(false);
  
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState("");
  const [editDescription, setEditDescription] = useState("");

  const {
    bots, isLoadingBots, selectedBot, selectedBotId, setSelectedBotId,
    createBot, isCreatingBot, updateBot, isUpdatingBot, deleteBot, isDeletingBot,
    toggleBot, isTogglingBot,
    subscription, isLoadingSubscription, isSubscriptionActive, remainingTrialDays, maxBots, canCreateBot,
    chatLogs, isLoadingLogs,
    channels, isLoadingChannels,
    groupBots, isLoadingGroupBots,
    hasSharedKey, sharedKeyModel,
    ownerIdentity, setOwnerIdentity, ownerDisplayName,
    isTokenSet, isWebhookActive, isOwnerLinked, isLevel4,
    fetchAll,
  } = useNeuralLinkData(userId, open, isAdmin);

  useEffect(() => {
    setEditName(selectedBot?.name || "");
    setEditDescription(selectedBot?.description || "");
    setIsEditing(false);
  }, [selectedBot?.id, selectedBot?.name, selectedBot?.description]);

  const handleSelectBot = (bot: BotSettingsType) => setSelectedBotId(bot.id);

  const handleCreateClick = () => setShowCreateModal(true);

  const handleSaveSettings = async (input: Partial<BotSettingsType>) => {
    if (!selectedBot) return;
    await updateBot({ id: selectedBot.id, ...input });
    fetchAll();
  };

  const handleSaveNameDescription = async () => {
    if (!selectedBot || !editName.trim()) return;
    await updateBot({ id: selectedBot.id, name: editName.trim(), description: editDescription.trim() || null });
    setIsEditing(false);
  };


  const activeBots = bots.filter(b => b.is_active && b.telegram_bot_token).length;

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent aria-describedby={undefined} className="!inset-0 !translate-x-0 !translate-y-0 !max-w-[calc(100vw-20px)] !w-[calc(100vw-20px)] !h-[calc(100dvh-20px-env(safe-area-inset-top,0px))] !max-h-[calc(100dvh-20px-env(safe-area-inset-top,0px))] flex flex-col !p-0 !gap-0 !rounded-[32px] lg:border lg:border-white/[0.08] overflow-hidden bg-[linear-gradient(180deg,#080a0c_0%,#050607_44%,#030405_100%)] backdrop-blur-2xl shadow-[0_24px_80px_rgba(0,0,0,0.52)] [&>button:last-child]:hidden m-[10px] mt-[max(10px,env(safe-area-inset-top,10px))] pb-[env(safe-area-inset-bottom)]">
          <VisuallyHidden.Root><DialogTitle>Neural Link</DialogTitle></VisuallyHidden.Root>

          {/* Integrated header */}
          <div className="shrink-0 px-4 pt-4 pb-3">
            <div className="flex items-center gap-2.5">
              <div className="relative shrink-0">
                <div className={cn(
                  "h-9 w-9 rounded-[18px] flex items-center justify-center border shadow-[0_0_20px_hsl(var(--primary)/0.08)] transition-all",
                  isLevel4 ? "border-violet-400/25 bg-violet-500/12 text-violet-200" : "border-primary/18 bg-primary/10 text-primary"
                )}>
                  <Brain className="h-4 w-4" />
                </div>
                {isLevel4 && (
                  <div className="absolute -bottom-0.5 -right-0.5 h-4 w-4 rounded-full bg-violet-500 border-2 border-[#080a0c] flex items-center justify-center">
                    <Shield className="h-2 w-2 text-white" />
                  </div>
                )}
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h2 className="text-sm font-semibold leading-tight text-foreground">
                  Neural Link
                  </h2>
                  <span className="hidden rounded-full border border-primary/15 bg-primary/10 px-2 py-0.5 text-[9px] font-semibold text-primary sm:inline-flex">
                    Telegram bridge
                  </span>
                  {isLevel4 && (
                    <span className="hidden rounded-full border border-violet-400/20 bg-violet-500/10 px-2 py-0.5 text-[9px] font-semibold text-violet-200 sm:inline-flex">
                      Level 4
                    </span>
                  )}
                </div>
                <p className="mt-0.5 text-[11px] leading-tight text-muted-foreground/75">
                  {bots.length} bot{bots.length !== 1 ? "s" : ""} · {activeBots} active · {groupBots.length} groups · {channels.length} channels
                </p>
              </div>

              <div className="ml-auto hidden items-center gap-1.5 md:flex">
                <HeaderChip icon={Bot} label="Bots" value={bots.length} />
                <HeaderChip icon={Users} label="Groups" value={groupBots.length} />
                <HeaderChip icon={Megaphone} label="Channels" value={channels.length} />
              </div>

              <Button
                variant="ghost"
                size="icon"
                className="ml-auto h-8 w-8 rounded-full border border-white/[0.07] bg-white/[0.035] text-muted-foreground transition-colors hover:bg-white/[0.08] hover:text-foreground md:ml-0"
                onClick={() => { fetchAll(); toast.success("Refreshing..."); }}
                aria-label="Refresh Neural Link"
              >
                <RefreshCw className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 rounded-full border border-white/[0.07] bg-white/[0.035] text-muted-foreground transition-colors hover:bg-white/[0.08] hover:text-foreground"
                onClick={() => onOpenChange(false)}
                aria-label="Close Neural Link"
              >
                <X className="h-4 w-4" />
              </Button>
              {canCreateBot && (
                <Button
                  size="sm"
                  className="hidden h-8 rounded-full bg-primary px-3 text-[11px] font-semibold text-primary-foreground shadow-[0_0_18px_hsl(var(--primary)/0.18)] hover:bg-primary/90 sm:flex"
                  onClick={handleCreateClick}
                >
                  <Send className="mr-1.5 h-3.5 w-3.5" />
                  New bot
                </Button>
              )}
              </div>
          </div>

          {/* Content: Sidebar + Detail */}
          <div className="flex-1 flex flex-col lg:flex-row min-h-0 overflow-hidden gap-3 px-3 pb-3 sm:px-4 sm:pb-4">
            <BotListPanel
              bots={bots}
              selectedBotId={selectedBotId}
              onSelectBot={handleSelectBot}
              isLoading={isLoadingBots}
              channels={channels}
              groupBots={groupBots}
              onCreateBot={() => setShowCreateModal(true)}
              canCreateBot={canCreateBot}
            />

            {selectedBot ? (
              <div className="flex-1 flex flex-col min-h-0 min-w-0 overflow-hidden rounded-[26px] border border-white/[0.065] bg-black/20">
                {/* Bot Header */}
                <div className="shrink-0 px-4 pt-3 pb-3 border-b border-white/[0.06]">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <div className="relative shrink-0">
                        <div className={cn(
                          "h-10 w-10 rounded-[18px] flex items-center justify-center border",
                          selectedBot.is_active && selectedBot.telegram_bot_token
                            ? "border-emerald-400/20 bg-emerald-500/12 text-emerald-300"
                            : "border-primary/18 bg-primary/10 text-primary"
                        )}>
                          <Bot className="h-4.5 w-4.5" />
                        </div>
                        <div className={cn(
                          "absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-[#050607]",
                          selectedBot.is_active && selectedBot.telegram_bot_token ? "bg-green-500" : "bg-muted-foreground/50"
                        )} />
                      </div>
                      {isEditing ? (
                        <div className="flex-1 space-y-2">
                          <Input value={editName} onChange={(e) => setEditName(e.target.value)} className="h-8 text-sm font-medium" placeholder="Bot name" maxLength={50} />
                          <Input value={editDescription} onChange={(e) => setEditDescription(e.target.value)} className="h-7 text-xs" placeholder="Description" maxLength={200} />
                        </div>
                      ) : (
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <h3 className="text-sm font-semibold truncate">{selectedBot.name}</h3>
                            <Button variant="ghost" size="icon" className="h-6 w-6 rounded-full shrink-0 text-muted-foreground hover:text-foreground hover:bg-white/[0.06]" onClick={() => setIsEditing(true)}><Pencil className="h-3 w-3" /></Button>
                            {isLevel4 && (
                              <Badge className="text-[9px] px-2 py-0.5 h-5 rounded-full bg-violet-500/10 text-violet-200 border border-violet-400/20 shadow-[0_0_12px_-2px] shadow-violet-500/30 shrink-0">
                                <Zap className="h-2.5 w-2.5 mr-1" />Level 4
                              </Badge>
                            )}
                          </div>
                          <div className="flex items-center gap-1.5">
                            <p className="text-xs text-muted-foreground truncate">{selectedBot.description || (selectedBot.is_active ? 'Active' : 'Configure to activate')}</p>
                            {selectedBot.bot_username && (
                              <Badge className="text-[8px] px-1.5 py-0 h-3.5 bg-green-500/10 text-green-400 border-green-500/20 shrink-0 gap-0.5">
                                <Bot className="h-2 w-2" />@{selectedBot.bot_username}
                              </Badge>
                            )}
                            {!selectedBot.bot_username && selectedBot.telegram_bot_token && (
                              <div className="flex items-center gap-1 shrink-0">
                                <div className="h-1.5 w-1.5 rounded-full bg-amber-400" />
                                <span className="text-[8px] text-amber-400">Token set</span>
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {isEditing && (
                        <>
                          <Button variant="ghost" size="sm" className="h-8 rounded-full" onClick={() => { setEditName(selectedBot.name || ""); setEditDescription(selectedBot.description || ""); setIsEditing(false); }} disabled={isUpdatingBot}>Cancel</Button>
                          <Button size="sm" onClick={handleSaveNameDescription} disabled={isUpdatingBot || !editName.trim()} className="h-8 rounded-full gap-1.5">
                            {isUpdatingBot ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}Save
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                {/* Tabs */}
                <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col min-h-0">
                  <div className="px-4 pt-3 shrink-0">
                    <TabsList className="w-full justify-start h-auto p-1 bg-black/30 border border-white/[0.06] rounded-full overflow-x-auto flex-nowrap scrollbar-hide backdrop-blur-sm">
                      <TabsTrigger value="control" className="text-[10px] sm:text-xs whitespace-nowrap rounded-full data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-[0_0_14px_hsl(var(--primary)/0.18)] transition-all gap-1.5">
                        <SlidersHorizontal className="h-3.5 w-3.5" />Control
                      </TabsTrigger>
                      <TabsTrigger value="settings" className="text-[10px] sm:text-xs whitespace-nowrap rounded-full data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-[0_0_14px_hsl(var(--primary)/0.18)] transition-all gap-1.5">
                        <Brain className="h-3.5 w-3.5" />Assistant
                      </TabsTrigger>
                      <TabsTrigger value="groupbot" className="text-[10px] sm:text-xs whitespace-nowrap rounded-full data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-[0_0_14px_hsl(var(--primary)/0.18)] transition-all gap-1.5">
                        <Users className="h-3.5 w-3.5" />Group
                      </TabsTrigger>
                      <TabsTrigger value="channels" className="text-[10px] sm:text-xs whitespace-nowrap rounded-full data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-[0_0_14px_hsl(var(--primary)/0.18)] transition-all gap-1.5">
                        <Megaphone className="h-3.5 w-3.5" />Broadcast
                      </TabsTrigger>
                      <TabsTrigger value="logs" className="text-[10px] sm:text-xs whitespace-nowrap rounded-full data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-[0_0_14px_hsl(var(--primary)/0.18)] transition-all gap-1.5">
                        <MessageSquare className="h-3.5 w-3.5" />Logs
                        {chatLogs.length > 0 && <Badge variant="secondary" className="ml-1 text-[9px] px-1.5 py-0 h-4">{chatLogs.length}</Badge>}
                      </TabsTrigger>
                    </TabsList>
                  </div>

                  <div className="flex-1 overflow-y-auto overflow-x-hidden min-w-0 px-4 py-4 custom-scrollbar">
                    <TabsContent value="control" className="m-0">
                      <TelegramAgentControlCenter
                        selectedBot={selectedBot}
                        groupBots={groupBots}
                        channels={channels}
                        logsCount={chatLogs.length}
                        isOwnerLinked={isOwnerLinked}
                        isWebhookActive={isWebhookActive}
                        onNavigate={setActiveTab as (tab: "settings" | "groupbot" | "channels" | "logs") => void}
                      />
                    </TabsContent>

                    <TabsContent value="settings" className="m-0">
                      <BotSettingsTab
                        bot={selectedBot}
                        onSave={handleSaveSettings}
                        isSaving={isUpdatingBot}
                        hasSharedKey={hasSharedKey}
                        sharedKeyModel={sharedKeyModel}
                        userId={userId}
                        onKeyUpdated={fetchAll}
                        isTokenSet={isTokenSet}
                        isWebhookActive={isWebhookActive}
                        isOwnerLinked={isOwnerLinked}
                        isLevel4={isLevel4}
                        ownerIdentity={ownerIdentity}
                        setOwnerIdentity={setOwnerIdentity}
                        fetchAll={fetchAll}
                        onDelete={() => setShowDeleteDialog(true)}
                      />
                    </TabsContent>

                    <TabsContent value="groupbot" className="m-0">
                      <GroupBotsSection
                        userId={userId}
                        groupBots={groupBots}
                        fetchAll={fetchAll}
                        ownerDisplayName={ownerDisplayName}
                      />
                    </TabsContent>

                    <TabsContent value="channels" className="m-0">
                      <BroadcastChannelsSection
                        userId={userId}
                        botId={selectedBot.id}
                        channels={channels}
                        isLoadingChannels={isLoadingChannels}
                        fetchAll={fetchAll}
                      />
                    </TabsContent>

                    <TabsContent value="logs" className="m-0">
                      <BotChatLogsTab chatLogs={chatLogs} isLoading={isLoadingLogs} />
                    </TabsContent>
                  </div>
                </Tabs>
              </div>
            ) : (
              <div className="flex-1 flex items-center justify-center p-8 rounded-[26px] border border-white/[0.065] bg-black/20">
                <div className="text-center max-w-sm">
                  <div className="h-14 w-14 rounded-[24px] bg-primary/10 border border-primary/18 flex items-center justify-center mx-auto mb-4">
                    <Brain className="h-6 w-6 text-primary" />
                  </div>
                  {bots.length === 0 ? (
                    <>
                      <h3 className="text-sm font-medium mb-4">Get Started with Neural Link</h3>
                      {/* Guided onboarding steps */}
                      <div className="space-y-3 text-left mb-6">
                        {[
                          { step: "1", label: "Create a bot on @BotFather", desc: "Open Telegram, search @BotFather, send /newbot" },
                          { step: "2", label: "Create a bot here", desc: "Click the button below to register" },
                          { step: "3", label: "Paste your bot token", desc: "Copy the token from BotFather into Settings" },
                          { step: "4", label: "Activate Neural Link", desc: "Enable the connection in Settings tab" },
                        ].map((item) => (
                          <div key={item.step} className="flex items-start gap-3 p-3 rounded-[18px] bg-white/[0.035] border border-white/[0.06]">
                            <div className="h-7 w-7 rounded-[12px] bg-primary/10 border border-primary/18 flex items-center justify-center shrink-0 text-primary text-xs font-bold">
                              {item.step}
                            </div>
                            <div>
                              <p className="text-xs font-medium">{item.label}</p>
                              <p className="text-[10px] text-muted-foreground">{item.desc}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                      {canCreateBot && (
                        <Button onClick={() => setShowCreateModal(true)} className="gap-2 bg-gradient-to-r from-violet-500 to-purple-600 w-full">
                          <Bot className="h-4 w-4" /> Create First Bot
                        </Button>
                      )}
                    </>
                  ) : (
                    <>
                      <h3 className="text-sm font-medium mb-1">Select a bot</h3>
                      <p className="text-xs text-muted-foreground">Select a bot from the sidebar</p>
                    </>
                  )}
                </div>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <CreateBotModal open={showCreateModal} onOpenChange={setShowCreateModal} onCreate={async (name: string, description: string) => { await createBot({ name, description }); }} isCreating={isCreatingBot} />
      
      {selectedBot && (
        <DeleteBotDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog} botName={selectedBot.name || "Bot"} onConfirm={async () => { await deleteBot(selectedBot.id); }} isDeleting={isDeletingBot} />
      )}
    </>
  );
}

export default NeuralLinkDialog;
