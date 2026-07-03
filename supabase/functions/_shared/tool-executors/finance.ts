// ═══ BeeBot Finance Suite — Smart Financial Analysis Executors ═══
// Tools: manage_budget | manage_investment | financial_report | tax_estimate
// Returns chart-ready data structures for interactive widget rendering.

type SB = any;

// ────────────────────────────── Helpers ──────────────────────────────

function startOfDay(d: Date) { const x = new Date(d); x.setHours(0,0,0,0); return x; }
function endOfDay(d: Date)   { const x = new Date(d); x.setHours(23,59,59,999); return x; }

function resolvePeriodRange(range: string, startDate?: string, endDate?: string): { start: Date; end: Date; label: string } {
  const now = new Date();
  if (range === "custom" && startDate && endDate) {
    return { start: startOfDay(new Date(startDate)), end: endOfDay(new Date(endDate)), label: `${startDate} → ${endDate}` };
  }
  const y = now.getFullYear(); const m = now.getMonth(); const d = now.getDate();
  const day = now.getDay(); // 0-Sun..6-Sat
  switch (range) {
    case "today":      return { start: startOfDay(now), end: endOfDay(now), label: "Today" };
    case "this_week": {
      const monOffset = (day + 6) % 7; // distance from Monday
      const s = new Date(y, m, d - monOffset);
      return { start: startOfDay(s), end: endOfDay(now), label: "This Week" };
    }
    case "last_week": {
      const monOffset = (day + 6) % 7;
      const thisMon = new Date(y, m, d - monOffset);
      const lastMon = new Date(thisMon); lastMon.setDate(thisMon.getDate() - 7);
      const lastSun = new Date(thisMon); lastSun.setDate(thisMon.getDate() - 1);
      return { start: startOfDay(lastMon), end: endOfDay(lastSun), label: "Last Week" };
    }
    case "this_month":  return { start: new Date(y, m, 1), end: endOfDay(now), label: "This Month" };
    case "last_month":  return { start: new Date(y, m-1, 1), end: endOfDay(new Date(y, m, 0)), label: "Last Month" };
    case "this_quarter":{ const qs = Math.floor(m/3)*3; return { start: new Date(y, qs, 1), end: endOfDay(now), label: "This Quarter" }; }
    case "last_quarter":{ const qs = Math.floor(m/3)*3 - 3; const sy = qs<0?y-1:y; const sm=(qs+12)%12; return { start: new Date(sy, sm, 1), end: endOfDay(new Date(sy, sm+3, 0)), label: "Last Quarter" }; }
    case "this_year":   return { start: new Date(y, 0, 1), end: endOfDay(now), label: "This Year" };
    case "last_year":   return { start: new Date(y-1, 0, 1), end: endOfDay(new Date(y-1, 11, 31)), label: "Last Year" };
    case "last_30_days":default:{
      const s = new Date(now); s.setDate(s.getDate() - 30);
      return { start: startOfDay(s), end: endOfDay(now), label: "Last 30 Days" };
    }
  }
}

function previousPeriod(start: Date, end: Date): { start: Date; end: Date } {
  const span = end.getTime() - start.getTime();
  const prevEnd = new Date(start.getTime() - 1);
  const prevStart = new Date(prevEnd.getTime() - span);
  return { start: startOfDay(prevStart), end: endOfDay(prevEnd) };
}

function pct(part: number, whole: number): number {
  if (!whole) return 0;
  return Math.round((part / whole) * 1000) / 10;
}

async function resolveCategoryNames(supabase: SB, ids: string[]): Promise<Record<string,string>> {
  const map: Record<string,string> = {};
  const clean = [...new Set(ids.filter(Boolean))];
  if (!clean.length) return map;
  const { data } = await supabase.from("transaction_categories").select("id, name").in("id", clean);
  for (const c of (data || [])) map[c.id] = c.name;
  return map;
}

// ─────────────────────────── manage_budget ───────────────────────────

