import { useEffect, useRef, useState, useCallback } from "react";
import { useAgentChat } from "@/hooks/useAgentChat";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Send, Loader2, Sparkles, Square, Plus, X } from "lucide-react";
import { AgentMarkdownContent } from "@/components/agent-chat/AgentMarkdownContent";
import { cn } from "@/lib/utils";
import type { DateRange } from "@/hooks/useConsultantData";

const CONSULTANT_DIRECTIVE =
  `[CONSULTANT_MODE]
You are AgentConsultant inside Agentic Era, an AI-powered KPI intelligence platform for creators and multi-niche operators. Your job is to turn the user's scattered business, content, finance, platform, and conversation data into clear operating intelligence.

Core mission:
- Help the user build and operate Agentic Era: a smart dashboard that gathers KPIs, tracks ROI/PnL, predicts future performance, and recommends high-leverage actions.
- Stay creator-economy focused first, but adapt your thinking to e-commerce, SaaS, consulting, trading/investment, local business, and custom niches.
- Treat BeeBot as the user's existing AI agent system. Your role is the strategic upgrade layer: analyst, CFO, growth strategist, and product architect.

Tool discipline:
- ALWAYS prefer the manage_consultant tool for posts, channels, metrics, finance, ROI, PnL, leaderboards, summaries, forecasts, and dashboard-ready insight.
- Use dashboard_summary before broad strategy when the user asks "how am I doing", "analyze", "KPI", "ROI", "PnL", "dashboard", or similar.
- Use add_daily_snapshot/list_daily_snapshots when the user talks about daily channel tracking, followers, impressions, reach, daily views, or daily measurement.
- Use weekly_analysis when the user asks for weekly performance, algorithm report, baseline comparison, best post of the week, target tracking, or a May-style weekly dashboard.
- Use post_leaderboard for best/worst content questions.
- Use finance_summary for money, spend, revenue, profit, ROI, or PnL questions.
- Use forecast for future performance, predictions, scenario planning, next 7/30/90 days, or growth trajectory.
- If the user asks to add/update/delete data, confirm only when the action is destructive or ambiguous; otherwise act with the tool and report the result.

Analysis style:
- Combine quantitative analysis with strategic interpretation. Do not just repeat numbers.
- Always look for: signal, bottleneck, leverage, risk, next action.
- Include productivity hacks when useful: batching, focus windows, posting cadence, review rituals, experiment limits, and decision checklists.
- Think like a CFO when money appears: cash in, cash out, net, margin, ROI, cost per result, reinvestment cap, and stop-loss rule.
- Prefer concise executive output: diagnosis, evidence, recommendation, next step.
- When data is thin, say so clearly and give a practical data-capture plan instead of pretending certainty.
- For forecasts, label them as directional estimates and mention the assumptions.
- For ROI/PnL, distinguish revenue, spend/cost, net, and ROI percentage.
- Treat AgentConsultant finance as USDT-only. When adding, listing, or analyzing money in this consultant surface, use USDT and do not ask the user to choose another currency.

Strategic frameworks you may use when useful:
- Pareto 80/20: identify the few posts/channels/campaigns causing most outcomes.
- SWOT: strengths, weaknesses, opportunities, threats.
- Scenario planning: best / realistic / worst case.
- Unit economics: CAC, LTV, margin, payback, ROI, revenue per view/lead/customer.
- Content strategy: hook, retention, distribution, conversion, monetization.
- Product strategy: MVP, data model, integration roadmap, automation guardrails.

Agentic Era product vision to preserve:
- Smart AI Dashboard with KPI cards, line charts, donut charts, bar/pipe charts, progress bars, trend views, goal progress, and anomaly alerts.
- Daily KPI measurement for every channel so progress can be tracked consistently and forecasts improve over time.
- Weekly performance analysis that compares the current period against the previous baseline, surfaces top posts, low-signal posts, target progress, and algorithm/CFO insights.
- Data ingestion from manual input, CSV/Excel import, screenshots/OCR, APIs such as Facebook, YouTube, TikTok, Telegram, Stripe, Shopify, and Google Analytics.
- Multi-source financial tracking for revenue, expenses, campaign costs, production costs, and profit.
- Right-side agent chat that can discuss the user's mission, targets, systems, goals, KPIs, and future strategy.
- Apple-like product quality: calm, minimal, precise, fast, whitespace-rich, dark/light parity, responsive across desktop, tablet, and mobile.

Autonomy rules:
- Advisor mode: recommend and explain.
- Semi-auto mode: prepare actions and ask before high-impact changes.
- Full-auto mode: execute allowed actions, but still protect the user from destructive, financial, credential, or external-publishing actions without explicit confirmation.

When the user asks what is missing from the plan, critique constructively. Look for missing pieces in data quality, metric definitions, campaign attribution, permissions, onboarding templates, API integration limits, forecasting confidence, privacy/security, audit logs, action approvals, and product-market focus.

Be direct, warm, and decisive. Write in the user's language when they use Burmese; otherwise concise English is fine.

Active dashboard period is injected below when available.
`;

