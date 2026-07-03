// Financial Goal — ONE simple progress bar a 10-year-old can read.
// • Fill = net savings (income − expense) since the goal started.
// • The fill is split into colored chunks by income SOURCE; hover a chunk → amount.
// • Below: days left + an elapsed-time bar + a plain "on track / save ฿X a day" hint.
// Data comes only from the daily Add Transaction entries.

import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Target, Pencil, Trash2, CalendarClock, Check, PartyPopper } from "lucide-react";
import { cn } from "@/lib/utils";
import { useFlowStateGoal, type GoalProgress } from "@/hooks/useFlowStateGoal";

function money(n: number, cur: string) {
  const v = new Intl.NumberFormat("en-US", { maximumFractionDigits: Math.abs(n) >= 1000 ? 0 : 2 }).format(Math.abs(n) || 0);
  const sym = cur === "USD" ? "$" : cur === "THB" ? "฿" : "";
  const suf = cur === "MMK" ? " Ks" : "";
  return `${n < 0 ? "−" : ""}${sym}${v}${suf}`;
}
function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

interface Props {
  userId: string;
  currency: string;
}

export function FinancialGoalCard({ userId, currency }: Props) {
  const { data, isLoading, setGoal, clearGoal } = useFlowStateGoal(userId, currency);
  const [editing, setEditing] = useState(false);

  if (isLoading) {
    return <Card className="consultant-card p-4 h-[150px] animate-pulse" />;
  }

  // No goal yet, or actively editing → show the simple form.
  if (!data || editing) {
    return (
      <GoalForm
        currency={currency}
        initial={data?.goal}
        onCancel={data ? () => setEditing(false) : undefined}
        onSave={(input) => setGoal.mutate(input, { onSuccess: () => setEditing(false) })}
        saving={setGoal.isPending}
      />
    );
  }

  return (
    <GoalView
      data={data}
      currency={currency}
      onEdit={() => setEditing(true)}
      onDelete={() => clearGoal.mutate()}
    />
  );
}

// ── Active goal view ────────────────────────────────────────────────────────
function GoalView({ data, currency, onEdit, onDelete }: { data: GoalProgress; currency: string; onEdit: () => void; onDelete: () => void; }) {
  const [hover, setHover] = useState<number | null>(null);
  const g = data.goal;

  return (
    <Card className="consultant-card p-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="h-9 w-9 rounded-xl bg-[var(--bb-accent-soft)] ring-1 ring-[var(--bb-accent)]/40 flex items-center justify-center shrink-0">
            <Target className="h-4 w-4 text-[var(--beebot-accent)]" />
          </div>
          <div className="min-w-0">
            <div className="text-sm font-semibold truncate">{g.title}</div>
            <div className="text-[11px] text-muted-foreground">
              <span className="text-emerald-300 font-medium tabular-nums">{money(data.savedClamped, currency)}</span>
              {" "}of {money(data.target, currency)} saved
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <span className="text-base font-bold tabular-nums text-emerald-300 mr-1">{Math.round(data.amountPct)}%</span>
          <Button variant="ghost" size="icon" className="h-7 w-7 rounded-lg text-muted-foreground" onClick={onEdit} title="Edit goal"><Pencil className="h-3.5 w-3.5" /></Button>
          <Button variant="ghost" size="icon" className="h-7 w-7 rounded-lg text-muted-foreground hover:text-destructive" onClick={onDelete} title="Delete goal"><Trash2 className="h-3.5 w-3.5" /></Button>
        </div>
      </div>

      {/* Reached banner */}
      {data.reached && (
        <div className="mb-2 flex items-center gap-1.5 text-xs font-medium text-emerald-300">
          <PartyPopper className="h-3.5 w-3.5" /> Goal reached — well done!
        </div>
      )}

      {/* ── Money progress bar (segmented by source) ── */}
      <div className="relative">
        {/* tooltip */}
        {hover != null && data.segments[hover] && (
          <div className="absolute -top-9 z-10 px-2.5 py-1 rounded-lg bg-card/95 border border-border/60 shadow-xl text-[11px] whitespace-nowrap pointer-events-none"
            style={{ left: `clamp(0px, ${segMidLeft(data.segments, hover)}%, calc(100% - 120px))` }}>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full" style={{ background: data.segments[hover].color }} />
              <span className="font-medium">{data.segments[hover].source}</span>
              <span className="text-emerald-300 tabular-nums">{money(data.segments[hover].netShare, currency)}</span>
            </span>
          </div>
        )}
        <div className="h-7 w-full rounded-xl bg-muted/30 overflow-hidden flex ring-1 ring-border/30">
          {data.segments.map((s, i) => (
            s.pctOfBar > 0 && (
              <div
                key={s.source}
                onMouseEnter={() => setHover(i)}
                onMouseLeave={() => setHover((h) => (h === i ? null : h))}
                className={cn("h-full flex items-center justify-center overflow-hidden transition-[filter] cursor-default", hover === i && "brightness-110")}
                style={{ width: `${s.pctOfBar}%`, background: s.color }}
                title={`${s.source}: ${money(s.netShare, currency)}`}
              >
                {s.pctOfBar > 12 && <span className="text-[10px] font-medium text-black/70 truncate px-1">{s.source}</span>}
              </div>
            )
          ))}
        </div>
      </div>

      {/* Source legend + earned/spent caption */}
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
        {data.segments.map((s) => (
          <span key={s.source} className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
            <span className="h-2 w-2 rounded-full" style={{ background: s.color }} />
            {s.source} <span className="tabular-nums text-foreground/70">{money(s.netShare, currency)}</span>
          </span>
        ))}
        {data.segments.length === 0 && <span className="text-[10px] text-muted-foreground">No income yet — add one to fill the bar.</span>}
      </div>
      <div className="mt-1 text-[11px] text-muted-foreground">
        Earned <span className="text-emerald-300 tabular-nums">{money(data.earned, currency)}</span>
        {" · "}Spent <span className="text-rose-300 tabular-nums">{money(data.spent, currency)}</span>
        {data.remaining > 0 && <> {" · "}{money(data.remaining, currency)} to go</>}
      </div>

      {/* ── Time row ── */}
      <div className="mt-3 pt-3 border-t border-border/30">
        <div className="flex items-center justify-between gap-3 mb-1.5">
          <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <CalendarClock className="h-3.5 w-3.5" />
            {data.remainingDays > 0
              ? <><b className="text-foreground tabular-nums">{data.remainingDays}</b> day{data.remainingDays === 1 ? "" : "s"} left</>
              : <span className="text-rose-300">Deadline passed</span>}
            <span className="text-muted-foreground/60">· {data.elapsedDays}/{data.totalDays} days used</span>
          </span>
          {/* on-track pill */}
          {data.reached ? (
            <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-emerald-400/15 text-emerald-300 border border-emerald-400/30 flex items-center gap-1"><Check className="h-3 w-3" /> Done</span>
          ) : data.onTrack ? (
            <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-emerald-400/15 text-emerald-300 border border-emerald-400/30 flex items-center gap-1"><Check className="h-3 w-3" /> On track</span>
          ) : (
            <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-amber-400/15 text-amber-300 border border-amber-400/30">
              Save {money(data.perDayNeeded, currency)}/day
            </span>
          )}
        </div>
        {/* elapsed-time mini bar */}
        <div className="h-1.5 w-full rounded-full bg-muted/30 overflow-hidden">
          <div className="h-full rounded-full bg-sky-400/60" style={{ width: `${data.timePct}%` }} />
        </div>
      </div>
    </Card>
  );
}