export async function executeManageBudget(supabase: SB, userId: string, args: any) {
  const action = args.action;
  if (!action) return { error: "action required" };

  if (action === "create") {
    if (!args.name || !args.amount) return { error: "name and amount required" };
    let categoryId: string | null = null;
    if (args.category) {
      const { data } = await supabase.from("transaction_categories")
        .select("id").eq("name", args.category).eq("type", "expense").maybeSingle();
      categoryId = data?.id || null;
    }
    const { data, error } = await supabase.from("user_budgets").insert({
      user_id: userId,
      name: args.name,
      period: args.period || "monthly",
      category_id: categoryId,
      amount: args.amount,
      currency: args.currency || "MMK",
      alert_threshold_pct: args.alert_threshold_pct || 80,
      notes: args.notes || null,
    }).select("id, name, period, amount, currency, alert_threshold_pct").single();
    if (error) return { error: `Failed to create budget: ${error.message}` };
    return { success: true, message: `Budget "${args.name}" created`, budget: data, _agent_hint: "Confirm in 1 line. Offer to call status to show usage right now." };
  }

  if (action === "list") {
    const { data } = await supabase.from("user_budgets")
      .select("id, name, period, amount, currency, category_id, alert_threshold_pct, is_active, start_date")
      .eq("user_id", userId).eq("is_active", true).order("created_at", { ascending: false });
    const catMap = await resolveCategoryNames(supabase, (data || []).map((b: any) => b.category_id));
    const enriched = (data || []).map((b: any) => ({ ...b, category_name: b.category_id ? (catMap[b.category_id] || "Unknown") : "Overall" }));
    return { success: true, budgets: enriched, count: enriched.length };
  }

  if (action === "update") {
    if (!args.budget_id) return { error: "budget_id required" };
    const updates: any = {};
    if (args.amount !== undefined) updates.amount = args.amount;
    if (args.name) updates.name = args.name;
    if (args.alert_threshold_pct) updates.alert_threshold_pct = args.alert_threshold_pct;
    if (args.is_active !== undefined) updates.is_active = args.is_active;
    if (!Object.keys(updates).length) return { error: "No updates provided" };
    const { error } = await supabase.from("user_budgets").update(updates).eq("id", args.budget_id).eq("user_id", userId);
    if (error) return { error: error.message };
    return { success: true, message: "Budget updated" };
  }

  if (action === "delete") {
    if (!args.budget_id) return { error: "budget_id required" };
    await supabase.from("user_budgets").delete().eq("id", args.budget_id).eq("user_id", userId);
    return { success: true, message: "Budget deleted" };
  }

  if (action === "status") {
    const { data: budgets } = await supabase.from("user_budgets")
      .select("id, name, period, amount, currency, category_id, alert_threshold_pct")
      .eq("user_id", userId).eq("is_active", true);
    if (!budgets || !budgets.length) return { success: true, budgets: [], message: "No active budgets" };

    const catMap = await resolveCategoryNames(supabase, budgets.map((b: any) => b.category_id));
    const results: any[] = [];
    const labels: string[] = []; const usedSeries: number[] = []; const totalSeries: number[] = [];
    for (const b of budgets) {
      const range = b.period === "weekly" ? "this_week" : b.period === "yearly" ? "this_year" : "this_month";
      const { start, end } = resolvePeriodRange(range);
      let q = supabase.from("user_transactions")
        .select("amount, transaction_date")
        .eq("user_id", userId).eq("type", "expense").eq("currency", b.currency)
        .gte("transaction_date", start.toISOString()).lte("transaction_date", end.toISOString());
      if (b.category_id) q = q.eq("category_id", b.category_id);
      const { data: txns } = await q;
      const spent = (txns || []).reduce((s: number, t: any) => s + Number(t.amount || 0), 0);
      const usedPct = pct(spent, b.amount);
      // Project end-of-period
      const elapsed = Math.max(1, (Date.now() - start.getTime()) / 86400000);
      const total = Math.max(1, (end.getTime() - start.getTime()) / 86400000);
      const projected = Math.round((spent / elapsed) * total);
      const alert = usedPct >= b.alert_threshold_pct;
      const overBudget = spent > b.amount;
      const item = {
        budget_id: b.id, name: b.name, period: b.period,
        category: b.category_id ? (catMap[b.category_id] || "Unknown") : "Overall",
        amount: b.amount, currency: b.currency,
        spent, remaining: Math.max(0, b.amount - spent),
        used_pct: usedPct, projected_end_of_period: projected,
        over_budget: overBudget, alert, threshold_pct: b.alert_threshold_pct,
      };
      results.push(item);
      labels.push(b.name); usedSeries.push(spent); totalSeries.push(b.amount);
    }
    return {
      success: true, budgets: results, alerts_count: results.filter(r => r.alert).length,
      chart_data: { type: "bar", title: "Budget Usage", labels, series: [{ name: "Spent", values: usedSeries }, { name: "Budget", values: totalSeries }] },
      _agent_hint: "If any budget has over_budget=true or alert=true, proactively warn in 1 line. Offer 'chart ကြည့်မလား?' for visual.",
    };
  }

  return { error: `Unknown action: ${action}. Available: create, list, update, delete, status` };
}

