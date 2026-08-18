import { useState } from "react";
import { MagicStick3, Refresh } from "@solar-icons/react";
import { cn } from "@/lib/utils";
import { useContentSignals } from "./useContentSignals";
import type { ContentProfile, ContentSignalScore } from "./types";

const READINESS_SEGMENTS = Array.from({ length: 28 }, (_, index) => index);

function scoreColor(score: Pick<ContentSignalScore, "status">) {
  if (score.status === "good") return "var(--bb-success)";
  if (score.status === "watch") return "var(--bb-warning)";
  return "var(--bb-text-4)";
}

function scoreStatus(score?: ContentSignalScore) {
  if (!score || score.value == null) return "Needs data";
  if (score.status === "good") return "Strong";
  return "Improve";
}

function DetailsButton({ open, onClick }: { open: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-expanded={open}
      onClick={onClick}
      className="h-8 rounded-[var(--bb-radius-control)] border border-[var(--bb-border)] bg-[var(--bb-bg-3)] px-3 text-[10.5px] font-medium text-[var(--bb-text-2)] transition-colors hover:bg-[var(--bb-sidebar-hover)] hover:text-[var(--bb-text-1)]"
    >
      {open ? "Close" : "Details"}
    </button>
  );
}

function AiProcessButton({ busy, disabled, processed, onClick }: {
  busy: boolean;
  disabled: boolean;
  processed: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled || busy}
      onClick={onClick}
      className="inline-flex h-8 w-full items-center justify-center gap-1.5 rounded-[var(--bb-radius-control)] bg-[var(--bb-accent)] px-3 text-[10.5px] font-semibold text-[var(--bb-accent-foreground)] transition-opacity disabled:cursor-not-allowed disabled:opacity-50"
    >
      <MagicStick3 className={cn("h-3.5 w-3.5", busy && "animate-pulse")} />
      {busy ? "Processing" : processed ? "Process again" : "Process with AI"}
    </button>
  );
}

function InfoDot({ label }: { label: string }) {
  return (
    <span
      aria-label={label}
      title={label}
      className="inline-grid h-3.5 w-3.5 place-items-center rounded-full bg-[var(--bb-bg-3)] text-[8px] font-semibold text-[var(--bb-text-4)]"
    >
      i
    </span>
  );
}

function MetricRow({ score }: { score: ContentSignalScore }) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_2.6rem] items-center gap-3 py-2">
      <div className="min-w-0">
        <div className="flex items-center justify-between gap-2">
          <span className="truncate text-[10.5px] font-medium text-[var(--bb-text-2)]">{score.label}</span>
          <span className="text-[10px] tabular-nums text-[var(--bb-text-3)]">{score.value ?? "—"}</span>
        </div>
        <div className="mt-1 h-1 overflow-hidden rounded-full bg-[var(--bb-bg-4)]">
          <span
            className="block h-full rounded-full transition-[width] duration-300 motion-reduce:transition-none"
            style={{ width: `${score.value ?? 0}%`, backgroundColor: scoreColor(score) }}
          />
        </div>
      </div>
      <span className="text-right text-[9.5px] text-[var(--bb-text-4)]">{scoreStatus(score)}</span>
    </div>
  );
}

function SignalDonut({ strong, improve, needsData, total, ready }: { strong: number; improve: number; needsData: number; total: number; ready: boolean }) {
  const safeTotal = Math.max(1, total);
  const segments = [
    { value: strong, color: "var(--bb-success)" },
    { value: improve, color: "var(--bb-warning)" },
    { value: needsData, color: "var(--bb-text-4)" },
  ];
  let offset = 0;
  return (
    <div className="relative aspect-square">
      <svg viewBox="0 0 100 100" role="img" aria-label={`${strong} strong, ${improve} improve, ${needsData} need data`} className="h-full w-full -rotate-90">
        <circle cx="50" cy="50" r="39" fill="none" stroke="var(--bb-bg-4)" strokeWidth="15" />
        {segments.map((segment, index) => {
          const length = (segment.value / safeTotal) * 100;
          const currentOffset = offset;
          offset += length;
          return segment.value > 0 ? (
            <circle
              key={index}
              cx="50"
              cy="50"
              r="39"
              fill="none"
              pathLength="100"
              stroke={segment.color}
              strokeWidth="15"
              strokeDasharray={`${length} ${100 - length}`}
              strokeDashoffset={-currentOffset}
            />
          ) : null;
        })}
      </svg>
      <span className="absolute inset-0 grid place-items-center text-[18px] font-medium tabular-nums text-[var(--bb-text-1)]">{ready ? total : "—"}</span>
    </div>
  );
}