const SUGGESTIONS = [
  "Show my last 7 days KPI dashboard and tell me the bottleneck",
  "Run my weekly performance analysis vs baseline",
  "Log today's Facebook daily snapshot",
  "Forecast my next 30 days views and revenue",
  "Give me CFO + productivity hacks from my current numbers",
];

interface Props {
  userId: string;
  range?: DateRange;
  periodLabel?: string;
  onClose?: () => void;
}

export function ConsultantThreadRail({ userId, range, periodLabel, onClose }: Props) {
  const chat = useAgentChat(userId, {
    kind: "consultant",
    defaultTitle: "Strategy Consultant",
  });

  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const ensuredRef = useRef(false);

  // Auto-create a single consultant session on mount if none exists
  useEffect(() => {
    if (ensuredRef.current) return;
    if (chat.isLoadingSessions) return;
    if (chat.sessions.length === 0 && !chat.isCreatingSession) {
      ensuredRef.current = true;
      chat.createSession("Strategy Consultant").catch(() => {});
    } else if (chat.sessions.length > 0) {
      ensuredRef.current = true;
      if (!chat.activeSessionId) chat.setActiveSessionId(chat.sessions[0].id);
    }
  }, [chat.isLoadingSessions, chat.sessions, chat.isCreatingSession, chat.activeSessionId, chat]);

  // Auto-scroll on new content
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [chat.messages.length, chat.streamingContent]);

  const handleSend = useCallback(async (raw?: string) => {
    const text = (raw ?? input).trim();
    if (!text || chat.isStreaming) return;
    if (!chat.activeSessionId) {
      const s = await chat.createSession("Strategy Consultant");
      // session change effect will pick it up; small delay
      await new Promise((r) => setTimeout(r, 50));
      void s;
    }
    setInput("");
    const periodContext = range && periodLabel
      ? `[ACTIVE_DASHBOARD_PERIOD]\nLabel: ${periodLabel}\nFrom: ${range.from}\nTo: ${range.to}\n\n`
      : "";
    await chat.sendMessage(`${CONSULTANT_DIRECTIVE}${periodContext}[USER_MESSAGE]\n${text}`);
  }, [input, chat, range, periodLabel]);

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const startNew = async () => {
    await chat.createSession("Strategy Consultant");
  };

  const isEmpty = chat.messages.length === 0 && !chat.streamingContent;

  return (
    <div className="consultant-card flex flex-col h-full min-h-0 overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-border/20 bg-card/20 flex items-center justify-between">
        <div className="flex items-center gap-2 min-w-0">
          <div className="consultant-control h-8 w-8 rounded-[var(--glass-radius-control)] flex items-center justify-center shrink-0">
            <Sparkles className="h-3.5 w-3.5 text-primary" />
          </div>
          <div className="min-w-0">
            <div className="text-xs font-semibold truncate">Strategy Consultant</div>
            <div className="text-[10px] text-muted-foreground">SWOT · Pareto · Porter · Scenarios</div>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <Button size="icon" variant="ghost" className="h-7 w-7 rounded-full" onClick={startNew} title="New thread">
            <Plus className="h-3.5 w-3.5" />
          </Button>
          {onClose && (
            <Button size="icon" variant="ghost" className="h-7 w-7 rounded-full" onClick={onClose} title="Close consultant chat">
              <X className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto p-3 space-y-3">
        {isEmpty && !chat.isLoadingMessages && (
          <div className="text-center pt-6 pb-2 space-y-3">
            <div className="text-xs text-muted-foreground">
              Ask about your posts, metrics, ROI, or marketing strategy.
            </div>
            <div className="grid gap-1.5">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => handleSend(s)}
                  className="text-left text-[11px] px-3 py-2 rounded-lg consultant-control hover:border-primary/30 hover:bg-primary/5 transition"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {chat.messages.map((m) => (
          <MessageBubble key={m.id} role={m.role} content={stripDirective(m.content)} isError={m.is_error} />
        ))}

        {chat.streamingContent && (
          <MessageBubble role="assistant" content={chat.streamingContent} streaming />
        )}

        {chat.isStreaming && !chat.streamingContent && (
          <div className="flex items-center gap-2 text-[11px] text-muted-foreground px-1">
            <Loader2 className="h-3 w-3 animate-spin" />
            {chat.thinkingStatus || "Thinking…"}
          </div>
        )}
      </div>

      {/* Composer */}
      <div className="p-2.5 border-t border-border/20 bg-card/20">
        <div className="flex items-end gap-2">
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Ask the consultant…"
            rows={1}
            className="resize-none min-h-[40px] max-h-32 consultant-control text-xs rounded-xl"
          />
          {chat.isStreaming ? (
            <Button size="icon" variant="destructive" onClick={chat.cancelStreaming} className="h-10 w-10 rounded-xl shrink-0">
              <Square className="h-3.5 w-3.5" />
            </Button>
          ) : (
            <Button
              size="icon"
              onClick={() => handleSend()}
              disabled={!input.trim()}
              className="h-10 w-10 rounded-[var(--glass-radius-control)] bg-primary hover:bg-primary/90 text-primary-foreground shrink-0"
            >
              <Send className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

function stripDirective(c: string) {
  if (!c.startsWith("[CONSULTANT_MODE]")) return c;
  const userMarker = "[USER_MESSAGE]\n";
  const userMarkerIndex = c.indexOf(userMarker);
  if (userMarkerIndex >= 0) return c.slice(userMarkerIndex + userMarker.length);
  const marker = "User request:\n";
  const markerIndex = c.indexOf(marker);
  if (markerIndex >= 0) return c.slice(markerIndex + marker.length);
  return c.replace(/^\[CONSULTANT_MODE][\s\S]*?\n\n/, "");
}

function MessageBubble({
  role, content, isError, streaming,
}: { role: string; content: string; isError?: boolean; streaming?: boolean }) {
  const isUser = role === "user";
  return (
    <div className={cn("flex", isUser ? "justify-end" : "justify-start")}>
      <div className={cn(
        "max-w-[88%] rounded-[var(--glass-radius-card)] px-3 py-2 text-xs leading-relaxed",
        isUser
          ? "bg-primary/[0.12] border border-primary/25 text-foreground rounded-br-sm"
          : "bg-card/35 border border-border/20 text-foreground/95 rounded-bl-sm",
        isError && "border-rose-500/40 bg-rose-500/10",
      )}>
        {isUser ? (
          <div className="whitespace-pre-wrap">{content}</div>
        ) : (
          <AgentMarkdownContent content={content + (streaming ? " ▍" : "")} />
        )}
      </div>
    </div>
  );
}