// ───────────────────────── manage_investment ─────────────────────────

export async function executeManageInvestment(supabase: SB, userId: string, args: any) {
  const action = args.action;
  if (!action) return { error: "action required" };

  if (action === "add_holding") {
    if (!args.symbol || args.quantity === undefined || args.avg_cost_per_unit === undefined) {
      return { error: "symbol, quantity, avg_cost_per_unit required" };
    }
    const { data, error } = await supabase.from("user_investments").insert({
      user_id: userId,
      symbol: args.symbol.toUpperCase(),
      asset_type: args.asset_type || "other",
      quantity: args.quantity,
      avg_cost_per_unit: args.avg_cost_per_unit,
      current_price: args.current_price ?? null,
      currency: args.currency || "USD",
      account_id: args.account_id || null,
      notes: args.notes || null,
      last_priced_at: args.current_price ? new Date().toISOString() : null,
    }).select("id, symbol, asset_type, quantity, avg_cost_per_unit, current_price, currency").single();
    if (error) return { error: `Failed to add holding: ${error.message}` };
    return { success: true, message: `Added ${args.quantity} ${data.symbol}`, holding: data };
  }

  if (action === "update_price") {
    if (!args.symbol && !args.investment_id) return { error: "symbol or investment_id required" };
    if (args.current_price === undefined) return { error: "current_price required" };
    let q = supabase.from("user_investments").update({
      current_price: args.current_price, last_priced_at: new Date().toISOString(),
    }).eq("user_id", userId);
    if (args.investment_id) q = q.eq("id", args.investment_id);
    else q = q.eq("symbol", args.symbol.toUpperCase());
    const { error, count } = await q.select("id", { count: "exact" });
    if (error) return { error: error.message };
    return { success: true, message: `Updated price for ${args.symbol || args.investment_id}`, updated_count: count || 0 };
  }

  if (action === "list") {
    const { data } = await supabase.from("user_investments")
      .select("id, symbol, asset_type, quantity, avg_cost_per_unit, current_price, currency, last_priced_at, notes")
      .eq("user_id", userId).order("created_at", { ascending: false });
    return { success: true, holdings: data || [], count: (data || []).length };
  }

  if (action === "remove") {
    if (!args.investment_id) return { error: "investment_id required" };
    await supabase.from("user_investments").delete().eq("id", args.investment_id).eq("user_id", userId);
    return { success: true, message: "Holding removed" };
  }

  if (action === "portfolio_summary") {
    const { data } = await supabase.from("user_investments")
      .select("id, symbol, asset_type, quantity, avg_cost_per_unit, current_price, currency, last_priced_at")
      .eq("user_id", userId);
    const holdings = data || [];
    if (!holdings.length) return { success: true, holdings: [], message: "No investments tracked yet" };

    const byCurrency: Record<string, { invested: number; current: number; pnl: number; pnl_pct: number; positions: any[] }> = {};
    const allocByType: Record<string, Record<string, number>> = {}; // currency → type → value
    const stale: string[] = [];

    for (const h of holdings) {
      const cur = h.currency || "USD";
      const invested = Number(h.quantity) * Number(h.avg_cost_per_unit);
      const price = h.current_price !== null ? Number(h.current_price) : Number(h.avg_cost_per_unit);
      const value = Number(h.quantity) * price;
      const pnl = value - invested;
      const pnlPct = invested > 0 ? (pnl / invested) * 100 : 0;
      const isStale = !h.last_priced_at || (Date.now() - new Date(h.last_priced_at).getTime() > 7 * 86400000);
      if (h.current_price === null || isStale) stale.push(h.symbol);

      byCurrency[cur] = byCurrency[cur] || { invested: 0, current: 0, pnl: 0, pnl_pct: 0, positions: [] };
      byCurrency[cur].invested += invested;
      byCurrency[cur].current  += value;
      byCurrency[cur].positions.push({
        id: h.id, symbol: h.symbol, asset_type: h.asset_type, quantity: h.quantity,
        avg_cost: h.avg_cost_per_unit, current_price: h.current_price,
        invested, value, pnl, pnl_pct: Math.round(pnlPct * 100) / 100,
        price_stale: isStale,
      });
      allocByType[cur] = allocByType[cur] || {};
      allocByType[cur][h.asset_type] = (allocByType[cur][h.asset_type] || 0) + value;
    }
    for (const c of Object.keys(byCurrency)) {
      const b = byCurrency[c];
      b.pnl = b.current - b.invested;
      b.pnl_pct = b.invested > 0 ? Math.round((b.pnl / b.invested) * 10000) / 100 : 0;
      b.positions.sort((a: any, z: any) => z.pnl - a.pnl);
    }

    // Chart for primary currency (largest invested)
    const primaryCur = Object.keys(byCurrency).sort((a, b) => byCurrency[b].invested - byCurrency[a].invested)[0];
    const allocLabels = primaryCur ? Object.keys(allocByType[primaryCur]) : [];
    const allocValues = primaryCur ? allocLabels.map(t => Math.round(allocByType[primaryCur][t])) : [];

    const winners = Object.values(byCurrency).flatMap(b => b.positions).sort((a, z) => z.pnl_pct - a.pnl_pct).slice(0, 3);
    const losers  = Object.values(byCurrency).flatMap(b => b.positions).sort((a, z) => a.pnl_pct - z.pnl_pct).slice(0, 3);

    return {
      success: true,
      by_currency: byCurrency,
      total_holdings: holdings.length,
      top_winners: winners,
      top_losers: losers,
      stale_prices: stale,
      chart_data: primaryCur ? { type: "pie", title: `Allocation (${primaryCur})`, labels: allocLabels, series: [{ name: "Value", values: allocValues }] } : null,
      _agent_hint: "Always show P&L in BOTH absolute and %. If stale_prices is non-empty, mention prices may be outdated and offer to refresh via web search.",
    };
  }

  return { error: `Unknown action: ${action}. Available: add_holding, update_price, list, remove, portfolio_summary` };
}

