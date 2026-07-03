import { useState, useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar, Clock, Repeat, Zap, Send, Globe, Cpu } from "lucide-react";
import { ClockTimePicker } from "@/components/ui/clock-time-picker";
import { cn } from "@/lib/utils";
import { getDeviceTimeSnapshot, buildCronInTimezone, nextOneOffUtc } from "@/lib/deviceTime";

type ScheduleType = "one_off" | "daily" | "weekly" | "monthly";
type DeliveryTarget = "telegram" | "chat";

export interface BroadcastChannel {
  id: string;
  channel_name: string;
  channel_id: string;
  is_default: boolean;
}

interface CreateChannelTaskDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (params: {
    name: string;
    display_name: string;
    cron_expression: string | null;
    task_type: string;
    task_config: Record<string, any>;
    next_run_at?: string;
    is_active?: boolean;
  }) => void;
  isPending: boolean;
  channels?: BroadcastChannel[];
}

const FREQ_OPTIONS: { value: ScheduleType; label: string; icon: typeof Clock }[] = [
  { value: "one_off", label: "Once", icon: Zap },
  { value: "daily", label: "Daily", icon: Clock },
  { value: "weekly", label: "Weekly", icon: Calendar },
  { value: "monthly", label: "Monthly", icon: Repeat },
];

const DELIVERY_OPTIONS: { value: DeliveryTarget; label: string; icon: typeof Send; description: string }[] = [
  { value: "telegram", label: "Telegram", icon: Send, description: "Post to your channel" },
  { value: "chat", label: "Chat Only", icon: Cpu, description: "Results in BeeBot session" },
];

const DAYS_OF_WEEK = [
  { value: "0", label: "Sun" }, { value: "1", label: "Mon" }, { value: "2", label: "Tue" },
  { value: "3", label: "Wed" }, { value: "4", label: "Thu" }, { value: "5", label: "Fri" },
  { value: "6", label: "Sat" },
];

function generateCron(type: ScheduleType, hour: number, minute: number, dayOfWeek: number, dayOfMonth: number, tz: string): string | null {
  if (type === "one_off") return null;
  // Reuse the canonical zone-aware builder so cron always anchors to the
  // user's true local clock (DST + half-hour zones safe).
  return buildCronInTimezone(type, hour, minute, dayOfWeek, dayOfMonth, tz);
}

function computeNextRunAt(hour: number, minute: number, tz: string): string {
  return nextOneOffUtc(hour, minute, tz);
}