export function SignalsPanel({ notePath, getContent, onJumpToParagraph }: {
  notePath?: string;
  getContent: () => string;
  onJumpToParagraph: (paragraph: number) => void;
}) {
  const {
    profile, setProfile, report, isAnalyzing, isReviewing, error, refresh, review,
    calibration, verifiedOutcomes, manualPosts, linkVerifiedPost,
  } = useContentSignals({ active: true, notePath, getContent });
  const [readinessDetails, setReadinessDetails] = useState(false);
  const [qualityDetails, setQualityDetails] = useState(false);

  const aiReview = report?.aiReview;
  const aiScores = aiReview?.scores || [];
  const readiness = aiScores.find((score) => score.id === "readiness");
  const viral = aiScores.find((score) => score.id === "viral_potential");
  const scores = aiScores.filter((score) => !["readiness", "viral_potential"].includes(score.id));
  const good = scores.filter((score) => score.status === "good").length;
  const watch = scores.filter((score) => score.status === "watch").length;
  const needsData = scores.filter((score) => score.status === "needs_data").length;
  const scoreCount = Math.max(1, scores.length);
  const readinessValue = readiness?.value ?? 0;
  const filledSegments = Math.round((readinessValue / 100) * READINESS_SEGMENTS.length);
  const setProfileValue = <K extends keyof ContentProfile>(key: K, value: ContentProfile[K]) => setProfile((current) => ({ ...current, [key]: value }));
  const qualitySignals = [
    aiScores.find((score) => score.id === "hook"),
    aiScores.find((score) => score.id === "flow"),
    aiScores.find((score) => score.id === "clarity"),
  ].filter((score): score is ContentSignalScore => Boolean(score));
  const qualityTotal = qualitySignals.reduce((sum, score) => sum + (score.value ?? 0), 0);
  const qualityWidths = qualitySignals.map((score) => qualityTotal > 0 ? ((score.value ?? 0) / qualityTotal) * 100 : 0);
  const signalMix = [
    { label: "Strong", count: good, color: "var(--bb-success)" },
    { label: "Improve", count: watch, color: "var(--bb-warning)" },
    { label: "Needs data", count: needsData, color: "var(--bb-text-4)" },
  ];

  return (
    <div className="flex min-h-0 flex-col gap-3 bg-[var(--bb-bg-1)] pb-3">
      <section aria-label="Draft readiness" className="rounded-[var(--bb-radius-panel)] border border-[var(--bb-border)] bg-[var(--bb-bg-2)] p-3.5 shadow-[var(--bb-shadow-card)]">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-1.5">
            <h2 className="text-[12px] font-medium text-[var(--bb-text-2)]">Draft readiness</h2>
            <InfoDot label="A local score based on the current draft." />
          </div>
          <DetailsButton open={readinessDetails} onClick={() => setReadinessDetails((open) => !open)} />
        </div>

        <div className="mt-1 flex items-baseline gap-2">
          <strong className="text-[28px] font-medium leading-none tabular-nums text-[var(--bb-text-1)]">{readiness?.value ?? "—"}{readiness?.value != null && "%"}</strong>
          <span className={cn(
            "text-[11px] font-medium",
            readiness?.status === "good" ? "text-[var(--bb-success)]" : readiness?.status === "watch" ? "text-[var(--bb-warning)]" : "text-[var(--bb-text-4)]",
          )}>{scoreStatus(readiness)}</span>
        </div>

        <div className="mt-4 flex h-10 items-stretch gap-[3px]" aria-label={`Readiness ${readiness?.value ?? "needs data"}`}>
          {READINESS_SEGMENTS.map((segment) => (
            <span
              key={segment}
              className="min-w-0 flex-1 bg-[var(--bb-bg-4)] transition-colors duration-300 motion-reduce:transition-none"
              style={segment < filledSegments ? { backgroundColor: "var(--bb-accent)" } : undefined}
            />
          ))}
        </div>

        <div className="mt-3 flex items-center justify-between gap-3 text-[10.5px]">
          <span className="capitalize text-[var(--bb-text-3)]">{profile.platform} · {profile.format}</span>
          <span className="tabular-nums text-[var(--bb-text-2)]">{report?.meta.words?.toLocaleString() ?? "—"} words</span>
        </div>

        {aiReview ? (
          <div className="mt-3 border-t border-[var(--bb-border)] pt-3">
            <p className="text-[10.5px] font-medium leading-relaxed text-[var(--bb-text-1)]">{aiReview.verdict}</p>
            <p className="mt-1.5 text-[9.5px] leading-relaxed text-[var(--bb-text-3)]">{aiReview.summary}</p>
          </div>
        ) : (
          <p className="mt-3 border-t border-[var(--bb-border)] pt-3 text-[9.5px] leading-relaxed text-[var(--bb-text-3)]">
            Process this draft to generate grounded quality metrics. Nothing shown here is a fabricated performance result.
          </p>
        )}
        {error && <p className="mt-2 text-[10px] leading-relaxed text-[var(--bb-danger)]">{error}</p>}
        <div className="mt-3">
          <AiProcessButton busy={isReviewing} disabled={!report} processed={Boolean(aiReview)} onClick={() => void review()} />
        </div>

        {readinessDetails && (
          <div className="mt-3 border-t border-[var(--bb-border)] pt-3">
            <div className="grid grid-cols-2 gap-2">
              <label className="text-[9px] font-medium uppercase tracking-[0.08em] text-[var(--bb-text-4)]">Platform
                <select value={profile.platform} onChange={(event) => setProfileValue("platform", event.target.value as ContentProfile["platform"])} className="mt-1 h-8 w-full rounded-[var(--bb-radius-control)] border border-[var(--bb-border)] bg-[var(--bb-bg-3)] px-2 text-[10.5px] font-medium normal-case tracking-normal text-[var(--bb-text-1)] outline-none focus:border-[var(--bb-focus)]">
                  <option value="facebook">Facebook</option><option value="instagram">Instagram</option><option value="tiktok">TikTok</option><option value="youtube">YouTube</option><option value="general">General</option>
                </select>
              </label>
              <label className="text-[9px] font-medium uppercase tracking-[0.08em] text-[var(--bb-text-4)]">Format
                <select value={profile.format} onChange={(event) => setProfileValue("format", event.target.value as ContentProfile["format"])} className="mt-1 h-8 w-full rounded-[var(--bb-radius-control)] border border-[var(--bb-border)] bg-[var(--bb-bg-3)] px-2 text-[10.5px] font-medium normal-case tracking-normal text-[var(--bb-text-1)] outline-none focus:border-[var(--bb-focus)]">
                  <option value="post">Post</option><option value="script">Script</option><option value="article">Article</option><option value="note">Note</option>
                </select>
              </label>
            </div>
            <div className="mt-3 grid grid-cols-4 gap-1 text-center">
              {[["Words", report?.meta.words], ["Chars", report?.meta.characters], ["Sentences", report?.meta.segments], ["Paragraphs", report?.meta.paragraphs]].map(([label, value]) => (
                <div key={String(label)} className="rounded-[var(--bb-radius-control)] bg-[var(--bb-bg-3)] px-1 py-2">
                  <div className="text-[11px] font-medium tabular-nums text-[var(--bb-text-1)]">{typeof value === "number" ? value.toLocaleString() : "—"}</div>
                  <div className="mt-0.5 truncate text-[8px] uppercase tracking-[0.06em] text-[var(--bb-text-4)]">{label}</div>
                </div>
              ))}
            </div>
            <button type="button" onClick={() => void refresh()} className="mt-3 inline-flex h-8 items-center gap-1.5 rounded-[var(--bb-radius-control)] border border-[var(--bb-border)] bg-[var(--bb-bg-3)] px-3 text-[10.5px] font-medium text-[var(--bb-text-2)] hover:bg-[var(--bb-sidebar-hover)]">
              <Refresh className={cn("h-3.5 w-3.5", isAnalyzing && "animate-spin")} /> Refresh
            </button>
          </div>
        )}
      </section>

      <section aria-label="Signal balance" className="rounded-[var(--bb-radius-panel)] border border-[var(--bb-border)] bg-[var(--bb-bg-2)] p-3.5 shadow-[var(--bb-shadow-card)]">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-1.5">
            <h2 className="text-[12px] font-medium text-[var(--bb-text-2)]">Signal balance</h2>
            <InfoDot label="How many quality checks are strong, need work, or need more data." />
          </div>
          <span className="text-[10.5px] font-medium text-[var(--bb-success)]">{aiReview ? `${good}/${scores.length} strong` : "AI review required"}</span>
        </div>

        <div className="mt-4 grid grid-cols-[6.25rem_minmax(0,1fr)] items-center gap-4">
          <SignalDonut strong={good} improve={watch} needsData={needsData} total={scores.length} ready={Boolean(aiReview)} />
          <div className="space-y-2.5">
            {signalMix.map((item) => (
              <div key={item.label} className="grid grid-cols-[0.5rem_minmax(0,1fr)_auto_auto] items-center gap-2 text-[10.5px]">
                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: item.color }} />
                <span className="truncate text-[var(--bb-text-2)]">{item.label}</span>
                <strong className="font-medium tabular-nums text-[var(--bb-text-1)]">{aiReview ? item.count : "—"}</strong>
                <span className="w-8 text-right tabular-nums text-[var(--bb-text-4)]">{aiReview ? `${Math.round((item.count / scoreCount) * 100)}%` : "—"}</span>
              </div>
            ))}
          </div>
        </div>
        {aiReview && (
          <div className="mt-3 grid gap-2 border-t border-[var(--bb-border)] pt-3">
            <div className="grid grid-cols-[4.5rem_minmax(0,1fr)] gap-2 text-[9.5px] leading-relaxed"><span className="font-medium text-[var(--bb-success)]">Strongest</span><span className="text-[var(--bb-text-3)]">{aiReview.strongest}</span></div>
            <div className="grid grid-cols-[4.5rem_minmax(0,1fr)] gap-2 text-[9.5px] leading-relaxed"><span className="font-medium text-[var(--bb-warning)]">Watch</span><span className="text-[var(--bb-text-3)]">{aiReview.weakest}</span></div>
          </div>
        )}
      </section>

      <section aria-label="Quality channels" className="rounded-[var(--bb-radius-panel)] border border-[var(--bb-border)] bg-[var(--bb-bg-2)] p-3.5 shadow-[var(--bb-shadow-card)]">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-1.5">
            <h2 className="text-[12px] font-medium text-[var(--bb-text-2)]">Publishing fit</h2>
            <InfoDot label="Hook, story flow, and clarity for the selected platform." />
          </div>
          <DetailsButton open={qualityDetails} onClick={() => setQualityDetails((open) => !open)} />
        </div>

        <div className="mt-1 flex items-baseline gap-2">
          <strong className="text-[28px] font-medium leading-none tabular-nums text-[var(--bb-text-1)]">{viral?.value ?? "—"}{viral?.value != null && "%"}</strong>
          <span className="text-[11px] font-medium text-[var(--bb-success)]">{aiReview ? "potential" : "AI review required"}</span>
        </div>

        <div className="mt-4 flex h-3 gap-1 overflow-hidden rounded-full bg-[var(--bb-bg-4)]" aria-label="Hook, story flow, and clarity mix">
          {qualitySignals.map((score, index) => (
            <span
              key={score.id}
              className="h-full rounded-full transition-[width] duration-300 motion-reduce:transition-none"
              style={{
                width: `${qualityWidths[index]}%`,
                backgroundColor: index === 0 ? "var(--bb-accent)" : index === 1 ? "var(--bb-warning)" : "var(--bb-success)",
              }}
            />
          ))}
        </div>

        <div className="mt-3 grid grid-cols-3 gap-2">
          {["Hook", "Story", "Clarity"].map((label, index) => {
            const score = qualitySignals[index];
            return (
            <div key={label} className="flex min-w-0 items-center gap-1.5 text-[9.5px]">
              <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: index === 0 ? "var(--bb-accent)" : index === 1 ? "var(--bb-warning)" : "var(--bb-success)" }} />
              <span className="truncate text-[var(--bb-text-3)]">{label}</span>
              <span className="ml-auto tabular-nums text-[var(--bb-text-2)]">{score?.value ?? "—"}</span>
            </div>
          )})}
        </div>

        {qualityDetails && (
          <div className="mt-3 border-t border-[var(--bb-border)] pt-2">
            <div className="divide-y divide-[var(--bb-border)]">
              {scores.map((score) => <MetricRow key={score.id} score={score} />)}
            </div>

            <div className="mt-3 rounded-[var(--bb-radius-control)] bg-[var(--bb-bg-3)] p-2.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[10.5px] font-medium text-[var(--bb-text-2)]">Verified outcomes</span>
                <span className="text-[10px] tabular-nums text-[var(--bb-text-4)]">{calibration?.linkedResults ?? 0}/{calibration?.minimumResults ?? 10}</span>
              </div>
              <div className="mt-2 h-1 overflow-hidden rounded-full bg-[var(--bb-bg-4)]">
                <span className="block h-full rounded-full bg-[var(--bb-accent)]" style={{ width: `${Math.min(100, ((calibration?.linkedResults ?? 0) / (calibration?.minimumResults ?? 10)) * 100)}%` }} />
              </div>
              <p className="mt-2 text-[9.5px] leading-relaxed text-[var(--bb-text-3)]">{calibration?.summary || "Only verified published outcomes improve calibration."}</p>
              {manualPosts.length > 0 && (
                <select aria-label="Link a verified published post" className="mt-2 h-8 w-full rounded-[var(--bb-radius-control)] border border-[var(--bb-border)] bg-[var(--bb-bg-2)] px-2 text-[10.5px] text-[var(--bb-text-1)] outline-none focus:border-[var(--bb-focus)]" defaultValue="" onChange={(event) => { if (event.target.value) void linkVerifiedPost(event.target.value); event.currentTarget.value = ""; }}>
                  <option value="">Link verified result…</option>
                  {manualPosts.filter((post) => !verifiedOutcomes.some((outcome) => outcome.postId === post.id)).map((post) => <option key={post.id} value={post.id}>{post.agentic_channels.platform}: {post.title}</option>)}
                </select>
              )}
            </div>

            {aiReview?.recommendations.length ? (
              <div className="mt-3 space-y-1">
                {aiReview.recommendations.slice(0, 3).map((item, index) => (
                  <button key={item.id} type="button" onClick={() => item.paragraph && onJumpToParagraph(item.paragraph)} className="flex w-full gap-2 rounded-[var(--bb-radius-control)] p-2 text-left hover:bg-[var(--bb-sidebar-hover)]">
                    <span className="grid h-4 w-4 shrink-0 place-items-center rounded-full bg-[var(--bb-bg-4)] text-[8px] font-semibold text-[var(--bb-accent)]">{index + 1}</span>
                    <span className="min-w-0"><span className="block text-[10.5px] font-medium text-[var(--bb-text-1)]">{item.title}</span><span className="mt-0.5 block text-[9.5px] leading-relaxed text-[var(--bb-text-3)]">{item.detail}</span></span>
                  </button>
                ))}
              </div>
            ) : null}

            <p className="mt-3 text-[9.5px] leading-relaxed text-[var(--bb-text-3)]">AI runs only when you request it. Draft text stays local otherwise.</p>
          </div>
        )}
      </section>
    </div>
  );
}
