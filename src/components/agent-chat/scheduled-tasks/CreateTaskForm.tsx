import { useState, useEffect } from "react";
import {
  Plus, X, Clock, Calendar, Repeat, Send, Wand2, Languages, Search, Bell,
  CheckCircle2, AlertCircle, MessageSquareText, SlidersHorizontal,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { TaskTemplate } from "./taskTemplates";
import type { BroadcastChannel } from "../neural-link/CreateChannelTaskDialog";
import {
  getDeviceTimeSnapshot,
  buildCronInTimezone,
  nextOneOffUtc,
} from "@/lib/deviceTime";
import { ClockTimePicker } from "@/components/ui/clock-time-picker";

type ScheduleType = "one_off" | "hourly" | "daily" | "weekly" | "monthly";
type DeliveryTarget = "in_app" | "telegram";
type AutonomyLevel = "assisted" | "autonomous" | "guardian";
type ContextMemory = "light" | "deep";

interface CreateTaskFormProps {
  onSubmit: (params: {
    name: string;
    display_name: string;
    cron_expression: string | null;
    task_type: string;
    task_config: Record<string, any>;
    next_run_at?: string;
    is_active?: boolean;
  }) => void;
  onCancel: () => void;
  isPending: boolean;
  prefill?: TaskTemplate | null;
  channels?: BroadcastChannel[];
}

const DAYS_OF_WEEK = [
  { value: "0", label: "Sunday" },
  { value: "1", label: "Monday" },
  { value: "2", label: "Tuesday" },
  { value: "3", label: "Wednesday" },
  { value: "4", label: "Thursday" },
  { value: "5", label: "Friday" },
  { value: "6", label: "Saturday" },
];

const SCHEDULE_OPTIONS: { value: ScheduleType; label: string; icon: typeof Clock }[] = [
  { value: "one_off", label: "One-time", icon: Calendar },
  { value: "hourly", label: "Hourly", icon: Repeat },
  { value: "daily", label: "Daily", icon: Clock },
  { value: "weekly", label: "Weekly", icon: Calendar },
  { value: "monthly", label: "Monthly", icon: Calendar },
];

const DELIVERY_OPTIONS: { value: DeliveryTarget; label: string; icon: typeof Send; desc: string }[] = [
  { value: "in_app", label: "In-App", icon: Clock, desc: "Results saved in task history" },
  { value: "telegram", label: "Telegram", icon: Send, desc: "Auto-post to your channel" },
];

const PRIORITY_OPTIONS = [
  { value: "low", label: "Low" },
  { value: "normal", label: "Normal" },
  { value: "high", label: "High" },
  { value: "critical", label: "Critical" },
];

type ModeValue = "auto" | "verbatim" | "research" | "reminder";
const MODE_OPTIONS: { value: ModeValue; label: string; icon: typeof Wand2; desc: string }[] = [
  { value: "auto", label: "Auto", icon: Wand2, desc: "BeeBot decides" },
  { value: "verbatim", label: "Translate / Forward", icon: Languages, desc: "Use my text only" },
  { value: "research", label: "Find & Report", icon: Search, desc: "Search the web" },
  { value: "reminder", label: "Reminder", icon: Bell, desc: "Just notify me" },
];

const AUTONOMY_OPTIONS: { value: AutonomyLevel; label: string; desc: string }[] = [
  { value: "assisted", label: "Assisted", desc: "Careful, low-risk runs" },
  { value: "autonomous", label: "Autonomous", desc: "Plan, act, verify" },
  { value: "guardian", label: "Guardian", desc: "Strict channel quality" },
];

// Map UI mode → backend intent_override token (matches automation-prompt-builder.ts)
function modeToIntent(mode: ModeValue): string | null {
  if (mode === "auto") return null;
  if (mode === "verbatim") return "translate"; // builder treats translate/forward/summarize_given identically
  if (mode === "research") return "find_and_report";
  if (mode === "reminder") return "reminder";
  return null;
}

function generateCron(
  type: ScheduleType,
  hour: number,
  minute: number,
  dayOfWeek: number,
  dayOfMonth: number,
  tz: string,
): string | null {
  if (type === "one_off") return null;
  return buildCronInTimezone(type, hour, minute, dayOfWeek, dayOfMonth, tz);
}

function computeNextRunAt(hour: number, minute: number, tz: string): string {
  return nextOneOffUtc(hour, minute, tz);
}

function defaultSuccessCriteriaFor(mode: ModeValue, deliveryTarget: DeliveryTarget): string {
  if (mode === "research") {
    return "Use fresh sources, include concrete numbers or dates, and deliver a concise actionable summary.";
  }
  if (mode === "reminder") {
    return "State exactly what should happen next, why it matters, and whether anything is still pending.";
  }
  if (mode === "verbatim") {
    return "Preserve the user's supplied content faithfully; do not add facts or extra commentary.";
  }
  return deliveryTarget === "telegram"
    ? "Ready-to-post Telegram output with clear hook, concrete value, no placeholders, and no generic filler."
    : "Complete the task with a concrete answer, grounded context, and clear next action.";
}

export function CreateTaskForm({ onSubmit, onCancel, isPending, prefill, channels = [] }: CreateTaskFormProps) {
  const [taskName, setTaskName] = useState(prefill?.name || "");
  const [prompt, setPrompt] = useState(prefill?.prompt || "");
  const [scheduleType, setScheduleType] = useState<ScheduleType>(prefill?.schedule_type || "daily");
  const [hour, setHour] = useState(prefill?.hour ?? 9);
  const [minute, setMinute] = useState(prefill?.minute ?? 0);
  const [dayOfWeek, setDayOfWeek] = useState(prefill?.day_of_week ?? 1);
  const [dayOfMonth, setDayOfMonth] = useState(prefill?.day_of_month ?? 1);
  const [priority, setPriority] = useState(prefill?.priority || "normal");
  const [deliveryTarget, setDeliveryTarget] = useState<DeliveryTarget>(prefill?.delivery_target || "in_app");
  const [selectedChannelId, setSelectedChannelId] = useState<string>("");
  const [mode, setMode] = useState<ModeValue>("auto");
  const [successCriteria, setSuccessCriteria] = useState("");
  const [autonomyLevel, setAutonomyLevel] = useState<AutonomyLevel>("autonomous");
  const [contextMemory, setContextMemory] = useState<ContextMemory>("deep");
  const [selfHeal, setSelfHeal] = useState(true);
  const [qualityFloor, setQualityFloor] = useState(72);

  // Auto-select default or first channel
  useEffect(() => {
    if (channels.length > 0 && !selectedChannelId) {
      const def = channels.find(c => c.is_default) || channels[0];
      setSelectedChannelId(def.channel_id);
    }
  }, [channels]);

  const selectedChannel = channels.find(c => c.channel_id === selectedChannelId) || channels[0] || null;

  useEffect(() => {
    if (prefill) {
      setTaskName(prefill.name);
      setPrompt(prefill.prompt);
      setScheduleType(prefill.schedule_type);
      setHour(prefill.hour);
      setMinute(prefill.minute);
      if (prefill.day_of_week !== undefined) setDayOfWeek(prefill.day_of_week);
      if (prefill.day_of_month !== undefined) setDayOfMonth(prefill.day_of_month);
      setPriority(prefill.priority);
      setDeliveryTarget(prefill.delivery_target || "in_app");
      setSuccessCriteria("");
      setAutonomyLevel("autonomous");
      setContextMemory("deep");
      setSelfHeal(true);
      setQualityFloor(72);
    }
  }, [prefill]);

  const handleSubmit = () => {
    if (!taskName.trim() || !prompt.trim()) return;

    // ═══ DEVICE-TIME SOVEREIGNTY ═══
    // Capture user's true local time/zone at the moment of creation. The
    // server's heartbeat runner uses `original_timezone` for DST self-heal,
    // and `user_timezone` for prompt context — both must be set, or
    // schedules silently drift on DST transitions / Yangon-style offsets.
    const tz = getDeviceTimeSnapshot();

    const slug = taskName.trim().toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "");
    const cron = generateCron(scheduleType, hour, minute, dayOfWeek, dayOfMonth, tz.timezone);
    const finalSuccessCriteria = successCriteria.trim() || defaultSuccessCriteriaFor(mode, deliveryTarget);
    const boundedQualityFloor = Math.max(40, Math.min(95, Number(qualityFloor) || 72));

    const params: Parameters<typeof onSubmit>[0] = {
      name: `manual_${slug}_${Date.now()}`,
      display_name: taskName.trim(),
      cron_expression: cron,
      task_type: "scheduled_task",
      task_config: {
        prompt: prompt.trim(),
        schedule_type: scheduleType,
        local_hour: hour,
        local_minute: minute,
        // Device-time provenance — required by backend self-heal.
        user_timezone: tz.timezone,
        original_timezone: tz.timezone,
        original_local_time: `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`,
        original_recurrence: scheduleType,
        tz_offset_at_create: tz.offsetMinutes,
        tz_offset_label: tz.offsetLabel,
        device_now_iso: tz.nowIso,
        device_now_local: tz.nowLocal,
        tz_corrected: tz.corrected,
        ...(scheduleType === "weekly" && { day_of_week: dayOfWeek, original_weekdays: [dayOfWeek] }),
        ...(scheduleType === "monthly" && { day_of_month: dayOfMonth, original_day_of_month: dayOfMonth }),
        ...(deliveryTarget === "telegram" && { delivery_target: "telegram" }),
        ...(deliveryTarget === "telegram" && selectedChannel && {
          delivery_channel_name: selectedChannel.channel_name,
          delivery_channel_id: selectedChannel.channel_id,
        }),
        ...(modeToIntent(mode) ? { intent_override: modeToIntent(mode), mode } : { mode: "auto" }),
        // Agentic control plane — consumed by the heartbeat runner, quality
        // gate and task cards so Automate behaves like a managed channel agent.
        agentic_profile: "beebot_agentic_era",
        agentic_contract_version: 1,
        autonomy_level: autonomyLevel,
        context_memory: contextMemory,
        self_heal: selfHeal,
        success_criteria: finalSuccessCriteria,
        quality_floor: boundedQualityFloor,
        max_refire_attempts: selfHeal
          ? autonomyLevel === "guardian" ? 3 : autonomyLevel === "autonomous" ? 2 : 1
          : 0,
      },
      is_active: true,
    };

    if (scheduleType === "one_off") {
      params.next_run_at = computeNextRunAt(hour, minute, tz.timezone);
    }

    onSubmit(params);
  };

  const isValid = taskName.trim().length > 0 && prompt.trim().length > 0;
  const sectionClass = "space-y-2 rounded-[22px] border border-white/[0.06] bg-white/[0.035] p-3";
  const inputClass = "h-9 text-xs bg-black/30 border-white/[0.08] rounded-[16px] placeholder:text-muted-foreground/45 focus-visible:ring-1 focus-visible:ring-primary/35";
  const fieldLabelClass = "text-[11px] text-muted-foreground/85 font-semibold flex items-center gap-1.5";

  return (
    <div className="mx-3 mb-2 rounded-[26px] border border-primary/20 bg-[#090b0c]/95 backdrop-blur-2xl overflow-hidden shadow-[0_18px_50px_rgba(0,0,0,0.35)]">
      {/* Form Header */}
      <div className="flex items-center justify-between px-3.5 py-3 border-b border-white/[0.06] bg-gradient-to-r from-primary/10 via-cyan-400/5 to-transparent">
        <div className="flex items-center gap-1.5">
          <div className="h-7 w-7 rounded-[14px] bg-primary/15 border border-primary/20 flex items-center justify-center">
            <Plus className="h-3.5 w-3.5 text-primary" />
          </div>
          <span className="text-xs font-semibold text-foreground">New Automation</span>
          {/* Live device-time chip — proves to the user the agent sees their actual zone. */}
          <span className="ml-1.5 text-[9.5px] text-primary/80 font-medium px-2 py-0.5 rounded-full bg-primary/10 border border-primary/15">
            {(() => { const t = getDeviceTimeSnapshot(); return `${t.timezone} · ${t.offsetLabel}`; })()}
          </span>
        </div>
        <button onClick={onCancel} className="h-7 w-7 rounded-full hover:bg-white/[0.08] border border-white/[0.06] flex items-center justify-center transition-colors">
          <X className="h-3.5 w-3.5 text-muted-foreground" />
        </button>
      </div>

      <div className="p-3 space-y-3">
        {/* Task Name */}
        <div className={sectionClass}>
          <Label className={fieldLabelClass}>
            <MessageSquareText className="h-3.5 w-3.5 text-primary/80" />
            Name
          </Label>
          <Input
            placeholder="Daily Finance Report"
            value={taskName}
            onChange={(e) => setTaskName(e.target.value)}
            className={inputClass}
          />

          {/* Prompt */}
          <Label className={fieldLabelClass}>
            <Wand2 className="h-3.5 w-3.5 text-primary/80" />
            BeeBot should
          </Label>
          <textarea
            placeholder="Summarize my daily expenses and send a notification."
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            rows={5}
            className="flex w-full min-h-[118px] rounded-[18px] border border-white/[0.08] bg-black/30 px-3 py-2.5 text-xs ring-offset-background placeholder:text-muted-foreground/45 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary/35 resize-none leading-relaxed"
          />
        </div>

        {/* Mode (intent override) */}
        <div className={sectionClass}>
          <Label className={fieldLabelClass}>
            <SlidersHorizontal className="h-3.5 w-3.5 text-primary/80" />
            Mode
          </Label>
          <div className="grid grid-cols-2 gap-1.5">
            {MODE_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setMode(opt.value)}
                title={opt.desc}
                className={`px-2.5 py-2 rounded-[17px] text-[11px] font-medium transition-all flex items-center gap-1.5 border text-left ${
                  mode === opt.value
                    ? "bg-primary text-primary-foreground border-primary shadow-[0_0_18px_hsl(var(--primary)/0.20)]"
                    : "bg-white/[0.035] text-muted-foreground hover:bg-white/[0.065] hover:text-foreground border-white/[0.06]"
                }`}
              >
                <opt.icon className="h-3 w-3" />
                {opt.label}
              </button>
            ))}
          </div>
          <p className="text-[9.5px] text-muted-foreground/70 pl-0.5">
            {MODE_OPTIONS.find((o) => o.value === mode)?.desc}
          </p>
        </div>

        {/* Agentic Controls */}
        <div className={sectionClass}>
          <Label className={fieldLabelClass}>
            <CheckCircle2 className="h-3.5 w-3.5 text-primary/80" />
            Agentic Controls
          </Label>
          <div className="grid grid-cols-3 gap-1.5">
            {AUTONOMY_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setAutonomyLevel(opt.value)}
                title={opt.desc}
                className={`px-2 py-2 rounded-[16px] border text-left transition-all ${
                  autonomyLevel === opt.value
                    ? "bg-emerald-400/14 text-emerald-200 border-emerald-400/30 shadow-[0_0_16px_rgba(52,211,153,0.12)]"
                    : "bg-white/[0.035] text-muted-foreground hover:bg-white/[0.065] hover:text-foreground border-white/[0.06]"
                }`}
              >
                <span className="block text-[10.5px] font-semibold leading-none">{opt.label}</span>
                <span className="block text-[8.5px] opacity-60 mt-1 leading-tight">{opt.desc}</span>
              </button>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-1.5">
            <button
              type="button"
              onClick={() => setContextMemory(contextMemory === "deep" ? "light" : "deep")}
              className="px-2.5 py-2 rounded-[16px] bg-white/[0.035] hover:bg-white/[0.065] border border-white/[0.06] text-left transition-colors"
              title="Controls how strongly prior runs and user memory guide this task"
            >
              <span className="block text-[10.5px] font-semibold text-foreground">Memory: {contextMemory === "deep" ? "Deep" : "Light"}</span>
              <span className="block text-[8.5px] text-muted-foreground/65 mt-0.5">Context continuity</span>
            </button>
            <button
              type="button"
              onClick={() => setSelfHeal(!selfHeal)}
              className={`px-2.5 py-2 rounded-[16px] border text-left transition-colors ${
                selfHeal
                  ? "bg-primary/12 border-primary/25 text-primary"
                  : "bg-white/[0.035] border-white/[0.06] text-muted-foreground"
              }`}
              title="Allows the runner to retry and refire when quality is weak"
            >
              <span className="block text-[10.5px] font-semibold">Self-heal: {selfHeal ? "On" : "Off"}</span>
              <span className="block text-[8.5px] opacity-65 mt-0.5">Retry weak runs</span>
            </button>
          </div>

          <div className="grid grid-cols-[82px_1fr] gap-1.5 items-end">
            <div className="space-y-1">
              <Label className="text-[10px] text-muted-foreground/80 font-semibold">Quality</Label>
              <Input
                type="number"
                min={40}
                max={95}
                value={qualityFloor}
                onChange={(e) => setQualityFloor(Number(e.target.value))}
                className={inputClass}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-[10px] text-muted-foreground/80 font-semibold">Success criteria</Label>
              <Input
                placeholder={defaultSuccessCriteriaFor(mode, deliveryTarget)}
                value={successCriteria}
                onChange={(e) => setSuccessCriteria(e.target.value)}
                className={inputClass}
              />
            </div>
          </div>
        </div>

        {/* Schedule Type */}
        <div className={sectionClass}>
          <Label className={fieldLabelClass}>
            <Calendar className="h-3.5 w-3.5 text-primary/80" />
            Schedule
          </Label>
          <div className="grid grid-cols-2 gap-1.5">
            {SCHEDULE_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setScheduleType(opt.value)}
                className={`px-2.5 py-2 rounded-[17px] text-[11px] font-medium transition-all flex items-center gap-1.5 border ${
                  scheduleType === opt.value
                    ? "bg-primary text-primary-foreground border-primary shadow-[0_0_18px_hsl(var(--primary)/0.18)]"
                    : "bg-white/[0.035] text-muted-foreground hover:bg-white/[0.065] hover:text-foreground border-white/[0.06]"
                }`}
              >
                <opt.icon className="h-3 w-3" />
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* Time Picker */}
        <div className="flex gap-2">
          <div className="flex-1 space-y-1">
            <Label className="text-[11px] text-muted-foreground/85 font-semibold">
              {scheduleType === "hourly" ? "At Minute" : "Time"}
            </Label>
            {scheduleType === "hourly" ? (
              <Select value={String(minute)} onValueChange={(v) => setMinute(Number(v))}>
                <SelectTrigger className={inputClass}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Array.from({ length: 60 }, (_, i) => (
                    <SelectItem key={i} value={String(i)}>:{String(i).padStart(2, "0")}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <ClockTimePicker
                hour={hour}
                minute={minute}
                onTimeChange={(h, m) => { setHour(h); setMinute(m); }}
                className="w-full h-9"
              />
            )}
          </div>

          {/* Day Selector (Weekly) */}
          {scheduleType === "weekly" && (
            <div className="flex-1 space-y-1">
              <Label className="text-[11px] text-muted-foreground/85 font-semibold">Day</Label>
              <Select value={String(dayOfWeek)} onValueChange={(v) => setDayOfWeek(Number(v))}>
                <SelectTrigger className={inputClass}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DAYS_OF_WEEK.map((d) => (
                    <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Day Selector (Monthly) */}
          {scheduleType === "monthly" && (
            <div className="flex-1 space-y-1">
              <Label className="text-[11px] text-muted-foreground/85 font-semibold">Day of Month</Label>
              <Select value={String(dayOfMonth)} onValueChange={(v) => setDayOfMonth(Number(v))}>
                <SelectTrigger className={inputClass}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Array.from({ length: 28 }, (_, i) => (
                    <SelectItem key={i + 1} value={String(i + 1)}>{i + 1}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>

        {/* Delivery Target */}
        <div className={sectionClass}>
          <Label className={fieldLabelClass}>
            <Send className="h-3.5 w-3.5 text-primary/80" />
            Delivery
          </Label>
          <div className="flex gap-1.5">
            {DELIVERY_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setDeliveryTarget(opt.value)}
                className={`flex-1 px-2.5 py-2 rounded-[18px] text-[11px] font-medium transition-all flex flex-col items-center gap-0.5 border ${
                  deliveryTarget === opt.value
                    ? opt.value === "telegram"
                      ? "bg-[#229ED9]/15 text-[#55C7FF] border-[#229ED9]/30 shadow-[0_0_18px_rgba(34,158,217,0.14)]"
                      : "bg-primary text-primary-foreground border-primary shadow-[0_0_18px_hsl(var(--primary)/0.18)]"
                    : "bg-white/[0.035] text-muted-foreground hover:bg-white/[0.065] hover:text-foreground border-white/[0.06]"
                }`}
              >
                <div className="flex items-center gap-1">
                  <opt.icon className="h-3 w-3" />
                  {opt.label}
                </div>
                <span className="text-[9px] opacity-60 font-normal">{opt.desc}</span>
              </button>
            ))}
          </div>

          {/* Channel Selector (shown when Telegram is selected) */}
          {deliveryTarget === "telegram" && (
            <div className="mt-1.5">
              {channels.length === 0 ? (
                <div className="flex items-center gap-1.5 px-2.5 py-2 rounded-[16px] bg-amber-500/10 border border-amber-500/20">
                  <AlertCircle className="h-3.5 w-3.5 text-amber-400" />
                  <span className="text-[10px] text-amber-400">No verified channels. Add one in Broadcast Channels.</span>
                </div>
              ) : channels.length === 1 ? (
                <div className="flex items-center gap-1.5 px-2.5 py-2 rounded-[16px] bg-[#229ED9]/8 border border-[#229ED9]/15">
                  <Send className="h-3 w-3 text-[#229ED9]" />
                  <span className="text-[10px] text-[#55C7FF] font-medium">{channels[0].channel_name}</span>
                  {channels[0].is_default && <span className="text-[9px] text-amber-300 ml-auto">Default</span>}
                </div>
              ) : (
                <Select value={selectedChannelId} onValueChange={setSelectedChannelId}>
                  <SelectTrigger className="h-8 text-[11px] bg-black/30 border-[#229ED9]/20 rounded-[16px]">
                    <SelectValue placeholder="Select channel" />
                  </SelectTrigger>
                  <SelectContent>
                    {channels.map((ch) => (
                      <SelectItem key={ch.channel_id} value={ch.channel_id}>
                        <span className="flex items-center gap-1">
                          {ch.channel_name}
                          {ch.is_default && <span className="text-[9px] text-amber-400">Default</span>}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          )}
        </div>

        {/* Priority */}
        <div className={sectionClass}>
          <Label className={fieldLabelClass}>
            <CheckCircle2 className="h-3.5 w-3.5 text-primary/80" />
            Priority
          </Label>
          <Select value={priority} onValueChange={setPriority}>
            <SelectTrigger className={inputClass}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PRIORITY_OPTIONS.map((p) => (
                <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Submit */}
        <Button
          onClick={handleSubmit}
          disabled={!isValid || isPending}
          size="sm"
          className="w-full h-10 rounded-full text-xs font-semibold shadow-[0_0_22px_hsl(var(--primary)/0.20)]"
        >
          {isPending ? "Creating..." : deliveryTarget === "telegram" ? "Create Telegram Task" : "Create Task"}
        </Button>
      </div>
    </div>
  );
}
