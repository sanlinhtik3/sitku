// ═══ Preflight Context Gatherer — Proactive context loading ═══
// Runs in parallel with Observer to pre-fetch relevant data before LLM call.
// Reduces round-trips by 1-2 steps for tool-heavy queries.

import type { EdgeRouteResult } from "./edge-intent-router.ts";

export interface PreflightData {
  /** Pre-fetched balance data for finance queries (REAL aggregates) */
  balanceSnapshot?: {
    accounts_total: number;
    currency: string;
    recent_income: number;
    recent_expense: number;
    recent_count: number;
  };
  /** Pre-fetched KB entries for knowledge queries */
  kbEntries?: Array<{ title: string; content: string; category: string }>;
  /** Pre-fetched recent tasks for task queries */
  recentTasks?: Array<{ title: string; status: string; priority: string }>;
  /** Source of prefetch for telemetry */
  source: string;
  /** Time taken for prefetch */
  duration_ms: number;
}

// ═══ KEYWORD PATTERNS for prefetch decisions ═══
const FINANCE_KEYWORDS = /ငွေ|balance|ဘယ်လောက်|expense|income|ကျသင့်|လက်ကျန်|money|ဈေး|cost|budget|subscription|ရငွေ|သုံးငွေ|profit|loss|revenue/i;
const TASK_KEYWORDS = /task|အလုပ်|todo|workspace|assign|complete|leaderboard|point|ပွိုင့်|ရမှတ်|priority/i;
const KB_KEYWORDS = /knowledge|သိ|learn|ဘာလဲ|explain|ရှင်းပြ|how\s+to|tutorial|guide|doc|manual/i;

// Burmese script range (U+1000–U+109F)
const BURMESE_RE = /[\u1000-\u109F]/;

/**
 * Determine what data to prefetch based on edge classification + message content.
 */
export function getPrefetchHints(
  edge: EdgeRouteResult,
  message: string,
): { finance: boolean; tasks: boolean; kb: boolean } {
  if (edge.tier === 'greeting' || (edge.tier === 'simple' && !edge.needsTools)) {
    return { finance: false, tasks: false, kb: false };
  }
  return {
    finance: FINANCE_KEYWORDS.test(message),
    tasks: TASK_KEYWORDS.test(message),
    kb: KB_KEYWORDS.test(message),
  };
}

/**
 * Build Burmese-safe ILIKE patterns. For Burmese text (no spaces),
 * we generate sliding char-window patterns of length 4–6.
 * For English/spaced text, fall back to first significant words.
 */
function buildKBSearchPatterns(message: string): string[] {
  const patterns: string[] = [];
  const trimmed = message.trim();

  if (BURMESE_RE.test(trimmed)) {
    // Extract Burmese contiguous runs ≥4 chars, take up to 3 windows
    const runs = trimmed.match(/[\u1000-\u109F]{4,}/g) || [];
    for (const run of runs.slice(0, 3)) {
      patterns.push(`%${run.slice(0, 8)}%`);
    }
  }

  // English/mixed words (length ≥3)
  const words = trimmed.split(/\s+/).filter(w => w.length >= 3 && /[a-z0-9]/i.test(w));
  for (const w of words.slice(0, 3)) {
    patterns.push(`%${w.slice(0, 16)}%`);
  }

  return patterns.slice(0, 4);
}

/**
 * Execute preflight data gathering based on hints. Parallel.
 */
