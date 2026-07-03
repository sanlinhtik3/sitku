// Range pills for the CFO Income Intelligence section — Today / Week / Month /
// 28D / 90D. Reuses `ConsultantRangePreset` + `consultantRangeForPreset` so
// finance & consultant agree on what each label means (no drift).

import { cn } from "@/lib/utils";
import type { ConsultantRangePreset } from "@/hooks/useConsultantData";

const PRESETS: { id: ConsultantRangePreset; label: string }[] = [
  { id: "today",        label: "Today" },
  { id: "this_week",    label: "Week" },
  { id: "this_month",   label: "Month" },
  { id: "last_28_days", label: "28D" },
  { id: "last_90_days", label: "90D" },
];

export function FinanceRangeSelector({
  value,
  onChange,
  className,
}: {
  value: ConsultantRangePreset;
  onChange: (preset: ConsultantRangePreset) => void;
  className?: string;
}) {
  return (
    <div role="radiogroup" aria-label="Income range" className={cn("inline-flex items-center gap-1 rounded-xl p-1 bg-muted/30 border border-border/40", className)}>
      {PRESETS.map((p) => {
        const active = p.id === value;
        return (
          <button
            key={p.id}
            role="radio"
            aria-checked={active}
            onClick={() => onChange(p.id)}
            className={cn(
              "h-7 px-3 text-[11px] font-medium rounded-lg transition-all tabular-nums",
              active
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground hover:bg-muted/50",
            )}
          >
            {p.label}
          </button>
        );
      })}
    </div>
  );
}
