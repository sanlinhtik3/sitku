import { useMemo, useState } from "react";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from "@/components/ui/sheet";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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
  Music2, AtSign, Eye, Heart, MessageCircle, Share2, Bookmark, Radar,
  ChevronDown, Loader2, Sparkles, TrendingUp, Wallet, Radio,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface Props { open: boolean; onOpenChange: (o: boolean) => void; }

const today = () => localDateString();

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
  const [tab, setTab] = useState<"content" | "channel" | "finance">("content");

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="consultant-shell w-full sm:max-w-md p-0 border-l"
      >
        <div className="flex flex-col h-full">
          <SheetHeader className="px-5 pt-4 pb-3 border-b border-border/20">
            <div className="flex items-center gap-2.5">
              <div className="consultant-control h-8 w-8 rounded-xl flex items-center justify-center">
                <Sparkles className="h-4 w-4 text-primary" />
              </div>
              <div className="min-w-0">
                <SheetTitle className="text-base font-semibold tracking-tight">Add Record</SheetTitle>
                <SheetDescription className="text-[11px] text-muted-foreground/70 mt-0.5">
                  Content, channel KPIs & CFO ledger — in one place.
                </SheetDescription>
              </div>
            </div>
          </SheetHeader>

          <Tabs value={tab} onValueChange={(v) => setTab(v as "content" | "channel" | "finance")} className="flex-1 min-h-0 flex flex-col">
            <div className="px-5 pt-4">
              <TabsList className="consultant-control w-full h-10 p-1 rounded-full grid grid-cols-3">
                <PillTrigger value="content" icon={TrendingUp} label="Content" />
                <PillTrigger value="channel" icon={Radio}      label="Channel" />
                <PillTrigger value="finance" icon={Wallet}     label="Finance" />
              </TabsList>
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4">
              <TabsContent value="content" className="mt-0 focus-visible:outline-none data-[state=active]:animate-in data-[state=active]:fade-in-50 data-[state=active]:slide-in-from-bottom-1">
                <ContentForm onDone={() => onOpenChange(false)} />
              </TabsContent>
              <TabsContent value="channel" className="mt-0 focus-visible:outline-none data-[state=active]:animate-in data-[state=active]:fade-in-50 data-[state=active]:slide-in-from-bottom-1">
                <ChannelForm onDone={() => onOpenChange(false)} />
              </TabsContent>
              <TabsContent value="finance" className="mt-0 focus-visible:outline-none data-[state=active]:animate-in data-[state=active]:fade-in-50 data-[state=active]:slide-in-from-bottom-1">
                <FinanceForm onDone={() => onOpenChange(false)} />
              </TabsContent>
            </div>
          </Tabs>
        </div>
      </SheetContent>
    </Sheet>
  );
}

/* ─────────── Shared atoms ─────────── */

function PillTrigger({ value, icon: Icon, label }: { value: string; icon: LucideIcon; label: string }) {
  return (
    <TabsTrigger
      value={value}
      className="rounded-full text-[12px] font-medium gap-1.5 data-[state=active]:bg-primary/20 data-[state=active]:text-primary data-[state=active]:border data-[state=active]:border-primary/25 transition-all"
    >
      <Icon className="h-3.5 w-3.5" />
      {label}
    </TabsTrigger>
  );
}

function SectionCard({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={cn("consultant-panel p-4 space-y-3", className)}>
      <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground/60 font-medium">{label}</div>
      {children}
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground/70 font-medium">{label}</Label>
      {children}
    </div>
  );
}

const inputCls =
  "consultant-control h-11 rounded-xl focus-visible:border-primary/40 focus-visible:ring-2 focus-visible:ring-primary/15 transition";

function NumberField({
  label, value, onChange, icon: Icon, placeholder = "0",
}: { label: string; value: string; onChange: (v: string) => void; icon: LucideIcon; placeholder?: string }) {
  return (
    <Field label={label}>
      <div className="relative">
        <Icon className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/60 pointer-events-none" />
        <Input
          type="number" min={0} inputMode="numeric"
          value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
          className={cn(inputCls, "pl-9 tabular-nums")}
        />
      </div>
    </Field>
  );
}

