import { useMemo } from "react";
import { TASK_TEMPLATES, TaskTemplate } from "./taskTemplates";
import {
  Repeat, Zap, Send, Wallet, Sun, BarChart3, Microscope, Newspaper,
  Bot, TrendingUp, Radio, type LucideIcon,
} from "lucide-react";

interface TaskTemplateCardsProps {
  onSelect: (template: TaskTemplate) => void;
}

function scheduleLabel(t: TaskTemplate): string {
  const h = t.hour > 12 ? t.hour - 12 : t.hour || 12;
  const ampm = t.hour >= 12 ? "pm" : "am";
  const m = String(t.minute).padStart(2, "0");
  const time = `${h}:${m}${ampm}`;

  switch (t.schedule_type) {
    case "hourly": return "Every hour";
    case "daily": return `Daily at ${time}`;
    case "weekly": {
      const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
      return `${days[t.day_of_week || 0]}s at ${time}`;
    }
    case "monthly": return `Day ${t.day_of_month || 1} at ${time}`;
    default: return time;
  }
}

export function TaskTemplateCards({ onSelect }: TaskTemplateCardsProps) {
  const grouped = useMemo(() => {
    const personal = TASK_TEMPLATES.filter(t => t.category !== "Telegram");
    const telegram = TASK_TEMPLATES.filter(t => t.category === "Telegram");
    return { personal, telegram };
  }, []);

  return (
    <div className="space-y-5">
      {/* Personal Templates */}
      <div>
        <div className="flex items-center gap-1.5 mb-2.5">
          <Zap className="h-3.5 w-3.5 text-amber-400" />
          <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Personal</span>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
          {grouped.personal.map((t) => (
            <TemplateCard key={t.id} template={t} onSelect={onSelect} />
          ))}
        </div>
      </div>

      {/* Telegram Templates */}
      {grouped.telegram.length > 0 && (
        <div>
          <div className="flex items-center gap-1.5 mb-2.5">
            <Send className="h-3.5 w-3.5 text-[#229ED9]" />
            <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Telegram</span>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
            {grouped.telegram.map((t) => (
              <TemplateCard key={t.id} template={t} onSelect={onSelect} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function TemplateCard({ template: t, onSelect }: { template: TaskTemplate; onSelect: (t: TaskTemplate) => void }) {
  const Icon = getTemplateIcon(t);
  const isTelegram = t.delivery_target === "telegram" || t.category === "Telegram";
  return (
    <button
      onClick={() => onSelect(t)}
      className="group text-left rounded-[22px] border border-white/[0.06] bg-white/[0.025] hover:bg-white/[0.055] hover:border-primary/25 p-3 transition-all shadow-[0_10px_30px_rgba(0,0,0,0.16)]"
    >
      <div className="flex items-center gap-2 mb-2">
        <div className={`h-8 w-8 rounded-[16px] border flex items-center justify-center ${
          isTelegram ? "bg-[#229ED9]/10 border-[#229ED9]/20" : "bg-primary/10 border-primary/20"
        }`}>
          <Icon className={`h-3.5 w-3.5 ${isTelegram ? "text-[#55C7FF]" : "text-primary"}`} />
        </div>
        <span className="text-[11px] font-semibold text-foreground line-clamp-1 group-hover:text-primary transition-colors">
          {t.name}
        </span>
      </div>
      <div className="flex items-center gap-1 mb-2">
        <Repeat className="h-2.5 w-2.5 text-muted-foreground/55" />
        <span className="text-[10px] text-muted-foreground/75">{scheduleLabel(t)}</span>
      </div>
      <p className="text-[10px] text-muted-foreground/50 line-clamp-2 leading-relaxed">
        {t.description}
      </p>
    </button>
  );
}

function getTemplateIcon(template: TaskTemplate): LucideIcon {
  if (template.id.includes("finance")) return Wallet;
  if (template.id.includes("briefing")) return Sun;
  if (template.id.includes("task_report")) return BarChart3;
  if (template.id.includes("research")) return Microscope;
  if (template.id.includes("expense")) return TrendingUp;
  if (template.id.includes("newsletter")) return Newspaper;
  if (template.id.includes("ai_news")) return Bot;
  if (template.id.includes("crypto")) return TrendingUp;
  if (template.id.includes("digest")) return Radio;
  return Zap;
}
