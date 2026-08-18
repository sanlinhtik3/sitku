import { AddSquare, ChatRoundLine } from "@solar-icons/react";
import { Button } from "@/components/ui/button";
import type { ConsultantRangePreset } from "@/hooks/useConsultantData";

interface Props {
  rangePreset: ConsultantRangePreset;
  rangeLabel: string;
  onRangePresetChange: (preset: ConsultantRangePreset) => void;
  onAddRecord: () => void;
  onRefresh: () => void;
  onClose: () => void;
  chatOpen: boolean;
  onToggleChat: () => void;
}

const RANGES: { value: ConsultantRangePreset; label: string }[] = [
  { value: "today", label: "Today" },
  { value: "this_week", label: "Week" },
  { value: "this_month", label: "Month" },
  { value: "last_28_days", label: "28D" },
];

export function WelcomeHeader({
  rangePreset, rangeLabel, onRangePresetChange, onAddRecord, onRefresh, onClose, chatOpen, onToggleChat,
}: Props) {
  const baselineLabel = rangePreset === "today"
    ? "vs yesterday baseline"
    : rangePreset === "this_week"
      ? "vs previous week baseline"
      : rangePreset === "this_month"
        ? "vs previous month baseline"
        : "vs previous 28 days baseline";
  return (
    <header className="consultant-fade native-titlebar-safe native-titlebar-drag shrink-0 flex items-center gap-3 min-h-10">
      <div className="flex flex-wrap sm:flex-nowrap items-center justify-between gap-3 w-full min-w-0">
        <div className="flex min-w-0 items-center gap-3 sm:ml-1.5">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[13px] border border-[color-mix(in_oklab,var(--consultant-ac)_30%,transparent)] bg-[linear-gradient(160deg,color-mix(in_oklab,var(--consultant-ac)_18%,transparent),color-mix(in_oklab,var(--consultant-ac)_6%,transparent))] shadow-[inset_0_1px_0_rgba(255,255,255,.12)]">
            <span className="relative flex h-[9px] w-[9px]">
              <span className="absolute inset-0 animate-ping rounded-full bg-[var(--consultant-ac)] opacity-55" />
              <span className="relative h-[9px] w-[9px] rounded-full bg-[var(--consultant-ac)] shadow-[0_0_10px_color-mix(in_oklab,var(--consultant-ac)_70%,transparent)]" />
            </span>
          </div>
          <div className="min-w-0">
            <h2 className="consultant-title text-[clamp(16px,1.6vw,19px)] truncate">Agent Consultant</h2>
            <div className="mt-px truncate text-xs leading-tight text-[#8a8a8e]">
              {rangeLabel} · {baselineLabel} · USDT
            </div>
          </div>
        </div>

        <div className="native-titlebar-interactive flex max-w-full shrink-0 items-center gap-2 sm:mr-1.5">
          <div className="flex w-[200px] items-center gap-0.5 rounded-xl border border-white/[.06] bg-white/[.045] p-[3px] sm:w-[252px]">
            {RANGES.map((range) => (
              <button key={range.value} onClick={() => onRangePresetChange(range.value)}
                className={`consultant-press h-[30px] flex-1 rounded-[9px] border-0 px-0 text-xs font-medium ${rangePreset === range.value ? "bg-white/[.11] text-[#f4f4f6] shadow-[inset_0_0_0_.5px_rgba(255,255,255,.12)]" : "bg-transparent text-[#8a8a8e] hover:text-[#c4c4c8]"}`}>
                {range.label}
              </button>
            ))}
          </div>

          <Button
            size="icon" variant="ghost"
            className={`consultant-press !h-9 !w-9 rounded-xl ${
              chatOpen ? "text-[var(--consultant-ac)] bg-[color-mix(in_oklab,var(--consultant-ac)_12%,transparent)] border border-[color-mix(in_oklab,var(--consultant-ac)_25%,transparent)]" : "text-[#8a8a8e] hover:text-[#f4f4f6]"
            }`}
            onClick={onToggleChat}
            aria-label={chatOpen ? "Close consultant chat" : "Open consultant chat"}
            title={chatOpen ? "Close consultant chat" : "Open consultant chat"}
          >
            <ChatRoundLine size={17} />
          </Button>

          <Button
            size="sm" onClick={onAddRecord}
            className="consultant-press h-9 w-9 gap-1.5 rounded-xl border border-[color-mix(in_oklab,var(--consultant-ac)_30%,transparent)] bg-[var(--consultant-ac)] px-0 text-[12.5px] font-semibold text-[#1a1205] shadow-[0_6px_20px_-6px_color-mix(in_oklab,var(--consultant-ac)_55%,transparent)] hover:bg-[var(--consultant-ac)] sm:w-[61px]"
          >
            <AddSquare size={16} weight="Bold" /> <span className="hidden sm:inline">Log</span>
          </Button>

          <button type="button" className="sr-only" tabIndex={-1} onClick={onRefresh}>Refresh</button>
          <button type="button" className="sr-only" tabIndex={-1} onClick={onClose}>Close</button>
        </div>
      </div>
    </header>
  );
}