// ───────────────────────── financial_report ─────────────────────────

async function fetchTransactionsInRange(supabase: SB, userId: string, start: Date, end: Date): Promise<any[]> {
  const { data } = await supabase.from("user_transactions")
    .select("id, type, amount, currency, description, category_id, transaction_date, account_id")
    .eq("user_id", userId)
    .gte("transaction_date", start.toISOString())
    .lte("transaction_date", end.toISOString())
    .order("transaction_date", { ascending: false })
    .limit(2000);
  return (data as any[]) || [];
}

function aggregateByCategory(txns: any[], catMap: Record<string,string>) {
  const map: Record<string, number> = {};
  for (const t of txns) {
    if (t.type !== "expense") continue;
    const name = t.category_id ? (catMap[t.category_id] || "Uncategorized") : "Uncategorized";
    map[name] = (map[name] || 0) + Number(t.amount || 0);
  }
  return Object.entries(map).map(([name, amount]) => ({ name, amount: Math.round(amount) })).sort((a, b) => b.amount - a.amount);
}

function dailySeries(txns: any[], start: Date, end: Date) {
  const days: string[] = []; const incomeArr: number[] = []; const expenseArr: number[] = [];
  const idx: Record<string, { i: number; e: number }> = {};
  const cur = new Date(start);
  while (cur <= end) {
    const k = cur.toISOString().slice(0, 10);
    days.push(k); idx[k] = { i: 0, e: 0 };
    cur.setDate(cur.getDate() + 1);
  }
  for (const t of txns) {
    const k = String(t.transaction_date).slice(0, 10);
    if (!idx[k]) continue;
    if (t.type === "income") idx[k].i += Number(t.amount || 0);
    else if (t.type === "expense") idx[k].e += Number(t.amount || 0);
  }
  for (const d of days) { incomeArr.push(Math.round(idx[d].i)); expenseArr.push(Math.round(idx[d].e)); }
  return { labels: days, income: incomeArr, expense: expenseArr };
}