export function CreateChannelTaskDialog({ open, onOpenChange, onSubmit, isPending, channels = [] }: CreateChannelTaskDialogProps) {
  const [taskName, setTaskName] = useState("");
  const [prompt, setPrompt] = useState("");
  const [freq, setFreq] = useState<ScheduleType>("daily");
  const [hour, setHour] = useState(() => new Date().getHours());
  const [minute, setMinute] = useState(() => new Date().getMinutes());
  const [dayOfWeek, setDayOfWeek] = useState(1);
  const [dayOfMonth, setDayOfMonth] = useState(1);
  const [deliveryTarget, setDeliveryTarget] = useState<DeliveryTarget>("telegram");
  const [selectedChannelId, setSelectedChannelId] = useState<string>("");

  // Auto-select default or first channel
  const autoChannel = useMemo(() => {
    if (channels.length === 0) return null;
    return channels.find(c => c.is_default) || channels[0];
  }, [channels]);

  // Sync auto-select
  useMemo(() => {
    if (autoChannel && !selectedChannelId) {
      setSelectedChannelId(autoChannel.channel_id);
    }
  }, [autoChannel]);

  const selectedChannel = useMemo(() =>
    channels.find(c => c.channel_id === selectedChannelId) || autoChannel,
    [channels, selectedChannelId, autoChannel]
  );

  // ═══ Single source-of-truth device-time snapshot (DST + half-hour safe). ═══
  const tzInfo = useMemo(() => {
    const snap = getDeviceTimeSnapshot();
    return {
      timezone: snap.timezone,
      offsetLabel: snap.offsetLabel,
      offsetMinutes: snap.offsetMinutes,
      nowIso: snap.nowIso,
      nowLocal: snap.nowLocal,
      corrected: snap.corrected,
    };
  }, []);

  const resetForm = () => {
    setTaskName(""); setPrompt(""); setFreq("daily"); setHour(new Date().getHours()); setMinute(new Date().getMinutes()); setDayOfWeek(1); setDayOfMonth(1); setDeliveryTarget("telegram"); setSelectedChannelId(autoChannel?.channel_id || "");
  };

  const handleSubmit = () => {
    if (!taskName.trim() || !prompt.trim()) return;
    // Re-snapshot at submit time in case the user crossed midnight while the
    // dialog was open — keeps `device_now_iso` honest.
    const tz = getDeviceTimeSnapshot();
    const slug = taskName.trim().toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "");
    const prefix = deliveryTarget === "telegram" ? "tg" : "chat";
    const cron = generateCron(freq, hour, minute, dayOfWeek, dayOfMonth, tz.timezone);

    const params: Parameters<typeof onSubmit>[0] = {
      name: `${prefix}_${slug}_${Date.now()}`,
      display_name: taskName.trim(),
      cron_expression: cron,
      task_type: "scheduled_task",
      task_config: {
        prompt: prompt.trim(),
        schedule_type: freq,
        local_hour: hour,
        local_minute: minute,
        delivery_target: deliveryTarget,
        // Device-time provenance (backend self-heal needs `original_timezone`).
        user_timezone: tz.timezone,
        original_timezone: tz.timezone,
        original_local_time: `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`,
        original_recurrence: freq,
        tz_offset_at_create: tz.offsetMinutes,
        tz_offset_label: tz.offsetLabel,
        device_now_iso: tz.nowIso,
        device_now_local: tz.nowLocal,
        tz_corrected: tz.corrected,
        ...(freq === "weekly" && { day_of_week: dayOfWeek, original_weekdays: [dayOfWeek] }),
        ...(freq === "monthly" && { day_of_month: dayOfMonth, original_day_of_month: dayOfMonth }),
        ...(deliveryTarget === "telegram" && selectedChannel && {
          delivery_channel_name: selectedChannel.channel_name,
          delivery_channel_id: selectedChannel.channel_id,
        }),
      },
      is_active: true,
    };
    if (freq === "one_off") params.next_run_at = computeNextRunAt(hour, minute, tz.timezone);
    onSubmit(params);
    resetForm();
  };

  const isValid = taskName.trim().length > 0 && prompt.trim().length > 0;

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) resetForm(); onOpenChange(v); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <div className={cn(
              "h-7 w-7 rounded-lg flex items-center justify-center border",
              deliveryTarget === "telegram"
                ? "bg-[#229ED9]/15 border-[#229ED9]/20"
                : "bg-primary/15 border-primary/20"
            )}>
              {deliveryTarget === "telegram" 
                ? <Send className="h-3.5 w-3.5 text-[#229ED9]" />
                : <Cpu className="h-3.5 w-3.5 text-primary" />
              }
            </div>
            Create Heartbeat Task
          </DialogTitle>
          <DialogDescription className="text-xs">
            Schedule an automated task with custom delivery target.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          {/* Task Name */}
          <div className="space-y-1.5">
            <Label className="text-[11px] text-muted-foreground">Task Name</Label>
            <Input
              placeholder="e.g. Daily Crypto Digest"
              value={taskName}
              onChange={(e) => setTaskName(e.target.value)}
              className="h-9 text-sm bg-background/50 border-border/30"
            />
          </div>

          {/* Delivery Target */}
          <div className="space-y-1.5">
            <Label className="text-[11px] text-muted-foreground">Delivery Target</Label>
            <div className="flex gap-1.5">
              {DELIVERY_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setDeliveryTarget(opt.value)}
                  className={cn(
                    "flex-1 px-2.5 py-2 rounded-lg text-[11px] font-medium transition-all flex flex-col items-center gap-1 border",
                    deliveryTarget === opt.value
                      ? opt.value === "telegram"
                        ? "bg-[#229ED9]/15 text-[#229ED9] border-[#229ED9]/30 shadow-sm shadow-[#229ED9]/10"
                        : "bg-primary/15 text-primary border-primary/30 shadow-sm shadow-primary/10"
                      : "bg-muted/20 text-muted-foreground hover:bg-muted/40 border-transparent"
                  )}
                >
                  <opt.icon className="h-3.5 w-3.5" />
                  <span>{opt.label}</span>
                  <span className="text-[9px] opacity-60">{opt.description}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Channel Selector (Telegram only) */}
          {deliveryTarget === "telegram" && (
            <div className="space-y-1.5">
              <Label className="text-[11px] text-muted-foreground">Channel</Label>
              {channels.length === 0 ? (
                <div className="flex items-center gap-1.5 px-2.5 py-2 rounded-lg bg-amber-500/10 border border-amber-500/20">
                  <span className="text-[11px] text-amber-400">⚠️ No verified channels. Add one in Broadcast Channels first.</span>
                </div>
              ) : channels.length === 1 ? (
                <div className="flex items-center gap-1.5 px-2.5 py-2 rounded-lg bg-[#229ED9]/8 border border-[#229ED9]/15">
                  <Send className="h-3 w-3 text-[#229ED9]" />
                  <span className="text-[11px] text-[#229ED9] font-medium">📢 {channels[0].channel_name}</span>
                  {channels[0].is_default && <span className="text-[9px] text-amber-400 ml-auto">⭐ default</span>}
                </div>
              ) : (
                <Select value={selectedChannelId} onValueChange={setSelectedChannelId}>
                  <SelectTrigger className="h-9 text-xs bg-background/50 border-[#229ED9]/20">
                    <SelectValue placeholder="Select channel" />
                  </SelectTrigger>
                  <SelectContent>
                    {channels.map((ch) => (
                      <SelectItem key={ch.channel_id} value={ch.channel_id}>
                        <span className="flex items-center gap-1.5">
                          📢 {ch.channel_name}
                          {ch.is_default && <span className="text-[9px] text-amber-400 ml-1">⭐</span>}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          )}

          {/* Frequency Pills */}
          <div className="space-y-1.5">
            <Label className="text-[11px] text-muted-foreground">Frequency</Label>
            <div className="flex gap-1.5">
              {FREQ_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setFreq(opt.value)}
                  className={cn(
                    "flex-1 px-2 py-1.5 rounded-lg text-[11px] font-medium transition-all flex items-center justify-center gap-1 border",
                    freq === opt.value
                      ? "bg-primary/15 text-primary border-primary/30 shadow-sm shadow-primary/10"
                      : "bg-muted/20 text-muted-foreground hover:bg-muted/40 border-transparent"
                  )}
                >
                  <opt.icon className="h-3 w-3" />
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Time Picker */}
          <div className="flex gap-2">
            <div className="flex-1 space-y-1.5">
              <Label className="text-[11px] text-muted-foreground">Time</Label>
              <ClockTimePicker
                hour={hour}
                minute={minute}
                onTimeChange={(h, m) => { setHour(h); setMinute(m); }}
              />
            </div>

            {freq === "weekly" && (
              <div className="flex-1 space-y-1.5">
                <Label className="text-[11px] text-muted-foreground">Day</Label>
                <div className="flex gap-0.5">
                  {DAYS_OF_WEEK.map((d) => (
                    <button
                      key={d.value}
                      type="button"
                      onClick={() => setDayOfWeek(Number(d.value))}
                      className={cn(
                        "flex-1 h-9 rounded-md text-[10px] font-medium transition-all border",
                        dayOfWeek === Number(d.value)
                          ? "bg-primary/15 text-primary border-primary/30"
                          : "bg-muted/15 text-muted-foreground border-transparent hover:bg-muted/30"
                      )}
                    >
                      {d.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {freq === "monthly" && (
              <div className="w-24 space-y-1.5">
                <Label className="text-[11px] text-muted-foreground">Day</Label>
                <Select value={String(dayOfMonth)} onValueChange={(v) => setDayOfMonth(Number(v))}>
                  <SelectTrigger className="h-9 text-xs bg-background/50 border-border/30"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Array.from({ length: 28 }, (_, i) => (
                      <SelectItem key={i + 1} value={String(i + 1)}>{i + 1}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          {/* Prompt */}
          <div className="space-y-1.5">
            <Label className="text-[11px] text-muted-foreground">Instructions</Label>
            <Textarea
              placeholder="Enter prompt here. e.g. Research today's top crypto news and create a professional summary post."
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              rows={4}
              className="text-sm bg-background/50 border-border/30 resize-none"
            />
          </div>

          {/* Timezone + Delivery badge */}
          <div className="space-y-1.5">
            <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-card/40 border border-border/20">
              <Globe className="h-3 w-3 text-muted-foreground/50" />
              <span className="text-[11px] text-muted-foreground font-medium">Device time: {tzInfo.timezone}</span>
              <span className="text-[10px] text-primary/60 font-medium ml-auto">{tzInfo.offsetLabel}</span>
            </div>
            {deliveryTarget === "telegram" ? (
              <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-[#229ED9]/8 border border-[#229ED9]/15">
                <span className="text-[11px]">✈️</span>
                <span className="text-[11px] text-[#229ED9] font-medium">
                  Results will be posted to {selectedChannel ? <strong>{selectedChannel.channel_name}</strong> : "your Telegram channel"}
                </span>
              </div>
            ) : (
              <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-primary/8 border border-primary/15">
                <Cpu className="h-3 w-3 text-primary/70" />
                <span className="text-[11px] text-primary font-medium">Results will be saved to BeeBot session only</span>
              </div>
            )}
          </div>

          {/* Submit */}
          <Button
            onClick={handleSubmit}
            disabled={!isValid || isPending}
            className={cn(
              "w-full h-10 text-sm font-semibold gap-2 text-white border-0",
              deliveryTarget === "telegram"
                ? "bg-gradient-to-r from-[#229ED9] to-[#1a8bc7] hover:from-[#1a8bc7] hover:to-[#1580b8]"
                : "bg-gradient-to-r from-primary to-primary/80 hover:from-primary/90 hover:to-primary/70"
            )}
          >
            {isPending ? (
              <div className="h-4 w-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
            ) : deliveryTarget === "telegram" ? (
              <Send className="h-4 w-4" />
            ) : (
              <Cpu className="h-4 w-4" />
            )}
            {isPending ? "Creating..." : "Create Task"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