function PlatformPicker({ value, onChange }: { value: Platform; onChange: (p: Platform) => void }) {
  return (
    <div className="grid grid-cols-6 gap-1.5">
      {PLATFORM_META.map(({ id, label, icon: Icon }) => {
        const active = id === value;
        return (
          <button
            type="button"
            key={id}
            onClick={() => onChange(id)}
            title={label}
            className={cn(
              "h-11 rounded-xl flex items-center justify-center transition-all border",
              active
                ? "bg-primary/15 border-primary/40 text-primary"
                : "consultant-control text-muted-foreground/80 hover:text-foreground"
            )}
            aria-pressed={active}
            aria-label={label}
          >
            <Icon className="h-4 w-4" />
          </button>
        );
      })}
    </div>
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

/* ─────────── CONTENT (Post + Metrics unified) ─────────── */

function ContentForm({ onDone }: { onDone: () => void }) {
  const posts = useConsultantPosts();
  const metrics = useConsultantMetrics();

  // Essentials
  const [editingId, setEditingId] = useState<string>("");
  const [pName, setPName] = useState("");
  const [pPlatform, setPPlatform] = useState<Platform>("facebook");
  const [pUrl, setPUrl] = useState("");
  const [pDate, setPDate] = useState(today());

  // Performance
  const [perfOpen, setPerfOpen] = useState(false);
  const [views, setViews] = useState("");
  const [reach, setReach] = useState("");
  const [likes, setLikes] = useState("");
  const [comments, setComments] = useState("");
  const [shares, setShares] = useState("");
  const [saves, setSaves] = useState("");
  const [pNotes, setPNotes] = useState("");

  const metricsTouched = useMemo(() => {
    return [views, reach, likes, comments, shares, saves].some((v) => Number(v) > 0) || pNotes.trim().length > 0;
  }, [views, reach, likes, comments, shares, saves, pNotes]);

  // Hydrate from selected existing post
  const onPickExisting = (id: string) => {
    setEditingId(id);
    if (!id) return;
    const found = (posts.data ?? []).find((p) => p.id === id);
    if (found) {
      setPName(found.post_name);
      setPPlatform(found.platform);
      setPUrl(found.post_url ?? "");
      setPDate(found.posted_at);
      setPerfOpen(true);
    }
  };

  const saving = posts.upsert.isPending || metrics.addOrUpdate.isPending;

  const submit = async () => {
    if (!pName.trim()) {
      toast.error("Post name is required");
      return;
    }
    try {
      const { id } = await posts.upsert.mutateAsync({
        id: editingId || undefined,
        post_name: pName.trim(),
        platform: pPlatform,
        post_url: pUrl.trim() || null,
        posted_at: pDate,
        notes: null,
      });
      if (metricsTouched) {
        await metrics.addOrUpdate.mutateAsync({
          post_id: id,
          metric_date: pDate,
          views: Number(views) || 0,
          likes: Number(likes) || 0,
          comments: Number(comments) || 0,
          shares: Number(shares) || 0,
          saves: Number(saves) || 0,
          reach: Number(reach) || 0,
          notes: pNotes.trim() || null,
        });
        toast.success("Content & metrics saved");
      } else {
        toast.success("Content saved");
      }
      onDone();
    } catch {
      // mutation onError already toasts
    }
  };

  return (
    <div className="space-y-4">
      <SectionCard label="Essentials">
        <Field label="Platform">
          <PlatformPicker value={pPlatform} onChange={setPPlatform} />
        </Field>

        <Field label="Post name">
          <Input
            value={pName}
            onChange={(e) => setPName(e.target.value)}
            placeholder="Promo launch — Friday drop"
            className={inputCls}
          />
        </Field>

        <div className="grid grid-cols-2 gap-2.5">
          <Field label="Post URL">
            <Input value={pUrl} onChange={(e) => setPUrl(e.target.value)} placeholder="https://…" className={inputCls} />
          </Field>
          <Field label="Posted at">
            <Input type="date" value={pDate} onChange={(e) => setPDate(e.target.value)} className={inputCls} />
          </Field>
        </div>

        {(posts.data?.length ?? 0) > 0 && (
          <Field label="Or update existing post">
            <Select value={editingId} onValueChange={onPickExisting}>
              <SelectTrigger className={cn(inputCls, "text-left")}>
                <SelectValue placeholder="Create new post" />
              </SelectTrigger>
              <SelectContent className="max-h-64">
                {(posts.data ?? []).slice(0, 50).map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    <span className="truncate">{p.post_name}</span>
                    <span className="opacity-60"> · {p.platform}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        )}
      </SectionCard>

      <Collapsible open={perfOpen} onOpenChange={setPerfOpen}>
        <section className="consultant-panel overflow-hidden">
          <CollapsibleTrigger className="w-full flex items-center justify-between px-4 py-3.5 hover:bg-primary/[0.03] transition-colors">
            <div className="flex flex-col items-start">
              <span className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground/60 font-medium">Performance</span>
              <span className="text-[12px] text-muted-foreground/80 mt-0.5">
                {metricsTouched ? "Metrics ready" : "Optional — add engagement metrics"}
              </span>
            </div>
            <ChevronDown className={cn("h-4 w-4 text-muted-foreground/60 transition-transform duration-300", perfOpen && "rotate-180")} />
          </CollapsibleTrigger>
          <CollapsibleContent className="data-[state=open]:animate-in data-[state=open]:fade-in-50 data-[state=open]:slide-in-from-top-1">
            <div className="px-4 pb-4 space-y-3 border-t border-white/[0.04] pt-3.5">
              <div className="grid grid-cols-2 gap-2.5">
                <NumberField label="Views"    value={views}    onChange={setViews}    icon={Eye} />
                <NumberField label="Reach"    value={reach}    onChange={setReach}    icon={Radar} />
                <NumberField label="Likes"    value={likes}    onChange={setLikes}    icon={Heart} />
                <NumberField label="Comments" value={comments} onChange={setComments} icon={MessageCircle} />
                <NumberField label="Shares"   value={shares}   onChange={setShares}   icon={Share2} />
                <NumberField label="Saves"    value={saves}    onChange={setSaves}    icon={Bookmark} />
              </div>
              <Field label="Notes">
                <Textarea
                  value={pNotes} onChange={(e) => setPNotes(e.target.value)} rows={2}
                  placeholder="Hook landed well, comment thread went deep…"
                  className="consultant-control rounded-[var(--glass-radius-control)] focus-visible:border-primary/40 focus-visible:ring-2 focus-visible:ring-primary/15 resize-none"
                />
              </Field>
            </div>
          </CollapsibleContent>
        </section>
      </Collapsible>

      <PrimaryCta onClick={submit} loading={saving} disabled={!pName.trim()}>
        {editingId ? "Update content" : "Save content"}
      </PrimaryCta>
    </div>
  );
}

/* ─────────── CHANNEL ─────────── */

function ChannelForm({ onDone }: { onDone: () => void }) {
  const daily = useConsultantDailySnapshots();
  const [platform, setPlatform] = useState<Platform>("facebook");
  const [date, setDate] = useState(today());
  const [followers, setFollowers] = useState("");
  const [tviews, setTviews] = useState("");
  const [pcount, setPcount] = useState("");
  const [erate, setErate] = useState("");
  const [imps, setImps] = useState("");
  const [reach, setReach] = useState("");
  const [note, setNote] = useState("");

  const submit = async () => {
    await daily.upsert.mutateAsync({
      platform, captured_at: date,
      followers: followers ? Number(followers) : undefined,
      total_views: tviews ? Number(tviews) : undefined,
      posts_count: pcount ? Number(pcount) : undefined,
      engagement_rate: erate ? Number(erate) : undefined,
      impressions: imps ? Number(imps) : undefined,
      reach: reach ? Number(reach) : undefined,
      notes: note.trim() || null,
    });
    onDone();
  };

  return (
    <div className="space-y-4">
      <SectionCard label="Channel snapshot">
        <Field label="Platform">
          <PlatformPicker value={platform} onChange={setPlatform} />
        </Field>
        <Field label="Date">
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inputCls} />
        </Field>
      </SectionCard>

      <SectionCard label="KPIs">
        <div className="grid grid-cols-2 gap-2.5">
          <NumberField label="Followers"    value={followers} onChange={setFollowers} icon={Heart} placeholder="" />
          <NumberField label="Total views"  value={tviews}    onChange={setTviews}    icon={Eye} placeholder="" />
          <NumberField label="Posts count"  value={pcount}    onChange={setPcount}    icon={Sparkles} placeholder="" />
          <NumberField label="Engagement %" value={erate}     onChange={setErate}     icon={TrendingUp} placeholder="" />
          <NumberField label="Impressions"  value={imps}      onChange={setImps}      icon={Radar} placeholder="" />
          <NumberField label="Reach"        value={reach}     onChange={setReach}     icon={Share2} placeholder="" />
        </div>
        <Field label="Notes">
          <Textarea
            value={note} onChange={(e) => setNote(e.target.value)} rows={2}
            placeholder="What changed today?"
            className="consultant-control rounded-[var(--glass-radius-control)] focus-visible:border-primary/40 focus-visible:ring-2 focus-visible:ring-primary/15 resize-none"
          />
        </Field>
      </SectionCard>

      <PrimaryCta onClick={submit} loading={daily.upsert.isPending}>
        Save snapshot
      </PrimaryCta>
    </div>
  );
}

/* ─────────── FINANCE ─────────── */

function FinanceForm({ onDone }: { onDone: () => void }) {
  const finance = useConsultantFinance();
  const [type, setType] = useState<"expense" | "income">("expense");
  const [cat, setCat] = useState("Ads");
  const [amt, setAmt] = useState("");
  const [date, setDate] = useState(today());
  const [note, setNote] = useState("");

  const submit = async () => {
    if (!amt) return;
    await finance.add.mutateAsync({
      entry_type: type, category: cat, amount: Number(amt),
      entry_date: date, currency: CONSULTANT_FINANCE_CURRENCY, description: note.trim() || null,
    });
    setAmt(""); setNote("");
    onDone();
  };

  return (
    <div className="space-y-4">
      <SectionCard label="Entry">
        <div className="grid grid-cols-2 gap-1.5 p-1 rounded-xl bg-white/[0.04] border border-white/[0.05]">
          {(["expense", "income"] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setType(t)}
              className={cn(
                "h-9 rounded-lg text-[12px] font-medium capitalize transition-all",
                type === t
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
          <Field label="Date">
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inputCls} />
          </Field>
        </div>

        <Field label={`Amount (${CONSULTANT_FINANCE_CURRENCY})`}>
          <div className="relative">
            <Input
              type="number" min={0} inputMode="decimal"
              value={amt} onChange={(e) => setAmt(e.target.value)}
              placeholder="100"
              className={cn(inputCls, "pr-16 text-base tabular-nums font-semibold")}
            />
            <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[11px] font-semibold text-primary">
              {CONSULTANT_FINANCE_CURRENCY}
            </span>
          </div>
        </Field>

        <Field label="Note">
          <Textarea
            value={note} onChange={(e) => setNote(e.target.value)} rows={2}
            placeholder="Optional context…"
            className="consultant-control rounded-[var(--glass-radius-control)] focus-visible:border-primary/40 focus-visible:ring-2 focus-visible:ring-primary/15 resize-none"
          />
        </Field>
      </SectionCard>

      <PrimaryCta onClick={submit} loading={finance.add.isPending} disabled={!amt}>
        Save entry
      </PrimaryCta>
    </div>
  );
}
