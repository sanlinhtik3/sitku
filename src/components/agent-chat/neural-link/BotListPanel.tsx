import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Bot, Users,
  CheckCircle, AlertCircle, Settings, Power, Megaphone, Hash, Star, Clock,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useIsMobile } from "@/hooks/use-mobile";
import type { BotSettings, BroadcastChannel, GroupBot } from "./types";

interface BotListPanelProps {
  bots: BotSettings[];
  selectedBotId: string | null;
  onSelectBot: (bot: BotSettings) => void;
  isLoading: boolean;
  channels: BroadcastChannel[];
  groupBots: GroupBot[];
  onCreateBot?: () => void;
  canCreateBot?: boolean;
}

type BotStatus = 'healthy' | 'idle' | 'error' | 'inactive' | 'not_configured';

function getBotStatus(bot: BotSettings): { status: BotStatus; color: string; message?: string; icon: typeof CheckCircle } {
  if (!bot.is_active) return { status: 'inactive', color: 'bg-muted-foreground/50', icon: Power, message: 'Deactivated' };
  if (!bot.telegram_bot_token) return { status: 'not_configured', color: 'bg-amber-500', icon: Settings, message: 'Not configured' };
  const lastActivity = bot.last_activity_at ? new Date(bot.last_activity_at) : null;
  const lastError = bot.last_error_at ? new Date(bot.last_error_at) : null;
  const now = new Date();
  if (lastError && lastError > new Date(now.getTime() - 3600000)) return { status: 'error', color: 'bg-red-500', icon: AlertCircle, message: bot.last_error_message || 'Error' };
  if (lastActivity && lastActivity > new Date(now.getTime() - 86400000)) return { status: 'healthy', color: 'bg-green-500', icon: CheckCircle, message: 'Working' };
  return { status: 'idle', color: 'bg-amber-500', icon: Clock, message: 'No recent activity' };
}