export async function executeFinancialReport(supabase: SB, userId: string, args: any) {
  const action = args.action || "period";

  if (action === "period") {
    const { start, end, label } = resolvePeriodRange(args.range || "this_month", args.start_date, args.end_date);
    const txns = await fetchTransactionsInRange(supabase, userId, start, end);
    const catMap = await resolveCategoryNames(supabase, txns.map(t => t.category_id));

    // Group by currency
    const byCurrency: Record<string, any> = {};
    for (const t of txns) {
      const c = t.currency || "MMK";
      byCurrency[c] = byCurrency[c] || { income: 0, expense: 0, transaction_count: 0 };
      if (t.type === "income") byCurrency[c].income += Number(t.amount || 0);
      else if (t.type === "expense") byCurrency[c].expense += Number(t.amount || 0);
      byCurrency[c].transaction_count++;
    }
    for (const c of Object.keys(byCurrency)) {
      const b = byCurrency[c];
      b.net = b.income - b.expense;
      b.savings_rate_pct = b.income > 0 ? Math.round((b.net / b.income) * 1000) / 10 : 0;
    }

    const byCategory = aggregateByCategory(txns, catMap);
    const top5Expenses = txns.filter(t => t.type === "expense")
      .sort((a, b) => Number(b.amount) - Number(a.amount)).slice(0, 5)
      .map(t => ({ amount: t.amount, currency: t.currency, description: t.description, date: t.transaction_date, category: catMap[t.category_id] || "Uncategorized" }));

    // Previous period delta
    const prev = previousPeriod(start, end);
    const prevTxns = await fetchTransactionsInRange(supabase, userId, prev.start, prev.end);
    const prevByCur: Record<string, { income: number; expense: number }> = {};
    for (const t of prevTxns) {
      const c = t.currency || "MMK";
      prevByCur[c] = prevByCur[c] || { income: 0, expense: 0 };
      if (t.type === "income") prevByCur[c].income += Number(t.amount || 0);
      else if (t.type === "expense") prevByCur[c].expense += Number(t.amount || 0);
    }
    const vsPrevious: Record<string, any> = {};
    for (const c of Object.keys(byCurrency)) {
      const p = prevByCur[c] || { income: 0, expense: 0 };
      vsPrevious[c] = {
        income_delta_pct: pct(byCurrency[c].income - p.income, Math.max(p.income, 1)),
        expense_delta_pct: pct(byCurrency[c].expense - p.expense, Math.max(p.expense, 1)),
      };
    }

    const series = dailySeries(txns, start, end);

    return {
      success: true, range_label: label,
      start: start.toISOString(), end: end.toISOString(),
      by_currency: byCurrency,
      by_category: byCategory,
      top_5_expenses: top5Expenses,
      vs_previous_period: vsPrevious,
      transaction_count: txns.length,
      chart_data: {
        type: "line", title: `Cashflow — ${label}`,
        labels: series.labels,
        series: [{ name: "Income", values: series.income }, { name: "Expense", values: series.expense }],
      },
      _agent_hint: "Reply in 1-2 lines: total spent + biggest category. Then offer 'chart ကြည့်မလား?' for visualization.",
    };
  }

  if (action === "category_breakdown") {
    const { start, end, label } = resolvePeriodRange(args.range || "this_month", args.start_date, args.end_date);
    const txns = await fetchTransactionsInRange(supabase, userId, start, end);
    const catMap = await resolveCategoryNames(supabase, txns.map(t => t.category_id));
    let filtered = txns.filter(t => t.type === "expense");
    if (args.category) {
      filtered = filtered.filter(t => (catMap[t.category_id] || "").toLowerCase() === String(args.category).toLowerCase());
    }
    const totalsByCat = aggregateByCategory(filtered, catMap);
    return {
      success: true, range_label: label,
      category_filter: args.category || null,
      totals_by_category: totalsByCat,
      transaction_count: filtered.length,
      transactions_sample: filtered.slice(0, 25).map(t => ({
        amount: t.amount, currency: t.currency, date: t.transaction_date,
        description: t.description, category: catMap[t.category_id] || "Uncategorized",
      })),
      chart_data: { type: "pie", title: `Spending by Category — ${label}`, labels: totalsByCat.map(c => c.name), series: [{ name: "Amount", values: totalsByCat.map(c => c.amount) }] },
    };
  }

  if (action === "cashflow_forecast") {
    const monthsAhead = Math.max(1, Math.min(12, Number(args.months_ahead || 3)));
    const now = new Date();
    const ninety = new Date(now); ninety.setDate(ninety.getDate() - 90);
    const txns = await fetchTransactionsInRange(supabase, userId, ninety, now);
    const byCur: Record<string, { income: number; expense: number }> = {};
    for (const t of txns) {
      const c = t.currency || "MMK";
      byCur[c] = byCur[c] || { income: 0, expense: 0 };
      if (t.type === "income") byCur[c].income += Number(t.amount || 0);
      else if (t.type === "expense") byCur[c].expense += Number(t.amount || 0);
    }
    // Subscriptions monthly cost
    const { data: subs } = await supabase.from("user_subscriptions").select("amount, currency, billing_cycle, is_active").eq("user_id", userId).eq("is_active", true);
    const subMonthly: Record<string, number> = {};
    for (const s of (subs || [])) {
      const c = s.currency || "MMK";
      const amt = Number(s.amount || 0);
      const monthly = s.billing_cycle === "yearly" ? amt / 12 : s.billing_cycle === "weekly" ? amt * 4.33 : amt;
      subMonthly[c] = (subMonthly[c] || 0) + monthly;
    }
    // Current balances
    const { data: accts } = await supabase.from("financial_accounts").select("currency, current_balance").eq("user_id", userId).eq("is_active", true);
    const balByCur: Record<string, number> = {};
    for (const a of (accts || [])) balByCur[a.currency || "MMK"] = (balByCur[a.currency || "MMK"] || 0) + Number(a.current_balance || 0);

    const forecast: Record<string, any> = {};
    const labels: string[] = []; for (let i = 1; i <= monthsAhead; i++) { const d = new Date(now); d.setMonth(d.getMonth() + i); labels.push(d.toISOString().slice(0, 7)); }
    for (const c of new Set([...Object.keys(byCur), ...Object.keys(subMonthly), ...Object.keys(balByCur)])) {
      const monthlyIncome = (byCur[c]?.income || 0) / 3;
      const monthlyExpense = ((byCur[c]?.expense || 0) / 3) + (subMonthly[c] || 0);
      const net = monthlyIncome - monthlyExpense;
      const startBal = balByCur[c] || 0;
      const proj = labels.map((_, i) => Math.round(startBal + net * (i + 1)));
      forecast[c] = {
        avg_monthly_income: Math.round(monthlyIncome),
        avg_monthly_expense: Math.round(monthlyExpense),
        net_monthly: Math.round(net),
        starting_balance: Math.round(startBal),
        projected_balances: proj,
        risk: net < 0 ? "negative_cashflow" : net < monthlyExpense * 0.1 ? "tight" : "healthy",
      };
    }
    const primary = Object.keys(forecast).sort((a, b) => Math.abs(forecast[b].starting_balance) - Math.abs(forecast[a].starting_balance))[0];
    return {
      success: true, months_ahead: monthsAhead, by_currency: forecast,
      chart_data: primary ? { type: "line", title: `Balance Forecast (${primary})`, labels, series: [{ name: "Projected Balance", values: forecast[primary].projected_balances }] } : null,
      _agent_hint: "Start with 'Based on past 90 days...' to set assumption. Flag negative_cashflow risk in 1 line if present.",
    };
  }

  if (action === "compare_periods") {
    const a = resolvePeriodRange(args.period_a || "this_month");
    const b = resolvePeriodRange(args.period_b || "last_month");
    const [txA, txB] = await Promise.all([
      fetchTransactionsInRange(supabase, userId, a.start, a.end),
      fetchTransactionsInRange(supabase, userId, b.start, b.end),
    ]);
    const sumByType = (arr: any[]) => arr.reduce((acc: any, t: any) => {
      const c = t.currency || "MMK"; acc[c] = acc[c] || { income: 0, expense: 0 };
      if (t.type === "income") acc[c].income += Number(t.amount); else if (t.type === "expense") acc[c].expense += Number(t.amount);
      return acc;
    }, {});
    const sa = sumByType(txA); const sb = sumByType(txB);
    const allCur = new Set([...Object.keys(sa), ...Object.keys(sb)]);
    const compare: Record<string, any> = {};
    for (const c of allCur) {
      const A = sa[c] || { income: 0, expense: 0 };
      const B = sb[c] || { income: 0, expense: 0 };
      compare[c] = {
        period_a: { ...A, label: a.label },
        period_b: { ...B, label: b.label },
        income_delta_pct: pct(A.income - B.income, Math.max(B.income, 1)),
        expense_delta_pct: pct(A.expense - B.expense, Math.max(B.expense, 1)),
      };
    }
    return { success: true, comparison: compare, _agent_hint: "Highlight biggest delta in 1 line." };
  }

  return { error: `Unknown action: ${action}. Available: period, category_breakdown, cashflow_forecast, compare_periods` };
}

