import { MessageSquare, Plus, RefreshCw, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { ConsultantRangePreset } from "@/hooks/useConsultantData";

interface Props {
  userName: string;
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
  { value: "yesterday", label: "Yesterday" },
  { value: "this_week", label: "This Week" },
  { value: "this_month", label: "This Month" },
  { value: "last_7_days", label: "7D" },
  { value: "last_28_days", label: "28D" },
  { value: "last_90_days", label: "90D" },
];

export function WelcomeHeader({
  userName, rangePreset, rangeLabel, onRangePresetChange, onAddRecord, onRefresh, onClose, chatOpen, onToggleChat,
}: Props) {
  return (
    <div className="shrink-0 flex items-center gap-2.5 px-4 py-3 border-b border-border/20">
      <div className="flex items-center justify-between gap-3 w-full min-w-0">
        <div className="flex items-center gap-3 min-w-0">
          <div className="h-8 w-8 rounded-xl bg-primary/10 flex items-center justify-center shrink-0 text-primary border border-primary/20">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full rounded-full bg-primary opacity-60 animate-ping" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
            </span>
          </div>
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-foreground truncate">AgentConsultant</h2>
            <div className="text-[11px] text-muted-foreground truncate leading-tight">
              {userName}'s {rangeLabel.toLowerCase()} operating view
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <Select value={rangePreset} onValueChange={(v) => onRangePresetChange(v as ConsultantRangePreset)}>
            <SelectTrigger className="consultant-control h-8 px-3 text-[11px] rounded-full w-[116px] gap-1.5">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {RANGES.map((r) => (
                <SelectItem key={r.value} value={r.value} className="text-xs">{r.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Button
            size="icon" variant="ghost"
            className={`h-8 w-8 rounded-full hover:bg-background/45 ${
              chatOpen ? "text-primary bg-primary/10 border border-primary/20" : "text-muted-foreground hover:text-foreground"
            }`}
            onClick={onToggleChat}
            aria-label={chatOpen ? "Close consultant chat" : "Open consultant chat"}
            title={chatOpen ? "Close consultant chat" : "Open consultant chat"}
          >
            <MessageSquare className="h-3.5 w-3.5" />
          </Button>

          <Button
            size="icon" variant="ghost"
            className="h-8 w-8 rounded-full text-muted-foreground hover:text-foreground hover:bg-background/45"
            onClick={onRefresh}
            aria-label="Refresh"
          >
            <RefreshCw className="h-3.5 w-3.5" />
          </Button>

          <Button
            size="sm" onClick={onAddRecord}
            className="h-8 px-3 rounded-full bg-primary/15 text-primary hover:bg-primary/25 border border-primary/20 text-[11px] font-semibold gap-1.5"
          >
            <Plus className="h-3.5 w-3.5" /> Add
          </Button>

          <Button
            size="icon" variant="ghost"
            className="h-8 w-8 rounded-full text-muted-foreground hover:text-foreground hover:bg-background/45"
            onClick={onClose} aria-label="Close"
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
    </div>
  );
}
