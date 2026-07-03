import { memo } from "react";
import { motion } from "motion/react";
import { Wallet, ArrowUpRight, ArrowDownRight, Loader2, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ToolRendererProps } from "./types";

interface Transaction {
  id?: string;
  amount?: number;
  type?: "income" | "expense" | "transfer";
  description?: string;
  category?: string;
  date?: string;
  account?: string;
  currency?: string;
}

interface Account {
  id?: string;
  name?: string;
  balance?: number;
  currency?: string;
  type?: string;
}

const formatCurrency = (n: number, ccy = "MMK") =>
  new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(n) + " " + ccy;

/**
 * Renders `manage_flowstate` results as a financial dashboard tile: balance,
 * account list, recent transactions, or monthly summaries depending on the
 * shape of the result returned by the tool.
 */
export const FlowstateCard = memo(function FlowstateCard({ status, result }: ToolRendererProps) {
  if (status === "running" || status === "pending") {
    return (
      <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-card/30 border border-border/20">
        <Loader2 className="h-3.5 w-3.5 text-emerald-500 animate-spin shrink-0" />
        <span className="text-xs text-muted-foreground/80">FlowState working…</span>
      </div>
    );
  }

  if (!result || typeof result !== "object") return null;
  const r = result as Record<string, unknown>;

  // 1) Balance update
  if (typeof r.new_balance === "number" || typeof r.balance === "number") {
    const bal = (r.new_balance ?? r.balance) as number;
    const ccy = (r.account_currency || r.currency || "MMK") as string;
    const delta = typeof r.amount === "number" ? (r.amount as number) : null;
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.97 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.18 }}
        className="rounded-xl bg-gradient-to-br from-emerald-500/10 via-emerald-500/[0.04] to-transparent border border-emerald-500/20 px-4 py-3"
      >
        <div className="flex items-center gap-2 text-[10px] uppercase tracking-wider text-emerald-400/80">
          <Wallet className="h-3 w-3" />
          {r.new_balance !== undefined ? "Updated balance" : "Balance"}
        </div>
        <div className="text-2xl font-semibold text-foreground tabular-nums mt-1">
          {formatCurrency(bal, ccy)}
        </div>
        {delta !== null && (
          <div className={cn(
            "text-[11px] mt-1 flex items-center gap-1 tabular-nums",
            delta >= 0 ? "text-emerald-400" : "text-red-400",
          )}>
            {delta >= 0 ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
            {formatCurrency(Math.abs(delta), ccy)}
          </div>
        )}
      </motion.div>
    );
  }

  // 2) Account list
  if (Array.isArray(r.accounts)) {
    const accounts = r.accounts as Account[];
    return (
      <div className="rounded-xl bg-card/30 border border-border/20 overflow-hidden">
        <div className="flex items-center gap-2 px-3 py-1.5 border-b border-border/10 bg-muted/10">
          <Wallet className="h-3 w-3 text-emerald-500/80" />
          <span className="text-[11px] text-muted-foreground/80">{accounts.length} accounts</span>
        </div>
        <ul className="divide-y divide-border/10">
          {accounts.map((a, idx) => (
            <li key={a.id || idx} className="flex items-center justify-between px-3 py-2">
              <div className="flex items-center gap-2 min-w-0">
                <Wallet className="h-3 w-3 text-emerald-400/60 shrink-0" />
                <div className="min-w-0">
                  <div className="text-[12px] text-foreground/90 truncate">{a.name || "Account"}</div>
                  {a.type && <div className="text-[10px] text-muted-foreground/50 capitalize">{a.type}</div>}
                </div>
              </div>
              <div className="text-[12px] tabular-nums text-foreground font-medium shrink-0 ml-2">
                {typeof a.balance === "number" ? formatCurrency(a.balance, a.currency || "MMK") : "—"}
              </div>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  // 3) Transaction list
  if (Array.isArray(r.transactions)) {
    const txs = r.transactions as Transaction[];
    return (
      <div className="rounded-xl bg-card/30 border border-border/20 overflow-hidden">
        <div className="flex items-center gap-2 px-3 py-1.5 border-b border-border/10 bg-muted/10">
          <TrendingUp className="h-3 w-3 text-emerald-500/80" />
          <span className="text-[11px] text-muted-foreground/80">{txs.length} recent transactions</span>
        </div>
        <ul className="divide-y divide-border/10">
          {txs.slice(0, 6).map((t, idx) => {
            const isIncome = t.type === "income" || (typeof t.amount === "number" && t.amount > 0 && t.type !== "expense");
            return (
              <li key={t.id || idx} className="flex items-center justify-between px-3 py-2 gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  {isIncome ? (
                    <ArrowUpRight className="h-3 w-3 text-emerald-400 shrink-0" />
                  ) : (
                    <ArrowDownRight className="h-3 w-3 text-red-400 shrink-0" />
                  )}
                  <div className="min-w-0">
                    <div className="text-[12px] text-foreground/90 truncate">{t.description || t.category || "Transaction"}</div>
                    {t.date && <div className="text-[10px] text-muted-foreground/45">{t.date}</div>}
                  </div>
                </div>
                <div className={cn(
                  "text-[12px] tabular-nums font-medium shrink-0",
                  isIncome ? "text-emerald-400" : "text-red-400",
                )}>
                  {isIncome ? "+" : "−"}
                  {typeof t.amount === "number" ? formatCurrency(Math.abs(t.amount), t.currency || "MMK") : ""}
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    );
  }

  // 4) Monthly expense summary
  if (typeof r.monthly_expense === "number" || typeof r.monthly_income === "number") {
    return (
      <div className="rounded-xl bg-card/30 border border-border/20 px-4 py-3 grid grid-cols-2 gap-4">
        {typeof r.monthly_income === "number" && (
          <div>
            <div className="text-[10px] uppercase text-emerald-400/70 tracking-wider">Income</div>
            <div className="text-base text-emerald-400 tabular-nums font-semibold mt-0.5">
              {formatCurrency(r.monthly_income as number, (r.currency as string) || "MMK")}
            </div>
          </div>
        )}
        {typeof r.monthly_expense === "number" && (
          <div>
            <div className="text-[10px] uppercase text-red-400/70 tracking-wider">Expense</div>
            <div className="text-base text-red-400 tabular-nums font-semibold mt-0.5">
              {formatCurrency(r.monthly_expense as number, (r.currency as string) || "MMK")}
            </div>
          </div>
        )}
      </div>
    );
  }

  return null;
});