// ───────────────────────────── tax_estimate ─────────────────────────────

// Simplified default brackets (annual, in local currency). User can override via custom_brackets.
const DEFAULT_BRACKETS: Record<string, { currency: string; brackets: { upTo: number | null; rate: number }[]; basicAllowance: number }> = {
  // Myanmar PIT 2024 (MMK). upTo=null = "and above"
  MM: {
    currency: "MMK",
    brackets: [
      { upTo: 2_000_000, rate: 0 },
      { upTo: 5_000_000, rate: 0.05 },
      { upTo: 10_000_000, rate: 0.10 },
      { upTo: 20_000_000, rate: 0.15 },
      { upTo: 30_000_000, rate: 0.20 },
      { upTo: 50_000_000, rate: 0.25 },
      { upTo: null, rate: 0.30 },
    ],
    basicAllowance: 4_800_000, // basic personal allowance approx
  },
  TH: {
    currency: "THB",
    brackets: [
      { upTo: 150_000, rate: 0 },
      { upTo: 300_000, rate: 0.05 },
      { upTo: 500_000, rate: 0.10 },
      { upTo: 750_000, rate: 0.15 },
      { upTo: 1_000_000, rate: 0.20 },
      { upTo: 2_000_000, rate: 0.25 },
      { upTo: 5_000_000, rate: 0.30 },
      { upTo: null, rate: 0.35 },
    ],
    basicAllowance: 60_000,
  },
  US: {
    currency: "USD",
    brackets: [
      { upTo: 11_600, rate: 0.10 },
      { upTo: 47_150, rate: 0.12 },
      { upTo: 100_525, rate: 0.22 },
      { upTo: 191_950, rate: 0.24 },
      { upTo: 243_725, rate: 0.32 },
      { upTo: 609_350, rate: 0.35 },
      { upTo: null, rate: 0.37 },
    ],
    basicAllowance: 14_600,
  },
};

