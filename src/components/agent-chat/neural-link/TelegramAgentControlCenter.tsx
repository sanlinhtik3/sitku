import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import {
  Activity,
  Bot,
  CheckCircle2,
  Eye,
  Gauge,
  Lock,
  Megaphone,
  MessageSquare,
  Radio,
  ShieldCheck,
  Sparkles,
  Users,
} from "lucide-react";
import type { BotSettings, BroadcastChannel, GroupBot } from "./types";

interface TelegramAgentControlCenterProps {
  selectedBot: BotSettings;
  groupBots: GroupBot[];
  channels: BroadcastChannel[];
  logsCount: number;
  isOwnerLinked: boolean;
  isWebhookActive: boolean;
  onNavigate: (tab: "settings" | "groupbot" | "channels" | "logs") => void;
}

type ControlState = "ready" | "partial" | "off";

const stateCopy: Record<ControlState, { label: string; className: string }> = {
  ready: { label: "Ready", className: "bg-emerald-500/12 text-emerald-300 border-emerald-400/25" },
  partial: { label: "Needs setup", className: "bg-amber-500/12 text-amber-300 border-amber-400/25" },
  off: { label: "Off", className: "bg-muted/50 text-muted-foreground border-border/50" },
};

function StatusBadge({ state }: { state: ControlState }) {
  const copy = stateCopy[state];
  return (
    <Badge className={cn("h-6 rounded-full px-2.5 text-[10px] font-semibold border", copy.className)}>
      {state === "ready" && <CheckCircle2 className="mr-1 h-3 w-3" />}
      {copy.label}
    </Badge>
  );
}

function MetricPill({ icon: Icon, label, value }: { icon: typeof Bot; label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-[18px] border border-white/[0.07] bg-black/25 px-3 py-2">
      <div className="flex min-w-0 items-center gap-1.5 text-[10px] font-medium text-muted-foreground">
        <Icon className="h-3.5 w-3.5 shrink-0 text-primary" />
        <span className="truncate">{label}</span>
      </div>
      <div className="mt-1 text-sm font-semibold text-foreground">{value}</div>
    </div>
  );
}

