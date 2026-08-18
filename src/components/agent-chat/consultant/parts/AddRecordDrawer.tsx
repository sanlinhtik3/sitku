import { useMemo, useState } from "react";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { toast } from "sonner";
import {
  useConsultantPosts, useConsultantMetrics, useConsultantFinance, useConsultantDailySnapshots,
  localDateString,
  CONSULTANT_FINANCE_CURRENCY,
  type Platform,
} from "@/hooks/useConsultantData";
import {
  Facebook, Instagram, Youtube, Twitter, Linkedin, Send, Mic, Mail, Globe,
  Music2, AtSign, BarChart3, CalendarDays, CheckCircle2, ChevronDown, Clock3,
  CircleDollarSign, Layers3, Link2, Loader2, PlusCircle,
  Sparkles, Users,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface Props { open: boolean; onOpenChange: (o: boolean) => void; }

const today = () => localDateString();
const currentTime = () => new Date().toTimeString().slice(0, 5);
const RECORD_TIME_LABEL = "Record time";

function noteWithRecordTime(note: string, time: string): string | null {
  const body = note.trim();
  const timeLine = `${RECORD_TIME_LABEL}: ${time}`;
  return body ? `${body}\n${timeLine}` : timeLine;
}

const PLATFORM_META: { id: Platform; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: "facebook",   label: "Facebook",  icon: Facebook },
  { id: "instagram",  label: "Instagram", icon: Instagram },
  { id: "tiktok",     label: "TikTok",    icon: Music2 },
  { id: "youtube",    label: "YouTube",   icon: Youtube },
  { id: "telegram",   label: "Telegram",  icon: Send },
  { id: "x",          label: "X",         icon: Twitter },
  { id: "linkedin",   label: "LinkedIn",  icon: Linkedin },
  { id: "threads",    label: "Threads",   icon: AtSign },
  { id: "podcast",    label: "Podcast",   icon: Mic },
  { id: "newsletter", label: "Newsletter",icon: Mail },
  { id: "other",      label: "Other",     icon: Globe },
];

export function AddRecordDrawer({ open, onOpenChange }: Props) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="consultant-shell w-full p-0 rounded-t-[var(--bb-radius-panel)] border-t border-border/30 max-h-[94dvh] flex flex-col overflow-hidden sm:left-1/2 sm:right-auto sm:bottom-5 sm:w-[min(760px,calc(100vw-32px))] sm:-translate-x-1/2 sm:rounded-[var(--bb-radius-panel)] sm:border"
      >
        <div className="shrink-0 flex justify-center pt-2.5">
          <div className="h-1 w-11 rounded-full bg-white/20" />
        </div>
        {open && <UnifiedRecordForm onDone={() => onOpenChange(false)} />}
      </SheetContent>
    </Sheet>
  );
}

/* ─────────── Unified record: content + performance + channel + monetization ─────────── */