function applyBrackets(taxable: number, brackets: { upTo: number | null; rate: number }[]) {
  let remaining = taxable; let prev = 0; let tax = 0; let marginal = 0;
  const breakdown: { range: string; rate: number; tax: number }[] = [];
  for (const b of brackets) {
    if (remaining <= 0) break;
    const cap = b.upTo === null ? Infinity : b.upTo;
    const slice = Math.min(remaining, cap - prev);
    if (slice > 0) {
      const t = slice * b.rate;
      tax += t; marginal = b.rate;
      breakdown.push({ range: `${prev.toLocaleString()} - ${b.upTo === null ? "∞" : b.upTo.toLocaleString()}`, rate: b.rate, tax: Math.round(t) });
      remaining -= slice;
    }
    if (b.upTo === null) break;
    prev = b.upTo;
  }
  return { tax: Math.round(tax), marginal_rate: marginal, breakdown };
}

export async function executeTaxEstimate(supabase: SB, userId: string, args: any) {
  const action = args.action || "estimate_current_year";

  if (action === "setup_profile") {
    const updates: any = { user_id: userId };
    if (args.country_code) updates.country_code = args.country_code.toUpperCase();
    if (args.tax_year_start_month) updates.tax_year_start_month = args.tax_year_start_month;
    if (args.filing_status) updates.filing_status = args.filing_status;
    if (args.allowances) updates.allowances = args.allowances;
    if (args.custom_brackets) updates.custom_brackets = args.custom_brackets;
    if (args.notes) updates.notes = args.notes;
    const { data, error } = await supabase.from("user_tax_profile")
      .upsert(updates, { onConflict: "user_id" })
      .select().single();
    if (error) return { error: error.message };
    return { success: true, message: "Tax profile saved", profile: data };
  }

  if (action === "get_profile") {
    const { data } = await supabase.from("user_tax_profile").select("*").eq("user_id", userId).maybeSingle();
    return { success: true, profile: data, has_profile: !!data };
  }

  if (action === "estimate_current_year") {
    const { data: profile } = await supabase.from("user_tax_profile").select("*").eq("user_id", userId).maybeSingle();
    const country = (args.country_code || profile?.country_code || "MM").toUpperCase();
    const startMonth = profile?.tax_year_start_month || (country === "MM" ? 4 : 1);
    const def = DEFAULT_BRACKETS[country];
    if (!def && !profile?.custom_brackets) {
      return { error: `No default brackets for country ${country}. Use setup_profile with custom_brackets to define your own.` };
    }
    const brackets = (profile?.custom_brackets as any) || def.brackets;
    const currency = def?.currency || args.currency || "USD";
    const basicAllowance = (profile?.allowances as any)?.basic ?? def?.basicAllowance ?? 0;
    const otherAllowances = Object.entries((profile?.allowances as any) || {}).filter(([k]) => k !== "basic").reduce((s: number, [, v]) => s + Number(v || 0), 0);
    const totalAllowances = Number(basicAllowance) + otherAllowances;

    // Determine tax-year start
    const now = new Date();
    let yearStart = new Date(now.getFullYear(), startMonth - 1, 1);
    if (yearStart > now) yearStart = new Date(now.getFullYear() - 1, startMonth - 1, 1);

    const { data: incomeTxns } = await supabase.from("user_transactions")
      .select("amount, currency").eq("user_id", userId).eq("type", "income").eq("currency", currency)
      .gte("transaction_date", yearStart.toISOString());
    const grossIncome = (incomeTxns || []).reduce((s: number, t: any) => s + Number(t.amount || 0), 0);
    const taxable = Math.max(0, grossIncome - totalAllowances);
    const { tax, marginal_rate, breakdown } = applyBrackets(taxable, brackets);
    const effectiveRate = grossIncome > 0 ? Math.round((tax / grossIncome) * 10000) / 100 : 0;

    return {
      success: true,
      country, currency, tax_year_start: yearStart.toISOString().slice(0, 10),
      gross_income: Math.round(grossIncome),
      total_allowances: Math.round(totalAllowances),
      taxable_income: Math.round(taxable),
      estimated_tax: tax,
      effective_rate_pct: effectiveRate,
      marginal_rate_pct: Math.round(marginal_rate * 10000) / 100,
      breakdown_by_bracket: breakdown,
      assumption: `Based on income recorded in ${currency} since ${yearStart.toISOString().slice(0, 10)}. Allowances applied: ${totalAllowances.toLocaleString()} ${currency}.`,
      disclaimer: "Estimate only. Consult a licensed accountant for filing.",
      chart_data: { type: "bar", title: "Tax by Bracket", labels: breakdown.map(b => b.range), series: [{ name: "Tax", values: breakdown.map(b => b.tax) }] },
      _agent_hint: "Always include 1-line assumption + accountant disclaimer. Confirm country if unsure before estimating.",
    };
  }

  return { error: `Unknown action: ${action}. Available: setup_profile, get_profile, estimate_current_year` };
}