function formatLastActivity(date: string | null): string {
  if (!date) return 'Never';
  const diffMs = Date.now() - new Date(date).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(diffMs / 3600000);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(diffMs / 86400000)}d ago`;
}

export function BotListPanel({
  bots, selectedBotId, onSelectBot, isLoading,
  channels = [], groupBots = [],
}: BotListPanelProps) {
  const [localBots, setLocalBots] = useState<BotSettings[]>(bots);
  const isMobile = useIsMobile();

  useEffect(() => { setLocalBots(bots); }, [bots]);

  // Realtime updates
  useEffect(() => {
    if (bots.length === 0) return;
    const channel = supabase
      .channel('neural-link-bot-updates')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'bot_settings' }, (payload) => {
        const updated = payload.new as BotSettings;
        setLocalBots(prev => prev.map(b => b.id === updated.id ? { ...b, ...updated } : b));
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [bots.length]);

  if (isLoading) {
    return <div className="w-full lg:w-64 shrink-0 space-y-3 rounded-[26px] border border-white/[0.065] bg-black/20 p-3"><Skeleton className="h-10 w-full" /><Skeleton className="h-16 w-full" /><Skeleton className="h-16 w-full" /></div>;
  }

  // Mobile: Horizontal chip bar
  if (isMobile) {
    return (
      <div className="shrink-0 rounded-[22px] border border-white/[0.065] bg-black/20">
        <div className="flex items-center gap-2 px-3 py-2.5 overflow-x-auto scrollbar-hide">
          {localBots.map((bot) => {
            const si = getBotStatus(bot);
            const isSelected = selectedBotId === bot.id;
            return (
              <button
                key={bot.id}
                onClick={() => onSelectBot(bot)}
                className={cn(
                  "flex items-center gap-2 px-3 py-1.5 rounded-full border whitespace-nowrap shrink-0 transition-all text-xs",
                  isSelected
                    ? "bg-primary text-primary-foreground border-primary shadow-[0_0_14px_hsl(var(--primary)/0.18)]"
                    : "bg-white/[0.035] border-white/[0.07] text-muted-foreground hover:bg-white/[0.06] hover:text-foreground"
                )}
              >
                <div className={cn(
                  "h-2 w-2 rounded-full shrink-0",
                  si.color,
                  si.status === 'healthy' && "shadow-[0_0_6px_theme(colors.green.500/0.5)]"
                )} />
                <span className="font-medium truncate max-w-[100px]">{bot.name}</span>
                {isSelected && bot.bot_username && (
                  <span className="text-[10px] text-muted-foreground">@{bot.bot_username}</span>
                )}
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  // Desktop: Full sidebar
  return (
    <div className="w-full lg:w-64 shrink-0 flex flex-col rounded-[26px] border border-white/[0.065] bg-black/20 overflow-hidden">
      <div className="p-3 border-b border-white/[0.06] flex items-center justify-between">
        <span className="text-[11px] font-semibold text-muted-foreground/80 tracking-wider uppercase flex items-center gap-1.5">
          <Settings className="h-3 w-3" />
          Your Bots
        </span>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-2 space-y-1.5">
          <div className="flex items-center gap-2 px-2 pt-1 pb-2">
            <div className="h-5 w-5 rounded-md bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center"><Bot className="h-3 w-3 text-white" /></div>
            <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">AI Bots</span>
          </div>

          <AnimatePresence mode="popLayout">
            {localBots.length === 0 ? (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="p-4 text-center">
                <div className="h-12 w-12 rounded-2xl bg-muted/50 flex items-center justify-center mx-auto mb-3"><Bot className="h-6 w-6 text-muted-foreground" /></div>
                <p className="text-xs text-muted-foreground mb-2">No bots yet</p>
              </motion.div>
            ) : (
              localBots.map((bot, i) => {
                const si = getBotStatus(bot);
                const SI = si.icon;
                const isSelected = selectedBotId === bot.id;
                return (
                  <motion.button key={bot.id} initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} transition={{ delay: i * 0.05 }}
                    className={cn(
                      "w-full p-2.5 rounded-[18px] text-left transition-all relative group border",
                      isSelected
                        ? "bg-primary/10 border-primary/30 shadow-[0_0_18px_hsl(var(--primary)/0.08)]"
                        : "bg-white/[0.018] hover:bg-white/[0.05] border-transparent hover:border-white/[0.07]"
                    )}
                    onClick={() => onSelectBot(bot)}
                  >
                    <div className="flex items-start gap-2.5">
                      <div className="relative shrink-0 mt-0.5">
                        <div className={cn("h-8 w-8 rounded-[14px] border flex items-center justify-center", si.status === 'healthy' ? "bg-emerald-500/10 border-emerald-400/15" : si.status === 'error' ? "bg-red-500/10 border-red-400/15" : "bg-white/[0.035] border-white/[0.07]")}>
                          <Bot className={cn("h-4 w-4", si.status === 'healthy' ? "text-green-500" : si.status === 'error' ? "text-red-500" : si.status === 'idle' ? "text-amber-500" : "text-muted-foreground")} />
                        </div>
                        <div className={cn(
                          "absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-background",
                          si.color,
                          si.status === 'healthy' && "shadow-[0_0_6px_theme(colors.green.500/0.4)]"
                        )} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <span className="text-xs font-medium truncate block">{bot.name}</span>
                        <p className="text-[10px] text-muted-foreground truncate mt-0.5">{bot.description || si.message}</p>
                        {bot.is_active && bot.telegram_bot_token && (
                          <div className="flex items-center gap-1 mt-1">
                            <SI className={cn("h-2.5 w-2.5", si.status === 'healthy' ? "text-green-500" : si.status === 'error' ? "text-red-500" : "text-amber-500")} />
                            <span className="text-[9px] text-muted-foreground">{formatLastActivity(bot.last_activity_at)}</span>
                          </div>
                        )}
                      </div>
                    </div>
                    {isSelected && <motion.div layoutId="selectedNLBot" className="absolute left-0 inset-y-0 my-auto w-0.5 h-8 bg-primary rounded-full" />}
                  </motion.button>
                );
              })
            )}
          </AnimatePresence>

          {groupBots.length > 0 && (
            <>
              <div className="flex items-center gap-2 px-2 pt-4 pb-2 border-t border-white/[0.06] mt-2">
                <div className="h-5 w-5 rounded-[10px] border border-emerald-400/15 bg-emerald-500/10 flex items-center justify-center"><Users className="h-3 w-3 text-emerald-300" /></div>
                <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Group Bots</span>
                <Badge variant="secondary" className="text-[8px] px-1 py-0 h-3.5 ml-auto">{groupBots.filter(g => g.is_active).length}/{groupBots.length}</Badge>
              </div>
              {groupBots.map((gb) => (
                <div key={gb.id} className="flex items-center gap-2.5 p-2.5 rounded-[18px] opacity-70 hover:opacity-90 hover:bg-white/[0.035] transition-all cursor-default">
                  <div className="h-8 w-8 rounded-[14px] border border-emerald-400/15 bg-emerald-500/10 flex items-center justify-center shrink-0"><Users className="h-4 w-4 text-emerald-400" /></div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5"><span className="text-xs font-medium truncate">{gb.name || gb.bot_name || 'Group Bot'}</span></div>
                    <p className="text-[10px] text-muted-foreground truncate">{gb.bot_username ? `@${gb.bot_username}` : 'Not configured'}</p>
                  </div>
                  <div className={cn("h-1.5 w-1.5 rounded-full shrink-0", gb.is_active && gb.bot_token ? "bg-green-500" : "bg-muted-foreground/50")} />
                </div>
              ))}
            </>
          )}

          {channels.length > 0 && (
            <>
              <div className="flex items-center gap-2 px-2 pt-4 pb-2 border-t border-white/[0.06] mt-2">
                <div className="h-5 w-5 rounded-[10px] border border-cyan-400/15 bg-cyan-500/10 flex items-center justify-center"><Megaphone className="h-3 w-3 text-cyan-300" /></div>
                <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Broadcast</span>
              </div>
              {channels.map((ch) => (
                <div key={ch.id} className="flex items-center gap-2.5 p-2.5 rounded-[18px] opacity-70 hover:opacity-90 hover:bg-white/[0.035] transition-all cursor-default">
                  <div className="h-8 w-8 rounded-[14px] border border-cyan-400/15 bg-cyan-500/10 flex items-center justify-center shrink-0"><Hash className="h-4 w-4 text-cyan-400" /></div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5"><span className="text-xs font-medium truncate">{ch.channel_name}</span>{ch.is_default && <Star className="h-2.5 w-2.5 text-amber-500 fill-amber-500 shrink-0" />}</div>
                    <p className="text-[10px] text-muted-foreground truncate">{ch.channel_id}</p>
                  </div>
                  <div className="h-1.5 w-1.5 rounded-full bg-green-500 shrink-0" />
                </div>
              ))}
            </>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