function UnifiedRecordForm({ onDone }: { onDone: () => void }) {
  const posts = useConsultantPosts();
  const metrics = useConsultantMetrics();
  const daily = useConsultantDailySnapshots();
  const finance = useConsultantFinance();

  // ── Shared spine: one platform + one date drives the whole record ──
  const [platform, setPlatform] = useState<Platform>("facebook");
  const [date, setDate] = useState(today());
  const [time, setTime] = useState(currentTime());

  // ── Content (post) ──
  const [pName, setPName] = useState("");
  const [pUrl, setPUrl] = useState("");

  // ── Performance (metrics on the post) ──
  const [perfOpen, setPerfOpen] = useState(false);
  const [views, setViews] = useState("");
  const [reach, setReach] = useState("");
  const [likes, setLikes] = useState("");
  const [comments, setComments] = useState("");
  const [shares, setShares] = useState("");
  const [saves, setSaves] = useState("");
  const [pNotes, setPNotes] = useState("");

  // ── Channel KPIs (daily snapshot for the platform) ──
  const [chOpen, setChOpen] = useState(false);
  const [followers, setFollowers] = useState("");
  const [tviews, setTviews] = useState("");
  const [pcount, setPcount] = useState("");
  const [erate, setErate] = useState("");
  const [imps, setImps] = useState("");
  const [chReach, setChReach] = useState("");
  const [chNote, setChNote] = useState("");

  // ── Monetization (CFO ledger entry) ──
  const [finOpen, setFinOpen] = useState(false);
  const [fType, setFType] = useState<"expense" | "income">("expense");
  const [cat, setCat] = useState("Ads");
  const [amt, setAmt] = useState("");
  const [fNote, setFNote] = useState("");

  const metricsTouched = useMemo(
    () => [views, reach, likes, comments, shares, saves].some((v) => Number(v) > 0) || pNotes.trim().length > 0,
    [views, reach, likes, comments, shares, saves, pNotes],
  );
  const channelTouched = useMemo(
    () => [followers, tviews, pcount, erate, imps, chReach].some((v) => v.trim() !== "") || chNote.trim().length > 0,
    [followers, tviews, pcount, erate, imps, chReach, chNote],
  );
  const financeTouched = amt.trim() !== "" && Number(amt) > 0;
  const contentTouched = pName.trim().length > 0;
  const platformMeta = PLATFORM_META.find((p) => p.id === platform) ?? PLATFORM_META[0];
  const readyCount = [contentTouched, metricsTouched, channelTouched, financeTouched].filter(Boolean).length;

  const saving =
    posts.upsert.isPending || metrics.addOrUpdate.isPending ||
    daily.upsert.isPending || finance.add.isPending;

  const submit = async () => {
    // Performance metrics belong to a post — a post name is required to persist them.
    if (metricsTouched && !contentTouched) {
      toast.error("Add a post name to save performance metrics");
      return;
    }
    if (!contentTouched && !channelTouched && !financeTouched) {
      toast.error("Fill in at least one section to save");
      return;
    }

    const saved: string[] = [];
    try {
      // Each section writes through its OWN existing mutation + shape — stored data is untouched.
      if (contentTouched) {
        const { id } = await posts.upsert.mutateAsync({
          post_name: pName.trim(),
          platform,
          post_url: pUrl.trim() || null,
          posted_at: date,
          notes: noteWithRecordTime("", time),
        });
        saved.push("content");
        if (metricsTouched) {
          await metrics.addOrUpdate.mutateAsync({
            post_id: id,
            metric_date: date,
            views: Number(views) || 0,
            likes: Number(likes) || 0,
            comments: Number(comments) || 0,
            shares: Number(shares) || 0,
            saves: Number(saves) || 0,
            reach: Number(reach) || 0,
            notes: noteWithRecordTime(pNotes, time),
          });
          saved.push("metrics");
        }
      }
      if (channelTouched) {
        await daily.upsert.mutateAsync({
          platform,
          captured_at: date,
          followers: followers.trim() ? Number(followers) : undefined,
          total_views: tviews.trim() ? Number(tviews) : undefined,
          posts_count: pcount.trim() ? Number(pcount) : undefined,
          engagement_rate: erate.trim() ? Number(erate) : undefined,
          impressions: imps.trim() ? Number(imps) : undefined,
          reach: chReach.trim() ? Number(chReach) : undefined,
          notes: noteWithRecordTime(chNote, time),
        });
        saved.push("channel");
      }
      if (financeTouched) {
        await finance.add.mutateAsync({
          entry_type: fType,
          category: cat,
          amount: Number(amt),
          entry_date: date,
          currency: CONSULTANT_FINANCE_CURRENCY,
          description: noteWithRecordTime(fNote, time),
        });
        saved.push("finance");
      }
      toast.success(`Saved · ${saved.join(" · ")}`);
      onDone();
    } catch {
      // mutation onError already toasts
    }
  };

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      <SheetHeader className="shrink-0 px-4 pb-3 pt-3 sm:px-6 sm:pb-4">
        <div className="flex items-start gap-3 text-left">
          <div className="consultant-control flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl">
            <Sparkles className="h-5 w-5 text-primary" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <SheetTitle className="text-[18px] font-semibold tracking-[-0.02em]">Smart Add Record</SheetTitle>
              <span className="rounded-full border border-primary/20 bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
                {readyCount > 0 ? `${readyCount} ready` : "Start simple"}
              </span>
            </div>
            <SheetDescription className="mt-1 text-[12px] leading-5 text-muted-foreground/75">
              Add content, metrics, channel stats, or money without touching the data model.
            </SheetDescription>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <MiniStatus icon={platformMeta.icon} label={platformMeta.label} />
              <MiniStatus icon={CalendarDays} label={date} />
              <MiniStatus icon={Clock3} label={time} />
            </div>
          </div>
        </div>
      </SheetHeader>

      <div className="flex-1 min-h-0 overflow-y-auto px-4 pb-4 pt-2 sm:px-6 sm:pb-5">
        <div className="mx-auto max-w-[680px] space-y-3.5">
          <SectionCard icon={Layers3} label="Essentials" hint="Answer these first. Everything else can wait.">
            <Field label="1. Choose platform">
              <PlatformPicker value={platform} onChange={setPlatform} />
            </Field>

            <Field label="2. Name this record" hint="Example: Friday promo launch">
              <Input
                value={pName}
                onChange={(e) => setPName(e.target.value)}
                placeholder="Friday promo launch"
                className={inputCls}
              />
            </Field>

            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-[1fr_0.75fr]">
              <Field label="3. Date">
                <div className="relative">
                  <CalendarDays className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/55" />
                  <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={cn(inputCls, "pl-10")} />
                </div>
              </Field>
              <Field label="Time">
                <div className="relative">
                  <Clock3 className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/55" />
                  <Input type="time" value={time} onChange={(e) => setTime(e.target.value)} className={cn(inputCls, "pl-10")} />
                </div>
              </Field>
            </div>
            <Field label="Link" hint="Optional">
              <div className="relative">
                <Link2 className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/55" />
                <Input value={pUrl} onChange={(e) => setPUrl(e.target.value)} placeholder="https://…" className={cn(inputCls, "pl-10")} />
              </div>
            </Field>
          </SectionCard>

        {/* PERFORMANCE — metrics on this post */}
        <CollapsibleSection
          icon={BarChart3}
          label="Performance"
          hint={metricsTouched ? "Metrics ready" : "Add views, likes, comments"}
          active={metricsTouched}
          open={perfOpen}
          onOpenChange={setPerfOpen}
        >
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
            <NumberField label="Views"    value={views}    onChange={setViews} />
            <NumberField label="Reach"    value={reach}    onChange={setReach} />
            <NumberField label="Likes"    value={likes}    onChange={setLikes} />
            <NumberField label="Comments" value={comments} onChange={setComments} />
            <NumberField label="Shares"   value={shares}   onChange={setShares} />
            <NumberField label="Saves"    value={saves}    onChange={setSaves} />
          </div>
          <Field label="Note" hint="Optional. Add only what you know.">
            <Textarea
              value={pNotes} onChange={(e) => setPNotes(e.target.value)} rows={2}
              placeholder="Hook landed well, comment thread went deep…"
              className="consultant-control rounded-[var(--glass-radius-control)] focus-visible:border-primary/40 focus-visible:ring-2 focus-visible:ring-primary/15 resize-none"
            />
          </Field>
        </CollapsibleSection>

        {/* CHANNEL KPIs — the platform snapshot for this date */}
        <CollapsibleSection
          icon={Users}
          label="Channel KPIs"
          hint={channelTouched ? "Snapshot ready" : "Add followers, total views, reach"}
          active={channelTouched}
          open={chOpen}
          onOpenChange={setChOpen}
        >
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
            <NumberField label="Followers"    value={followers} onChange={setFollowers} placeholder="" />
            <NumberField label="Total views"  value={tviews}    onChange={setTviews}    placeholder="" />
            <NumberField label="Posts count"  value={pcount}    onChange={setPcount}    placeholder="" />
            <NumberField label="Engagement %" value={erate}     onChange={setErate}     placeholder="" />
            <NumberField label="Impressions"  value={imps}      onChange={setImps}      placeholder="" />
            <NumberField label="Reach"        value={chReach}   onChange={setChReach}   placeholder="" />
          </div>
          <Field label="Note" hint="Optional">
            <Textarea
              value={chNote} onChange={(e) => setChNote(e.target.value)} rows={2}
              placeholder="What changed on the channel today?"
              className="consultant-control rounded-[var(--glass-radius-control)] focus-visible:border-primary/40 focus-visible:ring-2 focus-visible:ring-primary/15 resize-none"
            />
          </Field>
        </CollapsibleSection>

        {/* MONETIZATION — CFO ledger entry tied to this record's date */}
        <CollapsibleSection
          icon={CircleDollarSign}
          label="Money"
          hint={financeTouched ? `${fType === "income" ? "Income" : "Expense"} ready` : `Income or expense in ${CONSULTANT_FINANCE_CURRENCY}`}
          active={financeTouched}
          open={finOpen}
          onOpenChange={setFinOpen}
        >
          <div className="grid grid-cols-2 gap-1.5 p-1 rounded-xl bg-white/[0.04] border border-white/[0.05]">
            {(["expense", "income"] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setFType(t)}
                className={cn(
                  "h-9 rounded-lg text-[12px] font-medium capitalize transition-all",
                  fType === t
                    ? "bg-primary/20 text-primary border-primary/30"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {t}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-2.5">
            <Field label="Category">
              <Input value={cat} onChange={(e) => setCat(e.target.value)} className={inputCls} />
            </Field>
            <Field label={`Amount (${CONSULTANT_FINANCE_CURRENCY})`}>
              <div className="relative">
                <Input
                  type="number" min={0} inputMode="decimal"
                  value={amt} onChange={(e) => setAmt(e.target.value)}
                  placeholder="100"
                  className={cn(inputCls, "pr-16 tabular-nums font-semibold")}
                />
                <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[11px] font-semibold text-primary">
                  {CONSULTANT_FINANCE_CURRENCY}
                </span>
              </div>
            </Field>
          </div>

          <Field label="Note">
            <Textarea
              value={fNote} onChange={(e) => setFNote(e.target.value)} rows={2}
              placeholder="Optional context…"
              className="consultant-control rounded-[var(--glass-radius-control)] focus-visible:border-primary/40 focus-visible:ring-2 focus-visible:ring-primary/15 resize-none"
            />
          </Field>
        </CollapsibleSection>
        </div>
      </div>

      <div className="shrink-0 border-t border-border/20 bg-background/55 px-4 py-3.5 backdrop-blur-xl sm:px-6">
        <div className="mx-auto max-w-[680px] space-y-2.5">
          <div className="flex flex-wrap gap-1.5">
            <ReadinessChip label="Content" active={contentTouched} />
            <ReadinessChip label="Metrics" active={metricsTouched} />
            <ReadinessChip label="Channel" active={channelTouched} />
            <ReadinessChip label="Money" active={financeTouched} />
          </div>
          <PrimaryCta onClick={submit} loading={saving} disabled={!contentTouched && !channelTouched && !financeTouched}>
            Save record
          </PrimaryCta>
        </div>
      </div>
    </div>
  );
}

/* ─────────── Shared atoms ─────────── */

function SectionCard({ icon: Icon, label, hint, children, className }: { icon: LucideIcon; label: string; hint?: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={cn("consultant-panel space-y-3.5 p-3.5 sm:p-4", className)}>
      <SectionHeading icon={Icon} label={label} hint={hint} />
      {children}
    </section>
  );
}

function CollapsibleSection({
  icon: Icon, label, hint, active, open, onOpenChange, children,
}: {
  icon: LucideIcon; label: string; hint: string; active: boolean;
  open: boolean; onOpenChange: (o: boolean) => void; children: React.ReactNode;
}) {
  return (
    <Collapsible open={open} onOpenChange={onOpenChange}>
      <section className={cn("consultant-panel overflow-hidden transition-colors", active && "border-primary/25 bg-primary/[0.035]")}>
        <CollapsibleTrigger className="w-full px-3.5 py-3.5 text-left transition-colors hover:bg-primary/[0.03] sm:px-4">
          <div className="flex items-center justify-between gap-3">
            <SectionHeading icon={Icon} label={label} hint={hint} active={active} />
            <div className="flex items-center gap-2">
              {active && <CheckCircle2 className="h-4 w-4 text-primary" />}
              <ChevronDown className={cn("h-4 w-4 text-muted-foreground/60 transition-transform duration-300", open && "rotate-180")} />
            </div>
          </div>
        </CollapsibleTrigger>
        <CollapsibleContent className="data-[state=open]:animate-in data-[state=open]:fade-in-50 data-[state=open]:slide-in-from-top-1">
          <div className="px-4 pb-4 space-y-3 border-t border-white/[0.04] pt-3.5">
            {children}
          </div>
        </CollapsibleContent>
      </section>
    </Collapsible>
  );
}

function SectionHeading({ icon: Icon, label, hint, active }: { icon: LucideIcon; label: string; hint?: string; active?: boolean }) {
  return (
    <div className="flex min-w-0 items-center gap-2.5">
      <span className={cn("consultant-control flex h-8 w-8 shrink-0 items-center justify-center rounded-xl", active && "border-primary/30 bg-primary/10 text-primary")}>
        <Icon className="h-4 w-4" />
      </span>
      <span className="min-w-0">
        <span className="block text-[11px] font-semibold uppercase tracking-[0.16em] text-foreground/85">{label}</span>
        {hint && <span className={cn("mt-0.5 block truncate text-[12px]", active ? "text-primary/80" : "text-muted-foreground/75")}>{hint}</span>}
      </span>
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <Label className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground/70 font-medium">{label}</Label>
        {hint && <span className="truncate text-[10.5px] text-muted-foreground/55">{hint}</span>}
      </div>
      {children}
    </div>
  );
}

const inputCls =
  "consultant-control h-11 rounded-xl focus-visible:border-primary/40 focus-visible:ring-2 focus-visible:ring-primary/15 transition placeholder:text-muted-foreground/40";

function NumberField({
  label, value, onChange, placeholder = "0",
}: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <Field label={label}>
      <Input
        type="number" min={0} inputMode="numeric"
        value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
        className={cn(inputCls, "tabular-nums")}
      />
    </Field>
  );
}

function PlatformPicker({ value, onChange }: { value: Platform; onChange: (p: Platform) => void }) {
  return (
    <div className="grid grid-cols-4 gap-1.5 sm:grid-cols-6">
      {PLATFORM_META.map(({ id, label, icon: Icon }) => {
        const active = id === value;
        return (
          <button
            type="button"
            key={id}
            onClick={() => onChange(id)}
            title={label}
            className={cn(
              "group flex h-12 items-center justify-center gap-1.5 rounded-2xl border px-2 transition-all sm:h-11 sm:rounded-xl",
              active
                ? "bg-primary/15 border-primary/40 text-primary shadow-[0_0_0_1px_hsl(var(--primary)/0.08)]"
                : "consultant-control text-muted-foreground/80 hover:text-foreground"
            )}
            aria-pressed={active}
            aria-label={label}
          >
            <Icon className="h-4 w-4" />
            <span className="hidden truncate text-[11px] font-medium sm:inline">{label}</span>
          </button>
        );
      })}
    </div>
  );
}

function MiniStatus({ icon: Icon, label }: { icon: React.ComponentType<{ className?: string }>; label: string }) {
  return (
    <span className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-border/25 bg-white/[0.04] px-2.5 py-1 text-[11px] text-muted-foreground">
      <Icon className="h-3.5 w-3.5 shrink-0 text-primary/80" />
      <span className="truncate">{label}</span>
    </span>
  );
}

function ReadinessChip({ label, active }: { label: string; active: boolean }) {
  return (
    <span className={cn(
      "inline-flex h-6 items-center gap-1.5 rounded-full border px-2 text-[10.5px] font-medium transition-colors",
      active ? "border-primary/25 bg-primary/10 text-primary" : "border-border/25 bg-white/[0.03] text-muted-foreground/65",
    )}>
      {active ? <CheckCircle2 className="h-3 w-3" /> : <PlusCircle className="h-3 w-3" />}
      {label}
    </span>
  );
}

function PrimaryCta({
  children, onClick, loading, disabled,
}: { children: React.ReactNode; onClick: () => void; loading?: boolean; disabled?: boolean }) {
  return (
    <Button
      onClick={onClick}
      disabled={disabled || loading}
      className="w-full h-11 rounded-xl font-semibold bg-primary/15 text-primary border border-primary/20 hover:bg-primary/25 transition-all"
    >
      {loading && <Loader2 className="h-4 w-4 animate-spin" />}
      {children}
    </Button>
  );
}