function CapabilityCard({
  icon: Icon,
  title,
  desc,
  state,
  bullets,
  action,
  onClick,
}: {
  icon: typeof Bot;
  title: string;
  desc: string;
  state: ControlState;
  bullets: string[];
  action: string;
  onClick: () => void;
}) {
  return (
    <Card className="overflow-hidden rounded-[22px] border-white/[0.07] bg-[linear-gradient(135deg,rgba(255,255,255,0.045),rgba(255,255,255,0.018))] shadow-[0_18px_60px_-42px_rgba(0,255,170,0.36)]">
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-primary/20 bg-primary/10">
            <Icon className="h-5 w-5 text-primary" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-2">
              <div>
                <h4 className="text-sm font-semibold leading-tight">{title}</h4>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{desc}</p>
              </div>
              <StatusBadge state={state} />
            </div>
            <div className="mt-3 grid gap-2 sm:grid-cols-3">
              {bullets.map((item) => (
                <div key={item} className="rounded-xl border border-white/8 bg-black/20 px-2.5 py-2 text-[11px] leading-snug text-muted-foreground">
                  {item}
                </div>
              ))}
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="mt-3 h-8 rounded-full border border-white/10 bg-white/[0.04] px-3 text-xs hover:bg-primary/10 hover:text-primary"
              onClick={onClick}
            >
              {action}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export function TelegramAgentControlCenter({
  selectedBot,
  groupBots,
  channels,
  logsCount,
  isOwnerLinked,
  isWebhookActive,
  onNavigate,
}: TelegramAgentControlCenterProps) {
  const activeGroups = groupBots.filter((bot) => bot.is_active && bot.bot_token).length;
  const activeChannels = channels.filter((channel) => channel.is_active).length;
  const dmState: ControlState = selectedBot.telegram_bot_token && selectedBot.is_active && isWebhookActive && isOwnerLinked ? "ready" : selectedBot.telegram_bot_token ? "partial" : "off";
  const groupState: ControlState = activeGroups > 0 ? "ready" : groupBots.length > 0 ? "partial" : "off";
  const broadcastState: ControlState = activeChannels > 0 ? "ready" : channels.length > 0 ? "partial" : "off";

  return (
    <div className="space-y-4">
      <div className="relative overflow-hidden rounded-[26px] border border-primary/15 bg-[radial-gradient(circle_at_top_left,rgba(0,255,170,0.14),transparent_38%),linear-gradient(135deg,rgba(255,255,255,0.045),rgba(255,255,255,0.018))] p-4 sm:p-5">
        <div className="relative z-10 flex flex-col gap-4">
          <div className="max-w-2xl">
            <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.22em] text-primary">
              <ShieldCheck className="h-4 w-4" />
              Telegram Agentic Era Control
            </div>
            <h3 className="mt-2 text-xl font-bold tracking-tight sm:text-2xl">BeeBot brain, Telegram-ready boundaries</h3>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              Group agents run as read-only child agents. They can use group-safe context and tools, while BeeBot's private Memory Vault stays protected.
            </p>
          </div>
          <div className="grid w-full grid-cols-2 gap-2 sm:grid-cols-4">
            <MetricPill icon={Bot} label="DM bot" value={dmState === "ready" ? "Online" : "Setup"} />
            <MetricPill icon={Users} label="Groups" value={`${activeGroups}/${groupBots.length}`} />
            <MetricPill icon={Megaphone} label="Channels" value={`${activeChannels}/${channels.length}`} />
            <MetricPill icon={Activity} label="Logs" value={`${logsCount}`} />
          </div>
        </div>
      </div>

      <div className="grid gap-3">
        <CapabilityCard
          icon={MessageSquare}
          title="Private Telegram Chat"
          desc="Verified owner chat that can use BeeBot's main assistant flow."
          state={dmState}
          bullets={["Owner link required", "Webhook delivery", "Same BeeBot chat brain"]}
          action="Open assistant setup"
          onClick={() => onNavigate("settings")}
        />
        <CapabilityCard
          icon={Users}
          title="Group Assistant"
          desc="Public group agent for community replies, Q&A, and app guidance."
          state={groupState}
          bullets={["Read-only memory", "Group-scoped recall", "No Memory Vault writes"]}
          action="Manage group bots"
          onClick={() => onNavigate("groupbot")}
        />
        <CapabilityCard
          icon={Megaphone}
          title="Channel Broadcast"
          desc="Scheduled Telegram channel delivery with quality gates and delivery proof."
          state={broadcastState}
          bullets={["Verified channels", "Quality holdback", "Delivery logs"]}
          action="Open broadcast"
          onClick={() => onNavigate("channels")}
        />
      </div>

      <div className="grid gap-3 lg:grid-cols-3">
        <div className="rounded-[22px] border border-emerald-400/15 bg-emerald-500/[0.055] p-4">
          <div className="flex items-center gap-2 text-sm font-semibold text-emerald-200">
            <Eye className="h-4 w-4" />
            Memory Access
          </div>
          <div className="mt-3 space-y-2 text-xs text-muted-foreground">
            <p>Group: read-only, group-safe context only.</p>
            <p>Private owner memory is blocked on public Telegram surfaces.</p>
            <p>Durable memory writes stay inside BeeBot app Memory Vault.</p>
          </div>
        </div>
        <div className="rounded-[22px] border border-cyan-400/15 bg-cyan-500/[0.05] p-4">
          <div className="flex items-center gap-2 text-sm font-semibold text-cyan-200">
            <Lock className="h-4 w-4" />
            Tool Policy
          </div>
          <div className="mt-3 space-y-2 text-xs text-muted-foreground">
            <p>Allowed: public knowledge, group recall, session recall, navigation.</p>
            <p>Optional: web search when group bot enables it.</p>
            <p>Blocked: memory write, finance, admin actions, broadcast from group.</p>
          </div>
        </div>
        <div className="rounded-[22px] border border-violet-400/15 bg-violet-500/[0.055] p-4">
          <div className="flex items-center gap-2 text-sm font-semibold text-violet-200">
            <Gauge className="h-4 w-4" />
            Quality Gates
          </div>
          <div className="mt-3 space-y-2 text-xs text-muted-foreground">
            <p>Public replies must be grounded and concise.</p>
            <p>Channel posts use broadcast quality holdback before delivery.</p>
            <p>Logs keep transparency without exposing run traces in chat UX.</p>
          </div>
        </div>
      </div>

      <div className="rounded-[22px] border border-white/8 bg-white/[0.035] p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2 text-sm font-semibold">
              <Sparkles className="h-4 w-4 text-primary" />
              Production rollout checklist
            </div>
            <p className="mt-1 text-xs text-muted-foreground">Phase 2 surfaces the policy layer. Phase 3 should add Telegram evals and per-group training packs.</p>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="h-9 rounded-full border-white/10 bg-white/[0.04] text-xs"
            onClick={() => onNavigate("logs")}
          >
            <Radio className="mr-2 h-3.5 w-3.5" />
            View logs
          </Button>
        </div>
      </div>
    </div>
  );
}
