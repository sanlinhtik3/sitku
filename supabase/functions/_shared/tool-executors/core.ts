// ═══ Project Phoenix: _shared/tool-executors/core.ts ═══
// Core user-facing tools: Content, FlowState, Tasks, Navigation, Settings

import { resolveCategoryId, generateEmbedding, computeSimpleHash, sanitizeForSharing, containsPrivateData, fetchWithRetry } from "../executor-helpers.ts";
import { GEMINI_OPENAI_ENDPOINT, GEMINI_NATIVE_PREFIX } from "../api-endpoints.ts";

export async function executeAIContent(supabase: any, userId: string, args: any, authHeader?: string, options?: { isUsingPersonalKey?: boolean; userAISettings?: any; [key: string]: any }) {
  const { prompt, tone = "professional", language = "burmese", style = "blog post", category = "general", save_to_my_content = false, tags = [] } = args;
  
  if (!prompt) return { error: "Prompt is required" };

  // ═══ Personal Key Mode: Skip edge function, call Google API directly ═══
  const usePersonalKey = options?.isUsingPersonalKey && options?.userAISettings?.gemini_api_key;
  
  if (usePersonalKey) {
    console.log("[AIContent] Using personal Gemini API key - direct routing");
    const personalKey = options.userAISettings.gemini_api_key;
    const model = options.userAISettings.gemini_model || "gemini-3.5-flash";
    
    try {
      const contentMessages = [
        { role: "system", content: `You are a professional content writer. Write in ${language} language. Tone: ${tone}. Style: ${style}.` },
        { role: "user", content: `Write about: ${prompt}` }
      ];
      
      const response = await fetch(GEMINI_OPENAI_ENDPOINT, {
        method: "POST",
        headers: { "Authorization": `Bearer ${personalKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model, messages: contentMessages })
      });
      
      if (!response.ok) {
        console.warn(`[AIContent] Personal key failed (${response.status}), falling back...`);
        return await executeAIContentFallback(userId, args, `Personal key error ${response.status}`);
      }
      
      const data = await response.json();
      const content = data.choices?.[0]?.message?.content || "";
      
      if (!content) return await executeAIContentFallback(userId, args, "Empty response from personal key");
      
      const result: any = {
        success: true,
        content,
        draft_mode: !save_to_my_content,
        style, tone, language,
        api_source: "personal_key"
      };
      
      if (save_to_my_content) {
        const { data: saved, error } = await supabase.from("ai_generated_content").insert({
          user_id: userId, title: prompt.slice(0, 50), content, tone, style, language, category, tags, source_type: "agent_chat"
        }).select("id").single();
        if (!error) { result.saved = true; result.content_id = saved.id; }
      }
      
      return result;
    } catch (e) {
      console.warn("[AIContent] Personal key exception, falling back:", e);
      return await executeAIContentFallback(userId, args, String(e), personalKey);
    }
  }

  // ═══ Gateway Mode: Call ai-content-writer edge function ═══
  try {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
    const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
    
    const response = await fetch(`${SUPABASE_URL}/functions/v1/ai-content-writer`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": authHeader || `Bearer ${SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify({
        topic: prompt, tone, language, type: style, save_to_db: false
      }),
    });

    if (!response.ok) {
      if (response.status === 402) return { error: "Credits မလုံလောက်ပါ။" };
      return await executeAIContentFallback(userId, args, "Service unavailable");
    }

    const data = await response.json();
    const content = data.content || data.generatedContent;

    if (!content) return await executeAIContentFallback(userId, args, "Empty response");

    const result: any = {
      success: true, content,
      draft_mode: !save_to_my_content,
      style, tone, language
    };

    if (save_to_my_content) {
      const { data: saved, error } = await supabase.from("ai_generated_content").insert({
        user_id: userId, title: prompt.slice(0, 50), content, tone, style, language, category, tags, source_type: "agent_chat"
      }).select("id").single();
      if (!error) { result.saved = true; result.content_id = saved.id; }
    }

    return result;
  } catch (e) {
    return await executeAIContentFallback(userId, args, String(e));
  }
}

export async function executeAIContentFallback(userId: string, args: any, reason?: string, personalGeminiKey?: string) {
  const { prompt } = args;
  if (!personalGeminiKey) return { error: "Personal API key required for content generation" };
  
  const contentMessages = [{ role: "user", content: `Write about: ${prompt}` }];
  
  try {
    const response = await fetch(GEMINI_OPENAI_ENDPOINT, {
      method: "POST", headers: { "Authorization": `Bearer ${personalGeminiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: "gemini-3.5-flash", messages: contentMessages })
    });

    if (!response?.ok) return { error: "Content generation failed" };
    const data = await response.json();
    return {
      success: true,
      content: data.choices?.[0]?.message?.content || "",
      draft_mode: true,
      is_fallback: true,
      fallback_reason: reason
    };
  } catch (e) { return { error: "Content generation failed" }; }
}

export async function executeSpawnAutonomousJob(supabase: any, userId: string, args: any, authHeader?: string) {
  const { prompt } = args;
  if (!prompt) return { error: "Prompt is required" };

  try {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
    const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
    
    // Call the beebot-orchestrator edge function
    const response = await fetch(`${SUPABASE_URL}/functions/v1/beebot-orchestrator`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": authHeader || `Bearer ${SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify({
        prompt,
        userId
      }),
    });

    if (!response.ok) {
      return { error: `Failed to spawn autonomous job: ${response.statusText}` };
    }

    const data = await response.json();
    return { 
      success: true, 
      job_id: data.jobId, 
      message: "Autonomous job spawned! I will process this in the background and notify you when finished." 
    };
  } catch (e: any) {
    return { error: `Exception spawning job: ${e.message}` };
  }
}

export async function executeManageAIContent(supabase: any, userId: string, args: any) {
  const { action, limit = 5, content_id } = args;
  switch (action) {
    case "count": {
      const { count } = await supabase.from("ai_generated_content").select("*", { count: "exact", head: true }).eq("user_id", userId);
      return { success: true, count: count || 0 };
    }
    case "list": {
      const { data } = await supabase.from("ai_generated_content").select("id, title, tone, created_at").eq("user_id", userId).order("created_at", { ascending: false }).limit(limit);
      return { success: true, items: data || [] };
    }
    case "get": {
      if (!content_id) return { error: "content_id required" };
      const { data } = await supabase.from("ai_generated_content").select("*").eq("id", content_id).single();
      return { success: true, item: data };
    }
    case "delete": {
      if (!content_id) return { error: "content_id required" };
      await supabase.from("ai_generated_content").delete().eq("id", content_id).eq("user_id", userId);
      return { success: true, message: "Deleted" };
    }
  }
  return { error: "Unknown action" };
}

export async function executeFlowState(supabase: any, userId: string, args: any) {
  const { action, amount, currency = "MMK", description, category = "other" } = args;
  
  // ═══ Helper: resolve category_id → human-readable name ═══
  async function getCategoryName(categoryId: string): Promise<string> {
    if (!categoryId) return 'uncategorized';
    const { data } = await supabase.from("transaction_categories").select("name").eq("id", categoryId).maybeSingle();
    return data?.name || 'uncategorized';
  }

  // ═══ GET_BALANCE — with total aggregation ═══
  if (action === "get_balance") {
    const { data } = await supabase.from("financial_accounts").select("id, account_name, current_balance, currency, is_default").eq("user_id", userId).eq("is_active", true);
    const accounts = data || [];
    // Aggregate total per currency
    const totals: Record<string, number> = {};
    for (const acc of accounts) {
      const cur = acc.currency || 'MMK';
      totals[cur] = (totals[cur] || 0) + (acc.current_balance || 0);
    }
    return { success: true, accounts, total_balance: totals, account_count: accounts.length };
  }

  // ═══ ADD_INCOME / ADD_EXPENSE ═══
  if (action === "add_income" || action === "add_expense") {
    if (!amount) return { error: "Amount required" };
    
    // Get default account or specified account
    const accountId = args.account_id;
    let account: any;
    if (accountId) {
      const { data } = await supabase.from("financial_accounts").select("id, current_balance").eq("id", accountId).eq("user_id", userId).maybeSingle();
      account = data;
    }
    if (!account) {
      const { data } = await supabase.from("financial_accounts").select("id, current_balance").eq("user_id", userId).eq("is_default", true).maybeSingle();
      account = data;
    }
    if (!account) {
      // Auto-create default account
      const { data: newAcc } = await supabase.from("financial_accounts").insert({ user_id: userId, account_name: "Cash", is_default: true, current_balance: 0 }).select().single();
      account = newAcc;
    }

    const type = action === "add_income" ? "income" : "expense";
    const categoryId = await resolveCategoryId(supabase, category, type);
    
    const { data: txn } = await supabase.from("user_transactions").insert({
      user_id: userId, account_id: account.id, type, amount, currency, description, category_id: categoryId, transaction_date: new Date().toISOString()
    }).select("id").single();

    const newBalance = account.current_balance + (type === "income" ? amount : -amount);
    await supabase.from("financial_accounts").update({ current_balance: newBalance }).eq("id", account.id);

    return { success: true, message: "Transaction recorded", transaction_id: txn?.id, new_balance: newBalance, currency };
  }
  
  // ═══ GET_INSIGHTS — with category name resolution ═══
  if (action === "get_insights") {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const { data } = await supabase.from("user_transactions")
      .select("type, amount, category_id, description, transaction_date")
      .eq("user_id", userId)
      .gte("transaction_date", thirtyDaysAgo)
      .order("transaction_date", { ascending: false })
      .limit(200);
    
    const income = data?.filter((t:any) => t.type === "income").reduce((s:number, t:any) => s + t.amount, 0) || 0;
    const expense = data?.filter((t:any) => t.type === "expense").reduce((s:number, t:any) => s + t.amount, 0) || 0;
    
    // ═══ ANOMALY DETECTION with resolved category names ═══
    const anomalies: string[] = [];
    if (data && data.length > 5) {
      const expenses = data.filter((t:any) => t.type === "expense");
      const catGroups: Record<string, { amounts: number[]; catId: string }> = {};
      for (const tx of expenses) {
        const cat = tx.category_id || 'uncategorized';
        if (!catGroups[cat]) catGroups[cat] = { amounts: [], catId: cat };
        catGroups[cat].amounts.push(tx.amount);
      }
      // Resolve category names in parallel
      const catIds = Object.keys(catGroups).filter(c => c !== 'uncategorized');
      const catNameMap: Record<string, string> = { uncategorized: 'Uncategorized' };
      if (catIds.length > 0) {
        const { data: cats } = await supabase.from("transaction_categories").select("id, name").in("id", catIds);
        for (const c of (cats || [])) catNameMap[c.id] = c.name;
      }
      
      for (const [catId, { amounts }] of Object.entries(catGroups)) {
        if (amounts.length < 2) continue;
        const avg = amounts.reduce((a, b) => a + b, 0) / amounts.length;
        const latest = amounts[0];
        if (latest > avg * 2 && latest > 10) {
          const catName = catNameMap[catId] || catId;
          anomalies.push(`${catName}: latest expense (${latest}) is ${Math.round(latest/avg)}x the average (${Math.round(avg)})`);
        }
      }
    }
    
    return { 
      success: true, income, expense, net: income - expense,
      transaction_count: data?.length || 0,
      anomalies: anomalies.length > 0 ? anomalies : undefined,
      has_anomalies: anomalies.length > 0,
    };
  }

  // ═══ LIST_RECENT — recent transactions with category names ═══
  if (action === "list_recent") {
    const limit = args.limit || 20;
    const dateFrom = args.date_from;
    let query = supabase.from("user_transactions")
      .select("id, type, amount, currency, description, category_id, transaction_date, account_id")
      .eq("user_id", userId)
      .order("transaction_date", { ascending: false })
      .limit(limit);
    if (dateFrom) query = query.gte("transaction_date", dateFrom);
    
    const { data: txns } = await query;
    if (!txns || txns.length === 0) return { success: true, transactions: [], message: "No recent transactions found" };
    
    // Resolve category names
    const catIds = [...new Set(txns.map((t:any) => t.category_id).filter(Boolean))];
    const catNameMap: Record<string, string> = {};
    if (catIds.length > 0) {
      const { data: cats } = await supabase.from("transaction_categories").select("id, name").in("id", catIds);
      for (const c of (cats || [])) catNameMap[c.id] = c.name;
    }
    
    const transactions = txns.map((t:any) => ({
      ...t,
      category_name: catNameMap[t.category_id] || 'Uncategorized',
    }));
    
    return { success: true, transactions, count: transactions.length };
  }

  // ═══ LIST_SUBSCRIPTIONS ═══
  if (action === "list_subscriptions") {
    const { data } = await supabase.from("user_subscriptions")
      .select("id, name, amount, currency, billing_cycle, next_billing_date, is_active, icon, color")
      .eq("user_id", userId)
      .order("next_billing_date", { ascending: true });
    
    const subs = data || [];
    const activeSubs = subs.filter((s:any) => s.is_active);
    const totalMonthly = activeSubs.reduce((sum:number, s:any) => {
      const amt = s.amount || 0;
      if (s.billing_cycle === 'yearly') return sum + amt / 12;
      if (s.billing_cycle === 'weekly') return sum + amt * 4.33;
      return sum + amt; // monthly
    }, 0);
    
    return { success: true, subscriptions: subs, active_count: activeSubs.length, total_monthly_estimate: Math.round(totalMonthly) };
  }

  // ═══ LIST_ACCOUNTS ═══
  if (action === "list_accounts") {
    const { data } = await supabase.from("financial_accounts")
      .select("id, account_name, account_type, current_balance, currency, is_default, is_active")
      .eq("user_id", userId)
      .eq("is_active", true)
      .order("is_default", { ascending: false });
    return { success: true, accounts: data || [] };
  }

  // ═══ CREATE_ACCOUNT ═══
  if (action === "create_account") {
    const accountName = args.account_name;
    if (!accountName) return { error: "account_name required" };
    const { data, error } = await supabase.from("financial_accounts").insert({
      user_id: userId,
      account_name: accountName,
      account_type: args.account_type || 'cash',
      currency: currency,
      current_balance: args.initial_balance || 0,
      is_default: false,
      is_active: true,
    }).select("id, account_name, currency, current_balance").single();
    if (error) return { error: `Failed to create account: ${error.message}` };
    return { success: true, message: `Account "${accountName}" created`, account: data };
  }

  // ═══ SET_DEFAULT_ACCOUNT ═══
  if (action === "set_default_account") {
    const accountId = args.account_id;
    if (!accountId) return { error: "account_id required" };
    // Verify ownership
    const { data: acc } = await supabase.from("financial_accounts").select("id, account_name").eq("id", accountId).eq("user_id", userId).maybeSingle();
    if (!acc) return { error: "Account not found" };
    // Unset all defaults, then set new
    await supabase.from("financial_accounts").update({ is_default: false }).eq("user_id", userId);
    await supabase.from("financial_accounts").update({ is_default: true }).eq("id", accountId);
    return { success: true, message: `"${acc.account_name}" is now the default account` };
  }

  // ═══ UPDATE_TRANSACTION ═══
  if (action === "update_transaction") {
    const txId = args.transaction_id;
    if (!txId) return { error: "transaction_id required" };
    // Verify ownership
    const { data: existing } = await supabase.from("user_transactions").select("id, amount, type, account_id").eq("id", txId).eq("user_id", userId).maybeSingle();
    if (!existing) return { error: "Transaction not found" };
    
    const updates: any = {};
    if (args.new_amount !== undefined) updates.amount = args.new_amount;
    if (args.new_description !== undefined) updates.description = args.new_description;
    if (args.new_category) updates.category_id = await resolveCategoryId(supabase, args.new_category, existing.type);
    
    if (Object.keys(updates).length === 0) return { error: "No updates provided" };
    
    await supabase.from("user_transactions").update(updates).eq("id", txId);
    
    // Adjust account balance if amount changed
    if (args.new_amount !== undefined && args.new_amount !== existing.amount) {
      const diff = args.new_amount - existing.amount;
      const balanceAdj = existing.type === 'income' ? diff : -diff;
      const { data: acc } = await supabase.from("financial_accounts").select("current_balance").eq("id", existing.account_id).single();
      if (acc) {
        await supabase.from("financial_accounts").update({ current_balance: acc.current_balance + balanceAdj }).eq("id", existing.account_id);
      }
    }
    
    return { success: true, message: "Transaction updated" };
  }

  // ═══ DELETE_TRANSACTION ═══
  if (action === "delete_transaction") {
    const txId = args.transaction_id;
    if (!txId) return { error: "transaction_id required" };
    const { data: existing } = await supabase.from("user_transactions").select("id, amount, type, account_id").eq("id", txId).eq("user_id", userId).maybeSingle();
    if (!existing) return { error: "Transaction not found" };
    
    // Reverse balance impact
    const reversal = existing.type === 'income' ? -existing.amount : existing.amount;
    const { data: acc } = await supabase.from("financial_accounts").select("current_balance").eq("id", existing.account_id).single();
    if (acc) {
      await supabase.from("financial_accounts").update({ current_balance: acc.current_balance + reversal }).eq("id", existing.account_id);
    }
    
    await supabase.from("user_transactions").delete().eq("id", txId).eq("user_id", userId);
    return { success: true, message: "Transaction deleted", reversed_amount: existing.amount };
  }

  return { error: `Unknown action: ${action}. Available actions: get_balance, add_income, add_expense, get_insights, list_recent, list_subscriptions, list_accounts, create_account, set_default_account, update_transaction, delete_transaction` };
}

export async function executeWorkspaceTask(supabase: any, userId: string, args: any) {
  const { action, title, description, points = 10, task_id } = args;
  
  // Get workspace
  const { data: member } = await supabase.from("workspace_members").select("workspace_id").eq("user_id", userId).limit(1).maybeSingle();
  if (!member) return { error: "No workspace found" };
  const wsId = member.workspace_id;

  if (action === "create") {
    if (!title) return { error: "Title required" };
    const { data } = await supabase.from("workspace_tasks").insert({
      workspace_id: wsId, title, description, points, created_by: userId, assignee_id: userId
    }).select("id").single();
    return { success: true, task_id: data.id, message: "Task created" };
  }

  if (action === "list") {
    const { data } = await supabase.from("workspace_tasks").select("id, title, status, points").eq("workspace_id", wsId).limit(10);
    return { success: true, tasks: data || [] };
  }

  if (action === "complete") {
    if (!title && !task_id) return { error: "Title or ID required" };
    let query = supabase.from("workspace_tasks").select("id, points, assignee_id").eq("workspace_id", wsId);
    if (task_id) query = query.eq("id", task_id);
    else query = query.ilike("title", `%${title}%`);
    
    const { data: task } = await query.limit(1).maybeSingle();
    if (!task) return { error: "Task not found" };
    
    await supabase.rpc("complete_workspace_task", { p_task_id: task.id });
    
    // ═══ STREAK SYSTEM: Track consecutive daily completions ═══
    let streakInfo: any = null;
    try {
      const today = new Date().toISOString().split("T")[0];
      const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().split("T")[0];
      const assignee = task.assignee_id || userId;
      
      // Check if completed a task yesterday
      const { data: yesterdayTasks } = await supabase
        .from("workspace_tasks")
        .select("id")
        .eq("workspace_id", wsId)
        .eq("assignee_id", assignee)
        .eq("status", "completed")
        .gte("completed_at", yesterday + "T00:00:00")
        .lt("completed_at", today + "T00:00:00")
        .limit(1);
      
      const hadYesterdayCompletion = yesterdayTasks && yesterdayTasks.length > 0;
      
      // Calculate streak multiplier
      if (hadYesterdayCompletion) {
        // Count consecutive days backwards
        let streakDays = 2; // today + yesterday
        for (let d = 2; d <= 30; d++) {
          const checkDate = new Date(Date.now() - d * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
          const nextDate = new Date(Date.now() - (d - 1) * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
          const { data: dayTasks } = await supabase
            .from("workspace_tasks")
            .select("id")
            .eq("workspace_id", wsId)
            .eq("assignee_id", assignee)
            .eq("status", "completed")
            .gte("completed_at", checkDate + "T00:00:00")
            .lt("completed_at", nextDate + "T00:00:00")
            .limit(1);
          if (!dayTasks || dayTasks.length === 0) break;
          streakDays++;
        }
        
        const multiplier = streakDays >= 7 ? 2.0 : streakDays >= 3 ? 1.5 : 1.0;
        const bonusPoints = multiplier > 1.0 ? Math.round((task.points || 10) * (multiplier - 1)) : 0;
        streakInfo = { streak_days: streakDays, multiplier, bonus_points: bonusPoints };
        
        // Award bonus points if streak qualifies
        if (bonusPoints > 0) {
          console.log(`[Streak] ${streakDays}-day streak! Bonus: ${bonusPoints} points (${multiplier}x)`);
        }
      }
    } catch (e) { console.warn("[Streak] Error:", e); }
    
    return { 
      success: true, message: "Task completed",
      ...(streakInfo ? { streak: streakInfo } : {})
    };
  }

  return { error: "Unknown action" };
}

export async function executeGetUserInfo(supabase: any, userId: string, args: any) {
  const { info_type } = args;
  if (info_type === "credits") {
    const { data } = await supabase.from("user_credits").select("*").eq("user_id", userId).maybeSingle();
    return { success: true, balance: data?.balance || 0 };
  }
  if (info_type === "iu" || info_type === "intelligence_units") {
    const { data: credits } = await supabase.from("user_credits").select("balance, total_earned, total_spent, tier_key").eq("user_id", userId).maybeSingle();
    const today = new Date().toISOString().split("T")[0];
    const { data: daily } = await supabase.from("daily_usage").select("total_uses, daily_limit, beebot_uses, ai_content_uses").eq("user_id", userId).eq("usage_date", today).maybeSingle();
    
    // ═══ IU FORECAST: Only when explicitly requested ═══
    let forecast: any = null;
    if (args.include_forecast) {
      try {
        const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
        const { data: weeklyUsage } = await supabase
          .from("daily_usage")
          .select("total_uses")
          .eq("user_id", userId)
          .gte("usage_date", sevenDaysAgo)
          .order("usage_date", { ascending: false });
        
        if (weeklyUsage && weeklyUsage.length >= 2) {
          const avgDailyUse = weeklyUsage.reduce((s: number, d: any) => s + (d.total_uses || 0), 0) / weeklyUsage.length;
          const balance = credits?.balance || 0;
          const daysRemaining = avgDailyUse > 0 ? Math.round(balance / avgDailyUse) : null;
          const usageTrend = weeklyUsage.length >= 3 
            ? (weeklyUsage[0]?.total_uses > weeklyUsage[weeklyUsage.length - 1]?.total_uses ? "increasing" : "stable")
            : "insufficient_data";
          
          forecast = {
            avg_daily_usage: Math.round(avgDailyUse * 10) / 10,
            estimated_days_remaining: daysRemaining,
            usage_trend: usageTrend,
            data_points: weeklyUsage.length,
          };
        }
      } catch (e) { /* non-critical */ }
    }
    
    return {
      success: true,
      iu_balance: credits?.balance || 0,
      iu_total_earned: credits?.total_earned || 0,
      iu_total_spent: credits?.total_spent || 0,
      tier: credits?.tier_key || "free",
      today: {
        iu_consumed: daily?.total_uses || 0,
        daily_limit: daily?.daily_limit || 0,
        beebot_uses: daily?.beebot_uses || 0,
        ai_content_uses: daily?.ai_content_uses || 0,
        remaining: (daily?.daily_limit || 0) - (daily?.total_uses || 0),
      },
      ...(forecast ? { forecast } : {}),
    };
  }
  if (info_type === "profile") {
    const { data } = await supabase.from("profiles").select("*").eq("user_id", userId).single();
    return { success: true, profile: data };
  }
  return { error: "Unknown info type. Use: credits, iu, profile, statistics" };
}

export async function executeUpdateAgentSettings(supabase: any, userId: string, args: any) {
  const { new_name, new_emoji, personality_mode, timezone } = args;
  const updates: any = {};
  if (new_name) updates.bot_name = new_name;
  if (new_emoji) updates.bot_emoji = new_emoji;
  if (personality_mode) updates.personality_mode = personality_mode;
  if (timezone) updates.timezone = timezone;
  
  await supabase.from("user_agent_settings").update(updates).eq("user_id", userId);
  return { success: true, message: "Settings updated" };
}

export async function executeSearchKnowledgeBase(
  supabase: any,
  userId: string,
  args: any,
  options?: { agentSettings?: any; serviceClient?: any },
) {
  const { query, limit = 3 } = args;

  // Try vector search first (unchanged — RPC path, not MCP-routable safely)
  const embedding = await generateEmbedding(query, supabase, userId);
  if (embedding) {
    const { data } = await supabase.rpc("search_knowledge_base_semantic", {
      p_query_embedding: `[${embedding.join(",")}]`,
      p_limit: limit
    });
    if (data?.length) return { success: true, results: data, method: "semantic" };
  }

  // ═══ Phase 1.5: MCP-routed text-search fallback (feature-flag gated) ═══
  // When the user has mcp_postgres_enabled=true, route the text fallback through
  // the MCP Postgres client. Falls back to native on any error so the user is
  // never blocked. See docs/AGENTIC_AUDIT.md Phase 1.6 + plan §A4.
  if (options?.agentSettings?.mcp_postgres_enabled && options?.serviceClient) {
    try {
      const { openMcpPostgresClient } = await import("../mcp-postgres-client.ts");
      const mcpClient = await openMcpPostgresClient({
        serviceClient: options.serviceClient,
        remoteUrl: Deno.env.get("MCP_POSTGRES_URL") || null,
        authToken: Deno.env.get("MCP_POSTGRES_TOKEN") || null,
      });
      // Build a parameterless SELECT — sanitize literal via simple escaping.
      const safeQuery = String(query).replace(/'/g, "''").slice(0, 200);
      const safeLimit = Math.max(1, Math.min(20, Number(limit) || 3));
      const sql =
        `SELECT title, content, category FROM ai_generated_content ` +
        `WHERE is_global = true AND content ILIKE '%${safeQuery}%' LIMIT ${safeLimit}`;
      const mcpResult = await mcpClient.callTool("query", { sql });
      await mcpClient.close();
      if (!mcpResult.isError) {
        const text = mcpResult.content?.[0]?.text ?? "[]";
        const rows = (() => { try { return JSON.parse(text); } catch { return []; } })();
        console.log(`[mcp-postgres] tool=query rows=${rows.length} transport=${mcpClient.transport}`);
        return { success: true, results: rows, method: `text-mcp-${mcpClient.transport}` };
      }
      console.warn(`[mcp-postgres] tool=query error → ${mcpResult.content?.[0]?.text}; falling back to native`);
    } catch (e: any) {
      console.warn(`[mcp-postgres] adapter failure: ${e?.message ?? e}; falling back to native`);
    }
  }

  // Fallback to native text search (always available)
  const { data } = await supabase.from("ai_generated_content").select("title, content, category").eq("is_global", true).ilike("content", `%${query}%`).limit(limit);
  return { success: true, results: data || [], method: "text" };
}

// fetchWithRetry is now imported from executor-helpers.ts

export async function executeSearchWeb(supabase: any, userId: string, args: any) {
  const { query } = args;

  // Guard: reject missing or empty query immediately
  if (!query || typeof query !== 'string' || query.trim().length === 0) {
    return { success: false, error: "invalid_query", message: "No search query provided. Please specify a valid query.", query: "" };
  }
  
  // --- Attempt 1: Tavily ---
  const { data: key } = await supabase.from("user_api_keys").select("api_key_encrypted").eq("user_id", userId).eq("provider", "tavily").maybeSingle();
  
  if (key?.api_key_encrypted) {
    try {
      const res = await fetchWithRetry("https://api.tavily.com/search", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ api_key: key.api_key_encrypted, query, include_answer: true })
      });
      if (!res.ok) {
        const errBody = await res.text().catch(() => "Unknown error");
        console.error(`Tavily HTTP ${res.status}: ${errBody}`);
        // Fall through to Firecrawl fallback below
      } else {
        const json = await res.json();
        if (json.answer || (json.results && json.results.length > 0)) {
          return { success: true, answer: json.answer || "No summary available", results: json.results || [], query };
        }
        // Empty results — fall through to Firecrawl
      }
    } catch (e) {
      console.error("Tavily fetch error:", e);
      // Fall through to Firecrawl fallback
    }
  }

  // --- Attempt 2: Silent Fallback to Firecrawl browser_search ---
  const FIRECRAWL_API_KEY = Deno.env.get("FIRECRAWL_API_KEY");
  if (FIRECRAWL_API_KEY) {
    try {
      const res = await fetchWithRetry("https://api.firecrawl.dev/v1/search", {
        method: "POST",
        headers: { "Authorization": `Bearer ${FIRECRAWL_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({ query, limit: 5, scrapeOptions: { formats: ["markdown"] } })
      });
      if (res.ok) {
        const json = await res.json();
        const results = (json.data || []).map((r: any) => ({
          title: r.title || r.url,
          url: r.url,
          content: r.markdown?.slice(0, 500) || r.description || ""
        }));
        if (results.length > 0) {
          return { success: true, answer: results.map((r: any) => r.content).join("\n\n").slice(0, 1500), results, query, source: "firecrawl_fallback" };
        }
      }
    } catch (e) {
      console.error("Firecrawl fallback error:", e);
    }
  }

  // --- Both failed ---
  return { success: false, error: "service_unavailable", message: `Web search failed for "${query}". No search API available or all returned empty results.`, query };
}

export async function executeManageNotifications(supabase: any, userId: string, args: any) {
  const { action } = args;
  if (action === "count_unread") {
    const { count } = await supabase.from("notifications").select("*", { count: "exact", head: true }).eq("user_id", userId).eq("is_read", false);
    return { success: true, unread_count: count };
  }
  if (action === "mark_all_read") {
    await supabase.from("notifications").update({ is_read: true }).eq("user_id", userId);
    return { success: true };
  }
  return { error: "Unknown action" };
}

export async function executeGetAppNavigation(args: any) {
  const { feature } = args;
  const map: Record<string, string> = {
    flowstate: "/dashboard",
    ai_content: "/my-ai-content",
    profile: "/profile",
    credits: "/buy-credits"
  };
  return { success: true, path: map[feature] || "/dashboard" };
}

export async function executeRecallEpisodicMemory(supabase: any, userId: string, args: any, options?: any) {
  const { query, time_range } = args;
  let memories: any[] = [];
  let source = "no_memories_found";

  const groupCtx = options?.groupContext;
  if (groupCtx?.is_group) {
    const groupId = String(groupCtx.group_id || "");
    const terms = String(query || "").toLowerCase().split(/\s+/).filter((t) => t.length > 2).slice(0, 8);
    const [groupMemories, rawMessages] = await Promise.all([
      groupId
        ? supabase
            .from("user_memories")
            .select("content, category, created_at, confidence")
            .eq("user_id", userId)
            .eq("is_active", true)
            .eq("scope", "telegram_group")
            .eq("scope_key", groupId)
            .order("priority", { ascending: false })
            .order("confidence", { ascending: false })
            .limit(8)
        : Promise.resolve({ data: [] }),
      options?.sessionId
        ? supabase
            .from("agent_chat_messages")
            .select("content, role, created_at")
            .eq("user_id", userId)
            .eq("session_id", options.sessionId)
            .in("role", ["user", "assistant"])
            .not("content", "is", null)
            .order("created_at", { ascending: false })
            .limit(20)
        : Promise.resolve({ data: [] }),
    ]);

    const scopedMemories = (groupMemories.data || [])
      .filter((m: any) => !terms.length || terms.some((t) => `${m.category} ${m.content}`.toLowerCase().includes(t)))
      .map((m: any) => ({
        content_summary: `[group memory:${m.category}] ${m.content}`,
        created_at: m.created_at,
        source: "telegram_group_memory",
      }));
    const scopedMessages = (rawMessages.data || []).reverse().map((m: any) => ({
      content_summary: `${m.role}: ${(m.content || "").slice(0, 300)}`,
      created_at: m.created_at,
      source: "telegram_group_session",
    }));

    return {
      success: true,
      memories: [...scopedMemories, ...scopedMessages].slice(0, 12),
      source: "telegram_group_scoped",
      scope: "telegram_group",
      scope_key: groupId || null,
    };
  }

  // Tier 1: Vector search (primary)
  const embedding = await generateEmbedding(query, supabase, userId);
  if (embedding) {
    const { data } = await supabase.rpc("search_episodic_memory", {
      p_user_id: userId,
      p_query_embedding: `[${embedding.join(",")}]`,
      p_time_range: time_range || "all_time",
      p_limit: 5,
    });
    if (data?.length) {
      memories = data;
      source = "vector_search";
    }
  }

  // Tier 2: Fallback to session summaries if vector search returned nothing
  if (memories.length === 0) {
    const { data: summaries } = await supabase.rpc("get_recent_session_summaries", {
      p_user_id: userId,
      p_limit: 5,
    });
    if (summaries?.length) {
      memories = summaries.map((s: any) => ({
        content_summary: typeof s.summary === "string" ? s.summary : JSON.stringify(s.summary),
        created_at: s.created_at,
        session_title: s.session_key,
        source: "session_summary",
      }));
      source = "session_summaries";
    }
  }

  // Tier 3: Fallback to raw recent messages if still nothing
  if (memories.length === 0) {
    const { data: rawMessages } = await supabase
      .from("agent_chat_messages")
      .select("content, role, created_at, session_id")
      .eq("user_id", userId)
      .in("role", ["user", "assistant"])
      .not("content", "is", null)
      .order("created_at", { ascending: false })
      .limit(15);

    if (rawMessages?.length) {
      memories = rawMessages.reverse().map((m: any) => ({
        content_summary: `${m.role}: ${(m.content || "").slice(0, 300)}`,
        created_at: m.created_at,
        source: "raw_message",
      }));
      source = "raw_messages";
    }
  }

  console.log(`[RecallEpisodic] Source: ${source}, Results: ${memories.length}`);
  return { success: true, memories, source };
}

export async function executeRememberUserFact(supabase: any, userId: string, args: any) {
  const { fact_type, fact_key, fact_value } = args;
  const contextKey = `memory_${fact_type}_${fact_key}`;
  await supabase.from("agent_learning_context").upsert({
    user_id: userId, context_type: "explicit_memory", context_key: contextKey,
    context_value: { value: fact_value, type: fact_type },
    usage_count: 1, last_used_at: new Date().toISOString()
  }, { onConflict: "user_id,context_type,context_key" });
  return { success: true, message: "Remembered" };
}

export async function executeRecallUserFacts(supabase: any, userId: string, args: any, options?: any) {
  const { category } = args || {};

  if (options?.groupContext?.is_group) {
    const groupId = String(options.groupContext.group_id || "");
    if (!groupId) return { success: true, facts: [], scope: "telegram_group" };
    let q = supabase.from("user_memories")
      .select("category, content, last_accessed, created_at")
      .eq("user_id", userId)
      .eq("is_active", true)
      .eq("scope", "telegram_group")
      .eq("scope_key", groupId)
      .order("pinned", { ascending: false })
      .order("priority", { ascending: false })
      .limit(20);
    if (category && category !== "all") q = q.eq("category", category);
    const { data } = await q;
    return {
      success: true,
      scope: "telegram_group",
      scope_key: groupId,
      facts: (data || []).map((f: any) => ({
        context_key: f.category || "group_memory",
        context_value: { value: f.content },
        source: "telegram_group_memory",
        last_used_at: f.last_accessed || f.created_at,
      })),
    };
  }
  
  // Parallel fetch from both fact sources for comprehensive recall
  const [learningResult, factsResult] = await Promise.all([
    supabase.from("agent_learning_context")
      .select("context_key, context_value, context_type, usage_count, last_used_at")
      .eq("user_id", userId)
      .in("context_type", ["explicit_memory", "auto_learned", "learned_preference"])
      .eq("is_active", true)
      .order("usage_count", { ascending: false })
      .limit(20),
    // FIX: switched from empty agent_user_facts → user_memories (pinned/high-confidence)
    supabase.from("user_memories")
      .select("category, content, last_accessed, created_at")
      .eq("user_id", userId)
      .eq("is_active", true)
      .eq("scope", "personal")
      .is("scope_key", null)
      .order("pinned", { ascending: false })
      .order("priority", { ascending: false })
      .limit(15),
  ]);

  const allFacts: any[] = [];

  // User memories (direct facts surfaced from user_memories)
  if (factsResult.data?.length) {
    for (const f of factsResult.data) {
      allFacts.push({ 
        context_key: f.category || "memory", 
        context_value: { value: f.content }, 
        source: "user_memory",
        last_used_at: f.last_accessed || f.created_at,
      });
    }
  }

  // Learning context (memories, preferences, auto-learned)
  if (learningResult.data?.length) {
    for (const d of learningResult.data) {
      // Skip if already captured via user_facts
      if (allFacts.some(f => f.context_key === d.context_key)) continue;
      allFacts.push({
        context_key: d.context_key,
        context_value: d.context_value,
        source: d.context_type,
        last_used_at: d.last_used_at,
      });
    }
  }

  // Optional category filter
  const filtered = category 
    ? allFacts.filter(f => f.source === category || f.context_key.includes(category))
    : allFacts;

  console.log(`[RecallFacts] Total: ${filtered.length} facts recalled (user_facts: ${factsResult.data?.length || 0}, learning: ${learningResult.data?.length || 0})`);
  return { success: true, facts: filtered };
}

// ═══ IMAGE GENERATION: Nano Banana / Nano Banana Pro ═══
export async function executeGenerateImage(supabase: any, userId: string, args: any, options?: any) {
  const { prompt, model = "fast", aspect = "square", reference_image_url } = args;
  if (!prompt) return { error: "Prompt is required for image generation" };

  const MODEL_MAP: Record<string, string> = {
    fast: "gemini-3.1-flash-image-preview",
    quality: "gemini-3-pro-image-preview",
    legacy: "gemini-2.5-flash-image",
  };
  const baseModelId = MODEL_MAP[model] || MODEL_MAP.fast;
  const modelLabel = model === "quality" ? "Nano Banana Pro" : model === "legacy" ? "Nano Banana" : "Nano Banana 2";

  // ═══ Heartbeat: keep SSE alive during long image generation ═══
  let heartbeatInterval: ReturnType<typeof setInterval> | null = null;
  if (options?.writer && options?.encoder) {
    const statusMessages = [
      "🎨 Generating image...",
      "🖌️ Drawing pixels...",
      "✨ Adding details...",
      "🐝 Almost there...",
    ];
    let beatCount = 0;
    heartbeatInterval = setInterval(() => {
      try {
        const msg = statusMessages[beatCount % statusMessages.length];
        const pulse = `data: ${JSON.stringify({ type: "thinking", status: msg })}\n\n`;
        options.writer.enqueue(options.encoder.encode(pulse));
        beatCount++;
      } catch (_) { /* stream may be closed */ }
    }, 3000);
  }

  try {
    const usePersonalKey = options?.isUsingPersonalKey && options?.userAISettings?.gemini_api_key;
    let apiKey: string;

    if (usePersonalKey) {
      apiKey = options.userAISettings.gemini_api_key;
      console.log(`[GenerateImage] Routing via PERSONAL KEY (native API)`);
    } else {
      return { error: "Personal API key required for image generation. Please add your Gemini API key in Settings." };
    }

    // Enforce aspect ratio with explicit dimension instructions
    const aspectInstruction = aspect === "landscape"
      ? "IMPORTANT: Generate this image in LANDSCAPE orientation (16:9 wide format, approximately 1536x864 pixels). The width MUST be significantly larger than the height. "
      : aspect === "portrait"
        ? "IMPORTANT: Generate this image in PORTRAIT orientation (9:16 tall format, approximately 864x1536 pixels). The height MUST be significantly larger than the width. "
        : "IMPORTANT: Generate this image in SQUARE format (1:1 aspect ratio, approximately 1024x1024 pixels). Width and height must be equal. ";

    // Build native Gemini content parts
    const parts: any[] = [{ text: aspectInstruction + prompt }];
    if (reference_image_url) {
      console.log(`[GenerateImage] Edit mode: reference=${reference_image_url.slice(0, 80)}...`);
      // For edit mode, fetch the reference image and inline it
      try {
        const imgResp = await fetch(reference_image_url);
        if (imgResp.ok) {
          const imgBuf = await imgResp.arrayBuffer();
          const imgBase64 = btoa(String.fromCharCode(...new Uint8Array(imgBuf)));
          const imgMime = imgResp.headers.get("content-type") || "image/jpeg";
          parts.push({ inlineData: { mimeType: imgMime, data: imgBase64 } });
        }
      } catch (refErr) {
        console.warn("[GenerateImage] Could not fetch reference image:", refErr);
      }
    }

    const modelId = baseModelId;
    const nativeApiUrl = `${GEMINI_NATIVE_PREFIX}${modelId}:generateContent?key=${apiKey}`;

    console.log(`[GenerateImage] model=${modelId}, edit=${!!reference_image_url}, source=personal_native, prompt="${prompt.slice(0, 80)}..."`);

    const response = await fetch(nativeApiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts }],
        generationConfig: {
          responseModalities: ["image", "text"],
        },
      }),
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => "Unknown error");
      console.error(`[GenerateImage] Native API error ${response.status}: ${errText}`);
      if (response.status === 429) return { error: "Rate limit exceeded. Please try again in a moment." };
      return { error: `Image generation failed (${response.status})` };
    }

    const rawText = await response.text();
    let data: any;
    try {
      data = JSON.parse(rawText);
    } catch (parseErr) {
      console.error(`[GenerateImage] JSON parse failed. Length: ${rawText.length}, first 200: ${rawText.slice(0, 200)}`);
      return { error: "Image generation response was incomplete. Please try again." };
    }

    // Extract image from native response: candidates[0].content.parts[].inlineData
    const candidateParts = data.candidates?.[0]?.content?.parts || [];
    const imagePart = candidateParts.find((p: any) => p.inlineData?.mimeType?.startsWith("image/"));
    const textPart = candidateParts.find((p: any) => p.text);
    const description = textPart?.text || "";

    if (!imagePart?.inlineData) {
      console.error("[GenerateImage] No image in native response:", JSON.stringify(data).slice(0, 500));
      return { error: "No image was generated. Try a different prompt." };
    }

    const mimeType = imagePart.inlineData.mimeType; // e.g. "image/jpeg" or "image/png"
    const base64Data = imagePart.inlineData.data;
    const imageFormat = mimeType.split("/")[1] || "jpeg"; // jpeg, png, webp etc.
    const imageBytes = Uint8Array.from(atob(base64Data), (c) => c.charCodeAt(0));

    // Upload to agent-chat-images bucket
    const filePath = `${userId}/gen_${Date.now()}.${imageFormat}`;
    const { error: uploadError } = await supabase.storage
      .from("agent-chat-images")
      .upload(filePath, imageBytes, {
        contentType: `image/${imageFormat}`,
        upsert: false,
      });

    if (uploadError) {
      console.error("[GenerateImage] Upload error:", uploadError);
      return { error: "Failed to store generated image" };
    }

    // Generate signed URL (5-day expiry)
    const { data: signedData, error: signError } = await supabase.storage
      .from("agent-chat-images")
      .createSignedUrl(filePath, 5 * 24 * 60 * 60); // 5 days in seconds

    if (signError || !signedData?.signedUrl) {
      console.error("[GenerateImage] Signed URL error:", signError);
      return { error: "Failed to generate image URL" };
    }

    console.log(`[GenerateImage] Success: ${modelLabel}, stored at ${filePath}`);

    return {
      success: true,
      image_url: signedData.signedUrl,
      description: description || "Image generated successfully",
      model_used: modelLabel,
      prompt: prompt,
      aspect: aspect,
    };
  } catch (e: any) {
    console.error("[GenerateImage] Exception:", e);
    return { error: `Image generation failed: ${e.message}` };
  } finally {
    if (heartbeatInterval) clearInterval(heartbeatInterval);
  }
}

// ═══ Fix 1: check_achievements executor ═══
export async function executeCheckAchievements(supabase: any, userId: string) {
  try {
    const { data: allAchievements } = await supabase
      .from("achievements")
      .select("id, name, description, icon, requirement_type, requirement_value")
      .order("requirement_value", { ascending: true });

    const { data: userAchievements } = await supabase
      .from("user_achievements")
      .select("achievement_id, earned_at")
      .eq("user_id", userId);

    const earned = new Map((userAchievements || []).map((ua: any) => [ua.achievement_id, ua.earned_at]));
    const results = (allAchievements || []).map((a: any) => ({
      ...a,
      earned: earned.has(a.id),
      earned_at: earned.get(a.id) || null,
    }));

    const earnedCount = results.filter((r: any) => r.earned).length;
    return {
      success: true,
      total: results.length,
      earned_count: earnedCount,
      locked_count: results.length - earnedCount,
      achievements: results,
    };
  } catch (e: any) {
    return { error: `Failed to check achievements: ${e.message}` };
  }
}

// ═══ MEMORY VAULT MANAGEMENT (manage_memory) ═══
// SOURCE OF TRUTH: user_memories.category CHECK constraint (9 categories).
// Keep in sync with: tool-definitions.ts manage_memory enum, memory-curator ALL_TRAINING_CATEGORIES,
// prompt-builder.ts autonomous-capture protocol category list.
const VALID_MEMORY_CATEGORIES = [
  "preference", "fact", "work", "relationship", "opinion",
  "life_event", "viz_preferences", "goals", "custom",
];

function resolveMemoryScope(args: any, options?: any) {
  const groupCtx = options?.groupContext;
  if (groupCtx?.is_group) {
    return {
      scope: "telegram_group",
      scope_key: String(groupCtx.group_id || ""),
      source_platform: "telegram",
      source_actor: groupCtx.triggered_by ? String(groupCtx.triggered_by) : null,
    };
  }
  const requestedScope = String(args?.scope || "personal");
  const scope = requestedScope === "telegram_group" ? "telegram_group" : "personal";
  return {
    scope,
    scope_key: scope === "telegram_group" ? String(args?.scope_key || "") : null,
    source_platform: args?.source_platform ? String(args.source_platform) : null,
    source_actor: args?.source_actor ? String(args.source_actor) : null,
  };
}

function applyMemoryScopeFilter(query: any, scopeInfo: ReturnType<typeof resolveMemoryScope>) {
  query = query.eq("scope", scopeInfo.scope);
  if (scopeInfo.scope_key) return query.eq("scope_key", scopeInfo.scope_key);
  return query.is("scope_key", null);
}

export async function executeManageMemory(supabase: any, userId: string, args: any, options?: any) {
  const action = String(args?.action || "").toLowerCase();
  if (!action) return { error: "action is required" };
  const scopeInfo = resolveMemoryScope(args, options);
  if (scopeInfo.scope === "telegram_group" && !scopeInfo.scope_key) {
    return { error: "scope_key is required for telegram_group memory" };
  }

  const safeCategory = (c?: string) =>
    VALID_MEMORY_CATEGORIES.includes(String(c || "").toLowerCase())
      ? String(c).toLowerCase()
      : "fact";
  const safeConfidence = (n?: number) => {
    const v = typeof n === "number" ? n : 0.7;
    return Math.max(0, Math.min(1, v));
  };

  try {
    if (action === "list") {
      const limit = Math.max(1, Math.min(100, Number(args?.limit) || 20));
      let q = supabase
        .from("user_memories")
        .select("id, content, category, confidence, created_at, last_accessed, scope, scope_key, source_platform, source_actor")
        .eq("user_id", userId)
        .eq("is_active", true)
        .order("confidence", { ascending: false })
        .order("last_accessed", { ascending: false })
        .limit(limit);
      q = applyMemoryScopeFilter(q, scopeInfo);
      if (args?.category) q = q.eq("category", safeCategory(args.category));
      const { data, error } = await q;
      if (error) return { error: error.message };
      return { success: true, count: data?.length || 0, memories: data || [], scope: scopeInfo.scope, scope_key: scopeInfo.scope_key };
    }

    if (action === "create") {
      const content = String(args?.content || "").trim();
      if (!content) return { error: "content is required" };
      const category = safeCategory(args?.category);
      // Route through Curator for quality screening, dedupe, and scoring
      try {
        const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
        const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
        const curatorResp = await fetch(`${supabaseUrl}/functions/v1/memory-curator`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${serviceRoleKey}`,
          },
          body: JSON.stringify({
            user_id: userId,
            candidate: { category, content, source_session_id: args?.session_id || null },
            scope: scopeInfo.scope,
            scope_key: scopeInfo.scope_key,
            source_platform: scopeInfo.source_platform,
            source_actor: scopeInfo.source_actor,
            pin_override: args?.pin === true,
          }),
        });
        const curatorResult = await curatorResp.json();
        if (curatorResult.decision === "reject") {
          return {
            success: false,
            curated: true,
            decision: "reject",
            message: `Memory rejected by Curator: ${curatorResult.reason}`,
          };
        }
        return {
          success: true,
          curated: true,
          decision: curatorResult.decision,
          memory_id: curatorResult.memory_id,
          score: curatorResult.curator_score,
          message:
            curatorResult.decision === "merge"
              ? "Memory merged with existing entry"
              : "Memory saved (curated)",
        };
      } catch (e: any) {
        // Fallback: direct insert if curator unreachable (preserves availability)
        console.warn("[manage_memory] Curator unavailable, direct insert:", e?.message);
        const confidence = safeConfidence(args?.confidence);
        const embedding = await generateEmbedding(content, supabase, userId).catch(() => null);
        const { data, error } = await supabase
          .from("user_memories")
          .insert({
            user_id: userId,
            content,
            category,
            confidence,
            embedding,
            is_active: true,
            scope: scopeInfo.scope,
            scope_key: scopeInfo.scope_key,
            source_platform: scopeInfo.source_platform,
            source_actor: scopeInfo.source_actor,
          })
          .select("id")
          .single();
        if (error) return { error: error.message };
        return { success: true, message: "Memory saved (curator bypassed)", memory_id: data.id };
      }
    }

    if (action === "update") {
      const memory_id = String(args?.memory_id || "");
      if (!memory_id) return { error: "memory_id is required" };
      const patch: any = { last_accessed: new Date().toISOString() };
      if (args?.content) {
        patch.content = String(args.content).trim();
        patch.embedding = await generateEmbedding(patch.content, supabase, userId).catch(() => null);
      }
      if (args?.category) patch.category = safeCategory(args.category);
      if (typeof args?.confidence === "number") patch.confidence = safeConfidence(args.confidence);
      let updateQuery = supabase
        .from("user_memories")
        .update(patch)
        .eq("id", memory_id)
        .eq("user_id", userId)
        .eq("scope", scopeInfo.scope);
      updateQuery = scopeInfo.scope_key ? updateQuery.eq("scope_key", scopeInfo.scope_key) : updateQuery.is("scope_key", null);
      const { error } = await updateQuery;
      if (error) return { error: error.message };
      return { success: true, message: "Memory updated" };
    }

    if (action === "delete") {
      const memory_id = String(args?.memory_id || "");
      if (!memory_id) return { error: "memory_id is required" };
      let deleteQuery = supabase
        .from("user_memories")
        .update({ is_active: false })
        .eq("id", memory_id)
        .eq("user_id", userId)
        .eq("scope", scopeInfo.scope);
      deleteQuery = scopeInfo.scope_key ? deleteQuery.eq("scope_key", scopeInfo.scope_key) : deleteQuery.is("scope_key", null);
      const { error } = await deleteQuery;
      if (error) return { error: error.message };
      return { success: true, message: "Memory removed" };
    }

    if (action === "import_bulk") {
      const items = Array.isArray(args?.items) ? args.items.slice(0, 200) : [];
      if (!items.length) return { error: "items array is required" };
      const rows = await Promise.all(
        items.map(async (it: any) => {
          const content = String(it?.content || "").trim();
          if (!content) return null;
          const embedding = await generateEmbedding(content, supabase, userId).catch(() => null);
          return {
            user_id: userId,
            content,
            category: safeCategory(it?.category),
            confidence: safeConfidence(it?.confidence),
            embedding,
            scope: scopeInfo.scope,
            scope_key: scopeInfo.scope_key,
            source_platform: scopeInfo.source_platform,
            source_actor: scopeInfo.source_actor,
            is_active: true,
          };
        })
      );
      const valid = rows.filter(Boolean);
      if (!valid.length) return { error: "No valid items to import" };
      const { error, count } = await supabase
        .from("user_memories")
        .insert(valid, { count: "exact" });
      if (error) return { error: error.message };
      return { success: true, imported: count ?? valid.length, message: `Imported ${count ?? valid.length} memories` };
    }

    if (action === "dedupe") {
      // Fetch active memories, normalize content, group exact + near-duplicates
      let dedupeQuery = supabase
        .from("user_memories")
        .select("id, content, confidence, created_at")
        .eq("user_id", userId)
        .eq("is_active", true)
        .eq("scope", scopeInfo.scope)
        .order("created_at", { ascending: true })
        .limit(500);
      dedupeQuery = scopeInfo.scope_key ? dedupeQuery.eq("scope_key", scopeInfo.scope_key) : dedupeQuery.is("scope_key", null);
      const { data: rows, error } = await dedupeQuery;
      if (error) return { error: error.message };
      const list = rows || [];
      const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();
      const seen = new Map<string, { id: string; confidence: number }>();
      const toDeactivate: string[] = [];
      for (const r of list) {
        const key = norm(r.content || "");
        if (!key) continue;
        const existing = seen.get(key);
        if (!existing) {
          seen.set(key, { id: r.id, confidence: r.confidence ?? 0.7 });
          continue;
        }
        // Keep the higher-confidence one; deactivate the other.
        if ((r.confidence ?? 0.7) > existing.confidence) {
          toDeactivate.push(existing.id);
          seen.set(key, { id: r.id, confidence: r.confidence ?? 0.7 });
        } else {
          toDeactivate.push(r.id);
        }
      }
      if (toDeactivate.length) {
        const { error: dErr } = await supabase
          .from("user_memories")
          .update({ is_active: false })
          .in("id", toDeactivate)
          .eq("user_id", userId);
        if (dErr) return { error: dErr.message };
      }
      return {
        success: true,
        scanned: list.length,
        deduped: toDeactivate.length,
        message: toDeactivate.length
          ? `Removed ${toDeactivate.length} duplicate memor${toDeactivate.length === 1 ? "y" : "ies"}`
          : "No duplicates found",
      };
    }

    if (action === "archive_stale") {
      const days = Math.max(1, Number(args?.days) || 90);
      const minConf = typeof args?.min_confidence === "number" ? args.min_confidence : 0.4;
      const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
      let archiveQuery = supabase
        .from("user_memories")
        .update({ is_active: false })
        .eq("user_id", userId)
        .eq("is_active", true)
        .eq("scope", scopeInfo.scope)
        .lt("last_accessed", cutoff)
        .lt("confidence", minConf)
        .select("id");
      archiveQuery = scopeInfo.scope_key ? archiveQuery.eq("scope_key", scopeInfo.scope_key) : archiveQuery.is("scope_key", null);
      const { data, error } = await archiveQuery;
      if (error) return { error: error.message };
      const archived = data?.length || 0;
      return {
        success: true,
        archived,
        message: archived
          ? `Archived ${archived} stale memor${archived === 1 ? "y" : "ies"}`
          : "No stale memories to archive",
      };
    }

    if (action === "promote_to_core") {
      const memory_id = String(args?.memory_id || "");
      if (!memory_id) return { error: "memory_id is required" };
      let promoteQuery = supabase
        .from("user_memories")
        .update({ pinned: true, confidence: 0.95, last_accessed: new Date().toISOString() })
        .eq("id", memory_id)
        .eq("user_id", userId)
        .eq("scope", scopeInfo.scope);
      promoteQuery = scopeInfo.scope_key ? promoteQuery.eq("scope_key", scopeInfo.scope_key) : promoteQuery.is("scope_key", null);
      const { error } = await promoteQuery;
      if (error) return { error: error.message };
      return { success: true, message: "Promoted to core memory.md" };
    }

    if (action === "demote_from_core") {
      const memory_id = String(args?.memory_id || "");
      if (!memory_id) return { error: "memory_id is required" };
      let demoteQuery = supabase
        .from("user_memories")
        .update({ pinned: false })
        .eq("id", memory_id)
        .eq("user_id", userId)
        .eq("scope", scopeInfo.scope);
      demoteQuery = scopeInfo.scope_key ? demoteQuery.eq("scope_key", scopeInfo.scope_key) : demoteQuery.is("scope_key", null);
      const { error } = await demoteQuery;
      if (error) return { error: error.message };
      return { success: true, message: "Removed from core memory.md" };
    }

    return { error: `Unknown action: ${action}` };
  } catch (e: any) {
    return { error: e?.message || "manage_memory failed" };
  }
}