export async function gatherPreflightContext(
  supabase: any,
  userId: string,
  hints: { finance: boolean; tasks: boolean; kb: boolean },
  message: string,
): Promise<PreflightData> {
  const t0 = Date.now();
  const promises: Promise<void>[] = [];
  const data: PreflightData = { source: 'preflight', duration_ms: 0 };

  if (hints.finance) {
    // Parallel: recent transactions + accounts aggregate
    let recentIncome = 0, recentExpense = 0, recentCount = 0;
    let accountsTotal = 0, primaryCurrency = 'MMK';

    promises.push(
      supabase
        .from("user_transactions")
        .select("amount, type")
        .eq("user_id", userId)
        .order("transaction_date", { ascending: false })
        .limit(5)
        .then(({ data: entries }: any) => {
          if (entries?.length) {
            recentCount = entries.length;
            for (const e of entries) {
              const amt = Number(e.amount) || 0;
              if (e.type === 'income') recentIncome += amt;
              else if (e.type === 'expense') recentExpense += amt;
            }
          }
        })
        .catch(() => {})
    );

    promises.push(
      supabase
        .from("financial_accounts")
        .select("current_balance, currency, is_default")
        .eq("user_id", userId)
        .eq("is_active", true)
        .then(({ data: accts }: any) => {
          if (accts?.length) {
            for (const a of accts) {
              accountsTotal += Number(a.current_balance) || 0;
              if (a.is_default && a.currency) primaryCurrency = a.currency;
            }
          }
        })
        .catch(() => {})
    );

    // Wait for both then assemble
    promises.push(
      Promise.resolve().then(async () => {
        // Defer assembly until after the above settle
        await new Promise(r => setTimeout(r, 0));
      })
    );

    // We'll reassemble after Promise.allSettled below
    (data as any).__financeAssembler = () => {
      if (recentCount > 0 || accountsTotal !== 0) {
        data.balanceSnapshot = {
          accounts_total: accountsTotal,
          currency: primaryCurrency,
          recent_income: recentIncome,
          recent_expense: recentExpense,
          recent_count: recentCount,
        };
      }
    };
  }

  if (hints.tasks) {
    promises.push(
      supabase
        .from("workspace_tasks")
        .select("title, status, priority")
        .eq("created_by", userId)
        .in("status", ["pending", "in_progress"])
        .order("created_at", { ascending: false })
        .limit(5)
        .then(({ data: tasks }: any) => {
          if (tasks?.length) data.recentTasks = tasks;
        })
        .catch(() => {})
    );
  }

  if (hints.kb) {
    const patterns = buildKBSearchPatterns(message);
    if (patterns.length > 0) {
      // Build OR clause matching title OR content for each pattern
      const orClauses = patterns
        .flatMap(p => [`title.ilike.${p}`, `content.ilike.${p}`])
        .join(',');

      promises.push(
        supabase
          .from("ai_generated_content")
          .select("title, content, category")
          .eq("user_id", userId)
          .eq("is_template", true)
          .or(orClauses)
          .limit(3)
          .then(({ data: entries }: any) => {
            if (entries?.length) {
              data.kbEntries = entries.map((e: any) => ({
                title: e.title,
                content: (e.content || '').slice(0, 200),
                category: e.category || 'general',
              }));
            }
          })
          .catch(() => {})
      );
    }
  }

  await Promise.allSettled(promises);

  // Run finance assembler post-settle
  const assembler = (data as any).__financeAssembler;
  if (typeof assembler === 'function') {
    assembler();
    delete (data as any).__financeAssembler;
  }

  data.duration_ms = Date.now() - t0;
  return data;
}

/**
 * Format preflight data as a context block — surfaces real numbers.
 */
export function formatPreflightContext(data: PreflightData): string | null {
  const sections: string[] = [];

  if (data.balanceSnapshot) {
    const b = data.balanceSnapshot;
    sections.push(
      `[PREFLIGHT_FINANCE] accounts_total=${b.accounts_total.toLocaleString()} ${b.currency} | recent(${b.recent_count}): income=${b.recent_income.toLocaleString()} expense=${b.recent_expense.toLocaleString()}. Use manage_flowstate only if user asks for breakdown beyond these aggregates.`
    );
  }

  if (data.recentTasks?.length) {
    const taskList = data.recentTasks
      .slice(0, 3)
      .map(t => `  - "${t.title}" (${t.status}, ${t.priority})`)
      .join('\n');
    sections.push(`[PREFLIGHT_TASKS] Active tasks:\n${taskList}`);
  }

  if (data.kbEntries?.length) {
    const kbList = data.kbEntries
      .map(e => `  - ${e.title} [${e.category}]: ${e.content.slice(0, 100)}...`)
      .join('\n');
    sections.push(`[PREFLIGHT_KB] Relevant knowledge entries:\n${kbList}`);
  }

  if (sections.length === 0) return null;

  return `\n═══ PREFLIGHT CONTEXT (pre-loaded, ${data.duration_ms}ms) ═══\n${sections.join('\n')}\n═══ END PREFLIGHT ═══`;
}
