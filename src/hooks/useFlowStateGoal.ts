// ── Financial Goal progress ────────────────────────────────────────────────
// A single "save toward a target by a date" goal stored on the FlowState settings
// row. Progress = NET savings (income − expense) accrued in [start_date, today],
// segmented by income source. Spending pulls the saved amount (and the bar) down.
// All inputs come from the same transactions the Add dialog already writes.

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { financeStore } from "@/repositories/local/financeStore";
import { useExchangeRates } from "@/hooks/useExchangeRates";
import type { FinancialGoal } from "@/hooks/useFlowState";

const DAY_MS = 86_400_000;
const UNATTRIBUTED = "Unattributed";

// Brand-aware colors (matched by substring) + a fallback palette — same vocabulary
// as the Source Flow chart so a source looks consistent across the app.
const BRAND: Record<string, string> = {
  facebook: "#1877F2", telegram: "#229ED9", binance: "#F0B90B", youtube: "#FF0000",
  instagram: "#E1306C", tiktok: "#25F4EE", linkedin: "#0A66C2", paypal: "#0070BA",
  stripe: "#635BFF", upwork: "#14A800", fiverr: "#1DBF73", patreon: "#FF424D",
  payoneer: "#FF4800", wise: "#9FE870", google: "#4285F4", adsense: "#4285F4",
  shopee: "#EE4D2D", grab: "#00B14F", tether: "#26A17B", usdt: "#26A17B",
  bitcoin: "#F7931A", btc: "#F7931A", ethereum: "#627EEA",
};
const PALETTE = ["#22c55e", "#10b981", "#14b8a6", "#06b6d4", "#3b82f6", "#8b5cf6", "#ec4899", "#f59e0b"];
function colorFor(name: string, i: number): string {
  const n = name.toLowerCase();
  for (const k of Object.keys(BRAND)) if (n.includes(k)) return BRAND[k];
  return PALETTE[i % PALETTE.length];
}

function localDateString(d = new Date()): string {
  const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, "0"), day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
function parseDay(s: string): number {
  const [y, m, d] = s.split("-").map(Number);
  return Date.UTC(y, (m || 1) - 1, d || 1);
}
function daysBetween(from: string, to: string): number {
  return Math.round((parseDay(to) - parseDay(from)) / DAY_MS);
}
function round2(n: number) { return Math.round(n * 100) / 100; }

export interface GoalSegment {
  source: string;     // income sub-source label
  color: string;
  gross: number;      // total income from this source in the window
  netShare: number;   // this source's slice of net savings (segments sum to netSaved)
  pctOfBar: number;   // width as % of the TARGET (so the bar reads against the goal)
}

export interface GoalProgress {
  goal: FinancialGoal;
  currency: string;
  // money
  target: number;
  earned: number;     // gross income in window
  spent: number;      // gross expense in window
  saved: number;      // net (earned − spent), can be < 0
  savedClamped: number; // max(0, saved) for the bar
  remaining: number;  // max(0, target − saved)
  amountPct: number;  // savedClamped / target, 0..100
  reached: boolean;
  segments: GoalSegment[];
  // time
  totalDays: number;
  elapsedDays: number;
  remainingDays: number;
  timePct: number;    // elapsed / total, 0..100
  // pace
  perDayNeeded: number; // to finish remaining by the deadline
  onTrack: boolean;
}

export function useFlowStateGoal(userId: string | undefined, primaryCurrency: string) {
  const qc = useQueryClient();
  const { convert, isFallback, isLoading: ratesLoading } = useExchangeRates("USD");

  const query = useQuery({
    queryKey: ["flowstate-goal", userId, primaryCurrency, isFallback ? "fb" : "live"],
    enabled: !!userId && !ratesLoading,
    queryFn: async (): Promise<GoalProgress | null> => {
      if (!userId) return null;
      const settings = await financeStore.getSettings(userId);
      const goal = settings?.goal ?? null;
      if (!goal) return null;

      const cur = goal.currency || primaryCurrency;
      const toPrimary = (amt: number, c: string) => (c === cur ? amt : convert(amt, c, cur));

      const today = localDateString();
      const toDate = today < goal.start_date ? goal.start_date : today;
      const rows = await financeStore.listTransactions(userId, goal.start_date, toDate);

      let earned = 0, spent = 0;
      const bySource = new Map<string, number>();
      for (const t of rows) {
        const v = toPrimary(Number(t.amount || 0), t.currency || cur);
        if (t.type === "income") {
          earned += v;
          const label = (t.source && t.source.trim()) || UNATTRIBUTED;
          bySource.set(label, (bySource.get(label) || 0) + v);
        } else if (t.type === "expense") {
          spent += v;
        }
      }
      const saved = round2(earned - spent);
      const savedClamped = Math.max(0, saved);
      const target = Math.max(0, Number(goal.target_amount) || 0);
      const remaining = Math.max(0, round2(target - saved));
      const amountPct = target > 0 ? Math.min(100, (savedClamped / target) * 100) : 0;

      // Source segments scaled so they sum to net savings (expenses shrink each share).
      const netScale = earned > 0 ? savedClamped / earned : 0;
      const segments: GoalSegment[] = [...bySource.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([source, gross], i) => {
          const netShare = round2(gross * netScale);
          return {
            source, color: colorFor(source, i), gross: round2(gross), netShare,
            pctOfBar: target > 0 ? Math.min(100, (netShare / target) * 100) : 0,
          };
        });

      // Time + pace.
      const totalDays = Math.max(1, daysBetween(goal.start_date, goal.end_date));
      const elapsedDays = Math.min(totalDays, Math.max(0, daysBetween(goal.start_date, today)));
      const remainingDays = Math.max(0, daysBetween(today, goal.end_date));
      const timePct = Math.min(100, (elapsedDays / totalDays) * 100);
      const perDayNeeded = remainingDays > 0 ? round2(remaining / remainingDays) : remaining;
      const reached = saved >= target && target > 0;
      // On track if the savings fraction keeps up with the elapsed-time fraction.
      const onTrack = reached || timePct === 0 || amountPct >= timePct;

      return {
        goal, currency: cur,
        target, earned: round2(earned), spent: round2(spent), saved, savedClamped, remaining,
        amountPct, reached, segments,
        totalDays, elapsedDays, remainingDays, timePct, perDayNeeded, onTrack,
      };
    },
  });

  const setGoal = useMutation({
    mutationFn: async (input: { title: string; target_amount: number; end_date: string; currency: string }) => {
      if (!userId) throw new Error("No user");
      const existing = (await financeStore.getSettings(userId))?.goal ?? null;
      const goal: FinancialGoal = {
        id: existing?.id || (crypto.randomUUID?.() ?? `goal_${Date.now()}`),
        title: input.title.trim() || "My goal",
        target_amount: Math.max(0, Number(input.target_amount) || 0),
        currency: input.currency,
        start_date: existing?.start_date || localDateString(),
        end_date: input.end_date,
        created_at: existing?.created_at || new Date().toISOString(),
      };
      await financeStore.updateSettings(userId, { goal });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["flowstate-goal"] });
      qc.invalidateQueries({ queryKey: ["flowstate-settings"] });
    },
  });

  const clearGoal = useMutation({
    mutationFn: async () => {
      if (!userId) throw new Error("No user");
      await financeStore.updateSettings(userId, { goal: null });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["flowstate-goal"] });
      qc.invalidateQueries({ queryKey: ["flowstate-settings"] });
    },
  });

  return { ...query, setGoal, clearGoal };
}