// Mid-point (in %) of a segment, for tooltip positioning.
function segMidLeft(segments: GoalProgress["segments"], idx: number): number {
  let acc = 0;
  for (let i = 0; i < idx; i++) acc += segments[i].pctOfBar;
  return acc + segments[idx].pctOfBar / 2;
}

// ── Create / edit form ──────────────────────────────────────────────────────
function GoalForm({ currency, initial, onSave, onCancel, saving }: {
  currency: string;
  initial?: { title: string; target_amount: number; end_date: string } | null;
  onSave: (input: { title: string; target_amount: number; end_date: string; currency: string }) => void;
  onCancel?: () => void;
  saving: boolean;
}) {
  const [title, setTitle] = useState(initial?.title ?? "");
  const [amount, setAmount] = useState(initial ? String(initial.target_amount) : "");
  const [endDate, setEndDate] = useState(initial?.end_date ?? "");
  const valid = title.trim() && Number(amount) > 0 && endDate && endDate >= todayStr();

  return (
    <Card className="consultant-card p-4">
      <div className="flex items-center gap-2.5 mb-3">
        <div className="h-9 w-9 rounded-xl bg-[var(--bb-accent-soft)] ring-1 ring-[var(--bb-accent)]/40 flex items-center justify-center">
          <Target className="h-4 w-4 text-[var(--beebot-accent)]" />
        </div>
        <div>
          <div className="text-sm font-semibold">{initial ? "Edit your goal" : "Set a savings goal"}</div>
          <div className="text-[11px] text-muted-foreground">Pick an amount and a date — the bar fills as you save.</div>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-[1fr_120px_150px] gap-2">
        <Input placeholder="What for? e.g. New bike" value={title} onChange={(e) => setTitle(e.target.value)} className="h-10" />
        <Input type="number" inputMode="decimal" placeholder={`Amount (${currency})`} value={amount} onChange={(e) => setAmount(e.target.value)} className="h-10" />
        <Input type="date" min={todayStr()} value={endDate} onChange={(e) => setEndDate(e.target.value)} className="h-10" />
      </div>

      <div className="mt-3 flex items-center justify-end gap-2">
        {onCancel && <Button variant="ghost" size="sm" onClick={onCancel}>Cancel</Button>}
        <Button
          size="sm"
          className="gap-1.5 bg-primary text-primary-foreground hover:bg-primary/90"
          disabled={!valid || saving}
          onClick={() => onSave({ title, target_amount: Number(amount), end_date: endDate, currency })}
        >
          <Target className="h-3.5 w-3.5" /> {initial ? "Save changes" : "Start goal"}
        </Button>
      </div>
    </Card>
  );
}
