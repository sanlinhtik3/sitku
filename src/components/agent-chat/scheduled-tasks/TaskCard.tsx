import { useState } from "react";
import { Megaphone, Search, Bell, Play, Trash2, Pencil, Check, X, Loader2, CheckCircle2, AlertTriangle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Heartbeat } from "@/hooks/useHeartbeats";
import { safeFormat, safeDistanceToNow, safeLocaleString } from "./dateSafe";

// ─── Intent Detection ───
function detectIntent(prompt: string) {
  const lower = prompt.toLowerCase();
  if (/post|send|broadcast|share|publish/.test(lower))
    return { type: "broadcast", icon: Megaphone, label: "Broadcast", color: "text-cyan-400" };
  if (/search|check|look\s?up|price|find|monitor/.test(lower))
    return { type: "search", icon: Search, label: "Search", color: "text-emerald-400" };
  return { type: "reminder", icon: Bell, label: "Reminder", color: "text-amber-400" };
}

// ─── Cron-to-Human (UTC → local) ───
export function cronToHuman(cron: string | null): string {
  if (!cron) return "One-time task";
  const parts = cron.split(" ");
  if (parts.length !== 5) return cron;
  const [minute, hour, dayOfMonth, , dayOfWeek] = parts;

  if (minute.startsWith("*/")) return `Every ${minute.slice(2)} minutes`;
  if (minute !== "*" && hour === "*") return `Every hour at :${minute.padStart(2, "0")}`;
  if (minute === "*" && hour === "*") return "Every minute";
  if (hour.startsWith("*/")) return `Every ${hour.slice(2)} hours`;

  const minNum = parseInt(minute, 10);
  const hourNum = parseInt(hour, 10);

  // Bail out for any expression we can't safely render as a wall-clock time
  if (!Number.isFinite(minNum) || !Number.isFinite(hourNum) || minNum < 0 || minNum > 59 || hourNum < 0 || hourNum > 23) {
    return cron;
  }

  const utcDate = new Date();
  utcDate.setUTCHours(hourNum, minNum, 0, 0);
  if (!Number.isFinite(utcDate.getTime())) return cron;

  let timeStr = "";
  let tzAbbr = "";
  try {
    timeStr = utcDate.toLocaleTimeString([], { hour: "numeric", minute: "2-digit", hour12: true });
    tzAbbr = Intl.DateTimeFormat("en-US", { timeZoneName: "short" })
      .formatToParts(utcDate).find(p => p.type === "timeZoneName")?.value || "";
  } catch {
    return cron;
  }

  const dayNames = ["Sundays","Mondays","Tuesdays","Wednesdays","Thursdays","Fridays","Saturdays"];
  if (dayOfWeek !== "*") {
    const dowNum = parseInt(dayOfWeek, 10);
    const dayLabel = Number.isFinite(dowNum) && dowNum >= 0 && dowNum <= 6 ? dayNames[dowNum] : `Day ${dayOfWeek}`;
    return `${dayLabel} at ${timeStr} ${tzAbbr}`.trim();
  }
  if (dayOfMonth !== "*") return `Day ${dayOfMonth} of month at ${timeStr} ${tzAbbr}`.trim();
  return `Daily at ${timeStr} ${tzAbbr}`.trim();
}

// ─── Helpers ───
function isCompletedOneOff(task: Heartbeat): boolean {
  const cfg = task.task_config as Record<string, any> | null;
  const isOneOff = cfg?.schedule_type === "one_off" || !task.cron_expression;
  return isOneOff && !task.is_active && task.last_status === "success" && !!task.last_run_at;
}

const priorityColors: Record<string, string> = {
  critical: "border-l-red-500",
  high: "border-l-orange-400",
  normal: "border-l-primary",
  low: "border-l-muted-foreground/30",
};

interface TaskCardProps {
  task: Heartbeat;
  onToggle: (active: boolean) => void;
  onTrigger: () => void;
  onDelete: () => void;
  onUpdate: (params: { id: string; display_name?: string; cron_expression?: string | null; priority?: string; task_config?: Record<string, any> }) => void;
  isTriggerPending?: boolean;
  triggeringId?: string | null;
}

export function TaskCard({ task, onToggle, onTrigger, onDelete, onUpdate, isTriggerPending, triggeringId }: TaskCardProps) {
  const [editing, setEditing] = useState(false);
  const [editPrompt, setEditPrompt] = useState("");
  const completed = isCompletedOneOff(task);

  const intent = detectIntent(task.display_name);
  const IntentIcon = intent.icon;
  const taskConfig = task.task_config as Record<string, any> | null;
  const prompt = taskConfig?.prompt || task.display_name;
  const isOneOff = taskConfig?.schedule_type === "one_off" || !task.cron_expression;
  const schedule = isOneOff && task.next_run_at
    ? `One-time: ${safeLocaleString(task.next_run_at)}`
    : cronToHuman(task.cron_expression);

  // Status
  const statusColor = completed
    ? "text-emerald-400"
    : task.is_active
      ? task.last_status === "error" ? "text-red-400" : "text-emerald-400"
      : "text-muted-foreground";
  const statusLabel = completed
    ? "Completed"
    : task.is_active
      ? task.last_status === "error" ? "Failed" : "Active"
      : "Paused";

  // Next run — relative + absolute
  // Prefer server-stamped local mirror from task_config (timezone-accurate),
  // fall back to client-recomputed format if not present.
  const serverLocalStamp = (taskConfig?.next_run_at_local as string | undefined) || null;
  const nextRunText = task.is_active && task.next_run_at
    ? safeDistanceToNow(task.next_run_at) || null
    : null;
  const nextRunAbsolute = task.is_active && task.next_run_at
    ? (serverLocalStamp || safeFormat(task.next_run_at, "MMM d, h:mm a", ""))
    : null;

  // Last result — rich display
  const lastResult = task.last_result as Record<string, any> | null;
  const deliveryChannels: string[] = [];
  if (lastResult?.telegram_sent || lastResult?.channel === "telegram") deliveryChannels.push("Telegram");
  if (lastResult?.push_sent || lastResult?.channel === "push") deliveryChannels.push("Push");
  if (lastResult?.notification_sent) deliveryChannels.push("In-App");

  const resultPreview = lastResult?.notification_title
    || lastResult?.summary
    || lastResult?.message
    || (task.last_status === "success" ? "Completed successfully" : null);

  const wasLate = lastResult?.late_delivery || lastResult?.was_late;

  // ─── Automation Quality Telemetry ───
  const qualityScore: number | null = typeof lastResult?.quality_score === "number" ? lastResult.quality_score : null;
  const qualityHoldback: boolean = lastResult?.quality_holdback === true;
  const retryCount: number = typeof lastResult?.retry_count === "number" ? lastResult.retry_count : 0;
  const agenticProfile = (lastResult?.agentic_profile || taskConfig?.agentic_profile) as string | undefined;
  const autonomyLevel = (lastResult?.autonomy_level || taskConfig?.autonomy_level) as string | undefined;
  const contextMemory = (lastResult?.context_memory || taskConfig?.context_memory) as string | undefined;
  const selfHealEnabled = (lastResult?.self_heal_enabled ?? taskConfig?.self_heal) !== false;
  const qualityFloor = typeof lastResult?.quality_floor === "number"
    ? lastResult.quality_floor
    : typeof taskConfig?.quality_floor === "number"
      ? taskConfig.quality_floor
      : null;
  const qualityColor =
    qualityScore === null ? "border-muted-foreground/20 text-muted-foreground"
    : qualityScore >= 80 ? "border-emerald-500/30 text-emerald-400"
    : qualityScore >= 50 ? "border-amber-500/30 text-amber-400"
    : "border-red-500/30 text-red-400";

  const handleStartEdit = () => {
    setEditPrompt(prompt);
    setEditing(true);
  };

  const handleSaveEdit = () => {
    if (editPrompt.trim() && editPrompt !== prompt) {
      const newConfig = { ...taskConfig, prompt: editPrompt.trim() };
      onUpdate({ id: task.id, display_name: editPrompt.trim(), task_config: newConfig });
    }
    setEditing(false);
  };

  const borderColor = priorityColors[task.priority] || priorityColors.normal;
  const isTriggering = isTriggerPending && triggeringId === task.id;

  return (
    <div className={`group rounded-xl bg-card/20 backdrop-blur-sm border border-white/[0.06] border-l-2 ${borderColor} p-3 hover:border-white/[0.12] transition-all ${completed ? "opacity-70" : ""}`}>
      {/* Top row */}
      <div className="flex items-start gap-2.5">
        <div className={`shrink-0 h-7 w-7 rounded-lg bg-card/40 flex items-center justify-center ${completed ? "text-emerald-400" : intent.color}`}>
          {completed ? <CheckCircle2 className="h-3.5 w-3.5" /> : <IntentIcon className="h-3.5 w-3.5" />}
        </div>
        <div className="flex-1 min-w-0">
          {editing ? (
            <div className="flex items-center gap-1.5">
              <Input
                value={editPrompt}
                onChange={e => setEditPrompt(e.target.value)}
                className="h-7 text-xs bg-background/50 border-primary/30"
                autoFocus
                onKeyDown={e => e.key === "Enter" && handleSaveEdit()}
              />
              <button onClick={handleSaveEdit} className="h-6 w-6 rounded-md flex items-center justify-center text-emerald-400 hover:bg-emerald-500/10">
                <Check className="h-3 w-3" />
              </button>
              <button onClick={() => setEditing(false)} className="h-6 w-6 rounded-md flex items-center justify-center text-muted-foreground hover:bg-muted/20">
                <X className="h-3 w-3" />
              </button>
            </div>
          ) : (
            <p className="text-[13px] font-medium text-foreground leading-snug line-clamp-2">{prompt}</p>
          )}
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            <span className="text-[11px] text-muted-foreground">{schedule}</span>
            <span className={`text-[11px] font-medium ${statusColor}`}>• {statusLabel}</span>
            {wasLate && (
              <span className="text-[10px] text-amber-400/80 font-medium flex items-center gap-0.5">
                <AlertTriangle className="h-2.5 w-2.5" />
                Late
              </span>
            )}
            {qualityScore !== null && (
              <Badge variant="outline" className={`text-[9px] px-1 py-0 h-4 ${qualityColor}`} title="Automation quality score">
                Q {qualityScore}
              </Badge>
            )}
            {qualityHoldback && (
              <Badge variant="outline" className="text-[9px] px-1 py-0 h-4 border-red-500/30 text-red-400" title="Held back from delivery (quality < 50)">
                Held back
              </Badge>
            )}
            {retryCount > 0 && (
              <Badge variant="outline" className="text-[9px] px-1 py-0 h-4 border-amber-500/30 text-amber-400/80" title="Auto-retried for quality">
                ↻ Retried
              </Badge>
            )}
            {agenticProfile && (
              <Badge variant="outline" className="text-[9px] px-1 py-0 h-4 border-cyan-400/25 text-cyan-300/80" title="Agentic control profile">
                Agentic
              </Badge>
            )}
            {autonomyLevel && (
              <Badge variant="outline" className="text-[9px] px-1 py-0 h-4 border-emerald-400/25 text-emerald-300/80" title={`Autonomy: ${autonomyLevel}`}>
                {autonomyLevel}
              </Badge>
            )}
            {contextMemory && (
              <Badge variant="outline" className="text-[9px] px-1 py-0 h-4 border-violet-400/25 text-violet-300/80" title={`Context memory: ${contextMemory}`}>
                {contextMemory} memory
              </Badge>
            )}
            {selfHealEnabled && (
              <Badge variant="outline" className="text-[9px] px-1 py-0 h-4 border-primary/25 text-primary/80" title="Self-heal retry/refire enabled">
                self-heal
              </Badge>
            )}
            {qualityFloor !== null && (
              <Badge variant="outline" className="text-[9px] px-1 py-0 h-4 border-white/[0.10] text-muted-foreground" title="Delivery quality floor">
                floor {qualityFloor}
              </Badge>
            )}
          </div>
          {nextRunText && (
            <p className="text-[10px] text-muted-foreground/60 mt-0.5">
              Next: {nextRunText} ({nextRunAbsolute})
            </p>
          )}
          {completed && task.last_run_at && (
            <p className="text-[10px] text-emerald-400/60 mt-0.5">
              Ran at {safeFormat(task.last_run_at, "MMM d, h:mm a")}
            </p>
          )}
          {resultPreview && (
            <p className="text-[10px] text-muted-foreground/50 mt-1 line-clamp-1 italic">{resultPreview}</p>
          )}
          {deliveryChannels.length > 0 && (
            <div className="flex gap-1 mt-1">
              {deliveryChannels.map(ch => (
                <Badge key={ch} variant="outline" className="text-[9px] px-1 py-0 h-4 border-emerald-500/20 text-emerald-400/70">
                  {ch} ✓
                </Badge>
              ))}
            </div>
          )}
        </div>
        {!completed && (
          <Switch
            checked={task.is_active}
            onCheckedChange={onToggle}
            className="shrink-0 scale-[0.8] origin-right"
          />
        )}
      </div>

      {/* Action buttons — always visible on mobile */}
      <div className="flex items-center gap-1 mt-2 pt-2 border-t border-white/[0.04] sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
        <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-5 border-white/[0.08]">
          {intent.label}
        </Badge>
        {task.priority !== "normal" && (
          <Badge variant="outline" className={`text-[10px] px-1.5 py-0 h-5 ${
            task.priority === "critical" ? "border-red-500/30 text-red-400" :
            task.priority === "high" ? "border-orange-400/30 text-orange-400" :
            "border-muted-foreground/20 text-muted-foreground"
          }`}>
            {task.priority}
          </Badge>
        )}
        <div className="flex-1" />
        {!completed && (
          <button
            onClick={handleStartEdit}
            className="h-6 w-6 rounded-md flex items-center justify-center hover:bg-primary/10 text-primary/60 hover:text-primary transition-colors"
            title="Edit"
          >
            <Pencil className="h-3 w-3" />
          </button>
        )}
        <button
          onClick={onTrigger}
          disabled={isTriggering}
          className="h-6 w-6 rounded-md flex items-center justify-center hover:bg-emerald-500/10 text-emerald-400/60 hover:text-emerald-400 transition-colors disabled:opacity-40"
          title="Run Now"
        >
          {isTriggering ? <Loader2 className="h-3 w-3 animate-spin" /> : <Play className="h-3 w-3" />}
        </button>
        <button
          onClick={onDelete}
          className="h-6 w-6 rounded-md flex items-center justify-center hover:bg-red-500/10 text-red-400/60 hover:text-red-400 transition-colors"
          title="Delete"
        >
          <Trash2 className="h-3 w-3" />
        </button>
      </div>
    </div>
  );
}
