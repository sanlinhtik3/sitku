// ═══ Project Phoenix: _shared/tool-executors/admin.ts ═══
// Admin CRUD tools and system overview

import { logAdminToolAction } from "../executor-helpers.ts";

export async function executeAdminSystemOverview(supabase: any, args: any) {
  const { stat_type } = args;
  const stats: any = {};

  if (stat_type === "users" || stat_type === "all") {
    const { count: totalUsers } = await supabase.from("profiles").select("*", { count: "exact", head: true });
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { count: newUsers24h } = await supabase.from("profiles").select("*", { count: "exact", head: true }).gte("created_at", oneDayAgo);
    stats.users = { total: totalUsers || 0, new_24h: newUsers24h || 0 };
  }

  if (stat_type === "content" || stat_type === "all") {
    const { count: totalContent } = await supabase.from("ai_generated_content").select("*", { count: "exact", head: true });
    stats.content = { total: totalContent || 0 };
  }

  if (stat_type === "transactions" || stat_type === "all") {
    const { count: totalTx } = await supabase.from("user_transactions").select("*", { count: "exact", head: true });
    stats.transactions = { total: totalTx || 0 };
  }

  if (stat_type === "credits" || stat_type === "all") {
    const { data: creditData } = await supabase.from("user_credits").select("balance");
    const totalCredits = creditData?.reduce((sum: number, c: any) => sum + (c.balance || 0), 0) || 0;
    stats.credits = { total_in_circulation: totalCredits };
  }

  if (stat_type === "iu" || stat_type === "all") {
    const { data: creditData } = await supabase.from("user_credits").select("balance, tier_key");
    const totalIU = creditData?.reduce((sum: number, c: any) => sum + (c.balance || 0), 0) || 0;
    const tierDist: Record<string, number> = {};
    for (const c of creditData || []) { const t = c.tier_key || "free"; tierDist[t] = (tierDist[t] || 0) + 1; }
    const today = new Date().toISOString().split("T")[0];
    const { data: dailyData } = await supabase.from("daily_usage").select("total_uses").eq("usage_date", today);
    const iuConsumedToday = dailyData?.reduce((s: number, d: any) => s + (d.total_uses || 0), 0) || 0;
    stats.iu = { total_in_circulation: totalIU, consumed_today: iuConsumedToday, tier_distribution: tierDist, total_users_with_credits: creditData?.length || 0 };
  }

  if (stat_type === "ai_usage" || stat_type === "all") {
    const todayStart = new Date(Date.now() - 86400000).toISOString();
    const { data: usage } = await supabase.from("agent_ai_usage")
      .select("is_successful, model_used, request_duration_ms").gte("created_at", todayStart).limit(5000);
    const total = usage?.length || 0;
    const successful = usage?.filter((u: any) => u.is_successful)?.length || 0;
    const modelCount: Record<string, number> = {};
    for (const u of usage || []) modelCount[u.model_used] = (modelCount[u.model_used] || 0) + 1;
    const topModel = Object.entries(modelCount).sort((a, b) => b[1] - a[1])[0];
    const avgDuration = total > 0 ? Math.round(usage!.reduce((s: number, u: any) => s + (u.request_duration_ms || 0), 0) / total) : 0;
    stats.ai_usage = { requests_today: total, success_rate: total > 0 ? Math.round((successful / total) * 100) : 100, top_model: topModel ? topModel[0] : "none", avg_response_ms: avgDuration, active_ai_users: new Set(usage?.map((u: any) => u.user_id) || []).size };
  }

  return { success: true, stats };
}

export async function executeAdminUserLookup(supabase: any, args: any) {
  const { target_user_email, lookup_type } = args;

  // ═══ LIST-TYPE LOOKUPS (no email required) ═══
  if (lookup_type === "active_users") {
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data: sessions } = await supabase
      .from("user_sessions")
      .select("user_id, device_info, is_active, last_activity_at")
      .eq("is_active", true)
      .gte("last_activity_at", oneDayAgo)
      .order("last_activity_at", { ascending: false })
      .limit(50);
    const userIds: string[] = [...new Set<string>((sessions || []).map((s: any) => s.user_id))];
    const { data: profiles } = await supabase.from("profiles").select("user_id, full_name, email, avatar_url").in("user_id", userIds);
    const profileMap: Record<string, any> = {};
    for (const p of profiles || []) profileMap[p.user_id] = p;
    const activeUsers = userIds.map(uid => ({
      profile: profileMap[uid] || { user_id: uid },
      sessions: (sessions || []).filter((s: any) => s.user_id === uid),
    }));
    return { success: true, lookup_type: "active_users", count: activeUsers.length, active_users: activeUsers };
  }

  if (lookup_type === "all_users") {
    const { data: profiles } = await supabase
      .from("profiles")
      .select("user_id, full_name, email, avatar_url, created_at")
      .order("created_at", { ascending: false })
      .limit(100);
    return { success: true, lookup_type: "all_users", count: profiles?.length || 0, users: profiles || [] };
  }

  if (lookup_type === "search") {
    const searchTerm = target_user_email || args.search_term;
    if (!searchTerm) return { error: "search_term or target_user_email required for search lookup" };
    const { data: profiles } = await supabase
      .from("profiles")
      .select("user_id, full_name, email, avatar_url, created_at")
      .or(`full_name.ilike.%${searchTerm}%,email.ilike.%${searchTerm}%`)
      .limit(20);
    return { success: true, lookup_type: "search", search_term: searchTerm, count: profiles?.length || 0, results: profiles || [] };
  }

  // ═══ SINGLE-USER LOOKUPS (email required) ═══
  if (!target_user_email) {
    return { error: "target_user_email is required for this lookup type. For listing users, use lookup_type: 'active_users', 'all_users', or 'search'." };
  }

  const { data: profile } = await supabase.from("profiles").select("user_id, full_name, avatar_url, created_at, email").eq("email", target_user_email).single();
  if (!profile) return { error: `User not found with email: ${target_user_email}. Try lookup_type: 'search' with a partial name or email.` };
  const targetUserId = profile.user_id;

  switch (lookup_type) {
    case "profile": return { success: true, profile };
    case "credits": {
      const { data: credits } = await supabase.from("user_credits").select("balance, total_earned, total_spent, tier_key").eq("user_id", targetUserId).single();
      const today = new Date().toISOString().split("T")[0];
      const { data: daily } = await supabase.from("daily_usage").select("total_uses, daily_limit").eq("user_id", targetUserId).eq("usage_date", today).maybeSingle();
      return { success: true, user: target_user_email, name: profile.full_name, credits: credits || { balance: 0 }, daily_usage: daily };
    }
    case "transactions": {
      const { data: transactions } = await supabase.from("user_transactions").select("type, amount, currency, description, created_at").eq("user_id", targetUserId).order("created_at", { ascending: false }).limit(10);
      return { success: true, user: target_user_email, name: profile.full_name, transactions: transactions || [] };
    }
    case "sessions": {
      const { data: sessions } = await supabase.from("user_sessions").select("device_info, is_active, created_at, last_activity_at").eq("user_id", targetUserId).order("last_activity_at", { ascending: false }).limit(5);
      return { success: true, user: target_user_email, name: profile.full_name, sessions: sessions || [] };
    }
    default: return { error: `Unknown lookup type: ${lookup_type}. Available: profile, credits, transactions, sessions, active_users, all_users, search` };
  }
}

export async function executeAdminManagePrompts(supabase: any, adminUserId: string, args: any) {
  const { action, file_name } = args;
  await logAdminToolAction(supabase, adminUserId, "manage_prompts", { action, file_name });
  
  if (action === "list") {
    const { data } = await supabase.from("agent_prompt_files").select("file_name, display_name, category, order_index, is_active").order("order_index");
    return { success: true, files: data || [] };
  }
  if (action === "get") {
    if (!file_name) return { error: "file_name required" };
    const { data } = await supabase.from("agent_prompt_files").select("*").eq("file_name", file_name).single();
    return { success: true, file: data };
  }
  return { error: "Unsupported action for now" };
}

export async function executeAdminManageFeatureFlags(supabase: any, adminUserId: string, args: any) {
  const { action, feature_key, is_enabled, status } = args;
  await logAdminToolAction(supabase, adminUserId, "manage_feature_flags", { action, feature_key });
  
  if (action === "list") {
    const { data } = await supabase.from("feature_flags").select("*").order("sort_order");
    return { success: true, features: data || [] };
  }
  if (action === "update") {
    if (!feature_key) return { error: "feature_key required" };
    const updates: any = { updated_at: new Date().toISOString(), updated_by: adminUserId };
    if (is_enabled !== undefined) updates.is_enabled = is_enabled;
    if (status) updates.status = status;
    await supabase.from("feature_flags").update(updates).eq("feature_key", feature_key);
    return { success: true, message: "Updated" };
  }
  return { error: "Unknown action" };
}

export async function executeAdminManageKnowledgeBase(supabase: any, adminUserId: string, args: any) {
  const { action, content_id, title, content, category, language, tags } = args;
  await logAdminToolAction(supabase, adminUserId, "manage_knowledge_base", { action, content_id });
  
  if (action === "create") {
    const { data, error } = await supabase.from("ai_generated_content").insert({
      user_id: adminUserId, title, content, category, language, tags, is_global: true, source_type: "admin_direct"
    }).select("id").single();
    if (error) return { error: error.message };
    return { success: true, article_id: data.id };
  }
  if (action === "list") {
    const { data, error } = await supabase.from("ai_generated_content").select("id, title, category, language, tags, created_at").eq("is_global", true).eq("source_type", "admin_direct").order("created_at", { ascending: false }).limit(50);
    if (error) return { error: error.message };
    return { success: true, count: data?.length || 0, articles: data };
  }
  if (action === "update") {
    if (!content_id) return { error: "content_id required" };
    const updates: any = { updated_at: new Date().toISOString() };
    if (title) updates.title = title;
    if (content) updates.content = content;
    if (category) updates.category = category;
    if (language) updates.language = language;
    if (tags) updates.tags = tags;
    const { error } = await supabase.from("ai_generated_content").update(updates).eq("id", content_id).eq("is_global", true);
    if (error) return { error: error.message };
    return { success: true, message: "Article updated" };
  }
  if (action === "delete") {
    if (!content_id) return { error: "content_id required" };
    const { error } = await supabase.from("ai_generated_content").delete().eq("id", content_id).eq("is_global", true);
    if (error) return { error: error.message };
    return { success: true, message: "Article deleted" };
  }
  return { error: "Unknown action. Use: create, list, update, delete" };
}

export async function executeAdminManageAISettings(supabase: any, adminUserId: string, args: any) {
  const { action, allow_personal_api_key, selected_model } = args;
  await logAdminToolAction(supabase, adminUserId, "manage_ai_settings", { action });
  
  if (action === "get") {
    const { data } = await supabase.from("ai_model_settings").select("*").single();
    return { success: true, settings: data };
  }
  if (action === "update") {
    const updates: any = { updated_by: adminUserId, updated_at: new Date().toISOString() };
    if (allow_personal_api_key !== undefined) updates.allow_personal_api_key = allow_personal_api_key;
    if (selected_model) updates.selected_model = selected_model;
    
    // Check exist
    const { data: exist } = await supabase.from("ai_model_settings").select("id").single();
    if (exist) await supabase.from("ai_model_settings").update(updates).eq("id", exist.id);
    else await supabase.from("ai_model_settings").insert(updates);
    
    return { success: true, message: "Settings updated" };
  }
  return { error: "Unknown action" };
}

export async function executeAdminManageUserData(supabase: any, adminUserId: string, args: any) {
  const { action, target_email, role, credit_amount, reason } = args;
  if (action !== "get_user" && !reason) return { error: "reason required" };
  
  const { data: user } = await supabase.from("profiles").select("user_id").eq("email", target_email).single();
  if (!user) return { error: "User not found" };
  
  await logAdminToolAction(supabase, adminUserId, "manage_user_data", { action, target_email });
  
  if (action === "update_role") {
    await supabase.from("user_roles").upsert({ user_id: user.user_id, role }, { onConflict: "user_id,role" });
    return { success: true, message: "Role updated" };
  }
  if (action === "grant_credits") {
    const { data: bal } = await supabase.from("user_credits").select("balance").eq("user_id", user.user_id).single();
    const newBal = (bal?.balance || 0) + (credit_amount || 0);
    await supabase.from("user_credits").upsert({ user_id: user.user_id, balance: newBal });
    return { success: true, message: "Credits granted" };
  }
  return { error: "Unknown action" };
}

export async function executeAddToBrain(supabase: any, userId: string, args: any) {
  const { title, content, category, language } = args;
  const { data, error } = await supabase.from("ai_generated_content").insert({
    user_id: userId, title, content, category, language, is_global: true, source_type: "admin_brain"
  }).select("id").single();
  
  if (error) return { error: error.message };
  
  // Trigger sync async
  try {
    await supabase.functions.invoke("sync-kb-embeddings", { body: { action: "sync_single", content_id: data.id } });
  } catch {}
  
  return { success: true, message: "Added to Brain", id: data.id };
}

export async function executeAdminViewUserPsychology(supabase: any, args: any) {
  const { target_email } = args;
  const { data: user } = await supabase.from("profiles").select("user_id").eq("email", target_email).single();
  if (!user) return { error: "User not found" };
  
  const { data: profile } = await supabase.from("user_psych_profile").select("*").eq("user_id", user.user_id).maybeSingle();
  const { data: learned } = await supabase.from("agent_learning_context").select("*").eq("user_id", user.user_id).eq("context_type", "user_profile");
  
  return { success: true, psychology: profile, learned_traits: learned };
}

export async function executeRunAiDoctor(supabase: any) {
  const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  
  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/ai-doctor-analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}` },
      body: JSON.stringify({ trigger_type: 'manual' }),
    });
    const result = await res.json();
    if (!result.success) return { error: result.error };
    return { success: true, ...result };
  } catch (e: any) { return { error: e.message }; }
}

export async function executeViewDoctorReports(supabase: any, args: any) {
  const { limit = 5 } = args;
  const { data } = await supabase.from('doctor_reports').select('*').order('created_at', { ascending: false }).limit(limit);
  return { success: true, reports: data || [] };
}

export async function executeAdminManageTokenQuotas(supabase: any, userId: string, args: any) {
  const { action, user_email, tokens_amount, gemini_model, rpm_limit, tpm_limit, rpd_limit, quota_type, notes } = args;
  await logAdminToolAction(supabase, userId, "manage_token_quotas", { action, user_email, tokens_amount });

  // Helper: resolve user by email
  const resolveUser = async (email: string) => {
    const { data } = await supabase.from("profiles").select("user_id, full_name").eq("email", email).single();
    return data;
  };

  if (action === "list_all") {
    const { data: credits } = await supabase.from("user_credits").select("user_id, balance, total_earned, total_spent, tier_key").limit(100);
    const userIds = credits?.map((c: any) => c.user_id) || [];
    const { data: profiles } = await supabase.from("profiles").select("user_id, full_name, email").in("user_id", userIds);
    const profileMap: Record<string, any> = {};
    for (const p of profiles || []) profileMap[p.user_id] = p;
    const result = (credits || []).map((c: any) => ({ ...c, profile: profileMap[c.user_id] || null }));
    return { success: true, count: result.length, users: result };
  }

  if (action === "list_granted_users") {
    const { data } = await supabase.from("ai_user_settings").select("user_id, granted_by, granted_at, gemini_model, notes").not("granted_by", "is", null).limit(100);
    const userIds = data?.map((d: any) => d.user_id) || [];
    const { data: profiles } = await supabase.from("profiles").select("user_id, full_name, email").in("user_id", userIds);
    const profileMap: Record<string, any> = {};
    for (const p of profiles || []) profileMap[p.user_id] = p;
    const result = (data || []).map((d: any) => ({ ...d, profile: profileMap[d.user_id] || null }));
    return { success: true, count: result.length, granted_users: result };
  }

  if (action === "get_user") {
    if (!user_email) return { error: "user_email required" };
    const user = await resolveUser(user_email);
    if (!user) return { error: `User not found: ${user_email}` };
    const { data: credits } = await supabase.from("user_credits").select("balance, total_earned, total_spent, tier_key").eq("user_id", user.user_id).single();
    const { data: settings } = await supabase.from("ai_user_settings").select("gemini_model, granted_by, granted_at, is_premium, is_paused").eq("user_id", user.user_id).single();
    const { data: usage } = await supabase.from("agent_ai_usage").select("tokens_total").eq("user_id", user.user_id).gte("created_at", new Date(Date.now() - 86400000).toISOString());
    const tokensToday = usage?.reduce((s: number, u: any) => s + (u.tokens_total || 0), 0) || 0;
    const { data: daily } = await supabase.from("daily_usage").select("total_uses, daily_limit").eq("user_id", user.user_id).eq("usage_date", new Date().toISOString().split("T")[0]).maybeSingle();
    return { success: true, user: user_email, name: user.full_name, credits: credits || { balance: 0 }, ai_settings: settings, tokens_used_today: tokensToday, daily_usage: daily };
  }

  if (action === "grant_free_access") {
    if (!user_email) return { error: "user_email required" };
    const user = await resolveUser(user_email);
    if (!user) return { error: `User not found: ${user_email}` };
    const grantAmount = tokens_amount || 1000000;
    const model = gemini_model || "gemini-3.5-flash";
    // Upsert ai_user_settings
    await supabase.from("ai_user_settings").upsert({
      user_id: user.user_id, granted_by: userId, granted_at: new Date().toISOString(),
      gemini_model: model, is_premium: true, notes: notes || "Free access granted by admin",
    }, { onConflict: "user_id" });
    // Upsert credits
    const { data: bal } = await supabase.from("user_credits").select("balance").eq("user_id", user.user_id).single();
    const newBal = (bal?.balance || 0) + grantAmount;
    await supabase.from("user_credits").upsert({ user_id: user.user_id, balance: newBal, total_earned: newBal }, { onConflict: "user_id" });
    return { success: true, message: `Granted free access to ${user_email}`, iu_balance: newBal, model };
  }

  if (action === "revoke_free_access") {
    if (!user_email) return { error: "user_email required" };
    const user = await resolveUser(user_email);
    if (!user) return { error: `User not found: ${user_email}` };
    await supabase.from("ai_user_settings").update({
      granted_by: null, granted_at: null, is_premium: false, notes: notes || "Access revoked by admin",
    }).eq("user_id", user.user_id);
    await supabase.from("user_credits").update({ balance: 0 }).eq("user_id", user.user_id);
    return { success: true, message: `Revoked free access from ${user_email}` };
  }

  if (action === "grant_tokens") {
    if (!user_email) return { error: "user_email required" };
    if (!tokens_amount) return { error: "tokens_amount required" };
    const user = await resolveUser(user_email);
    if (!user) return { error: `User not found: ${user_email}` };
    const { data: bal } = await supabase.from("user_credits").select("balance").eq("user_id", user.user_id).single();
    const newBal = (bal?.balance || 0) + tokens_amount;
    await supabase.from("user_credits").upsert({ user_id: user.user_id, balance: newBal }, { onConflict: "user_id" });
    return { success: true, message: `Granted ${tokens_amount} IU to ${user_email}`, new_balance: newBal };
  }

  if (action === "set_limits") {
    if (!user_email) return { error: "user_email required" };
    const user = await resolveUser(user_email);
    if (!user) return { error: `User not found: ${user_email}` };
    const updates: any = { updated_at: new Date().toISOString() };
    if (rpm_limit !== undefined) updates.rpm_limit = rpm_limit;
    if (tpm_limit !== undefined) updates.tpm_limit = tpm_limit;
    if (rpd_limit !== undefined) updates.rpd_limit = rpd_limit;
    await supabase.from("ai_user_settings").upsert({ user_id: user.user_id, ...updates }, { onConflict: "user_id" });
    return { success: true, message: `Limits updated for ${user_email}` };
  }

  if (action === "reset_usage") {
    if (!user_email) return { error: "user_email required" };
    const user = await resolveUser(user_email);
    if (!user) return { error: `User not found: ${user_email}` };
    const today = new Date().toISOString().split("T")[0];
    await supabase.from("daily_usage").update({ total_uses: 0, beebot_uses: 0, ai_content_uses: 0 }).eq("user_id", user.user_id).eq("usage_date", today);
    return { success: true, message: `Daily usage reset for ${user_email}` };
  }

  if (action === "upgrade_plan") {
    if (!user_email) return { error: "user_email required" };
    if (!quota_type) return { error: "quota_type required" };
    const user = await resolveUser(user_email);
    if (!user) return { error: `User not found: ${user_email}` };
    await supabase.from("user_credits").upsert({ user_id: user.user_id, tier_key: quota_type }, { onConflict: "user_id" });
    return { success: true, message: `Plan upgraded to ${quota_type} for ${user_email}` };
  }

  if (action === "bulk_grant") {
    if (!tokens_amount) return { error: "tokens_amount required" };
    console.log(`[ADMIN] Bulk grant: amount=${tokens_amount}, admin=${userId}`);
    const { data, error } = await supabase.rpc("admin_bulk_grant_iu", {
      grant_amount: tokens_amount,
      admin_user_id: userId,
    });
    if (error) {
      console.error(`[ADMIN] Bulk grant FAILED:`, error.message);
      return { error: `Bulk grant failed: ${error.message}` };
    }
    // Handle RPC-level error (from EXCEPTION block)
    if (data && !data.success) {
      console.error(`[ADMIN] Bulk grant RPC error:`, data.error);
      return { error: `Bulk grant failed: ${data.error}` };
    }
    console.log(`[ADMIN] Bulk grant SUCCESS: ${data?.updated_count} users updated`);
    return {
      success: true,
      message: `Granted ${tokens_amount} IU to ${data?.updated_count || 0} users`,
      updated_count: data?.updated_count || 0,
    };
  }

  return { error: `Unknown action: ${action}. Use: list_all, list_granted_users, get_user, grant_free_access, revoke_free_access, grant_tokens, set_limits, reset_usage, upgrade_plan, bulk_grant` };
}

export async function executeAdminAIAnalytics(supabase: any, userId: string, args: any) {
  const { query_type = "system_overview", time_range = "today", limit: resultLimit = 10 } = args;
  await logAdminToolAction(supabase, userId, "view_analytics", { query_type, time_range });

  // Convert time_range to date filter
  const now = Date.now();
  const rangeMs: Record<string, number> = { today: 86400000, this_week: 7 * 86400000, this_month: 30 * 86400000, all_time: 365 * 86400000 };
  const since = new Date(now - (rangeMs[time_range] || 86400000)).toISOString();

  if (query_type === "system_overview") {
    const { data: usage } = await supabase.from("agent_ai_usage")
      .select("is_successful, tokens_input, tokens_output, tokens_total, estimated_cost, request_duration_ms")
      .gte("created_at", since).limit(5000);
    const total = usage?.length || 0;
    const successful = usage?.filter((u: any) => u.is_successful)?.length || 0;
    const totalTokensIn = usage?.reduce((s: number, u: any) => s + (u.tokens_input || 0), 0) || 0;
    const totalTokensOut = usage?.reduce((s: number, u: any) => s + (u.tokens_output || 0), 0) || 0;
    const totalCost = usage?.reduce((s: number, u: any) => s + (u.estimated_cost || 0), 0) || 0;
    const avgDuration = total > 0 ? Math.round(usage!.reduce((s: number, u: any) => s + (u.request_duration_ms || 0), 0) / total) : 0;
    return { success: true, query_type, time_range, summary: { total_requests: total, successful, failed: total - successful, success_rate: total > 0 ? Math.round((successful / total) * 100) : 100, tokens_input: totalTokensIn, tokens_output: totalTokensOut, tokens_total: totalTokensIn + totalTokensOut, estimated_cost_usd: Math.round(totalCost * 10000) / 10000, avg_duration_ms: avgDuration } };
  }

  if (query_type === "user_breakdown") {
    const { data: usage } = await supabase.from("agent_ai_usage")
      .select("user_id, tokens_total, estimated_cost").gte("created_at", since).limit(5000);
    const byUser: Record<string, { tokens: number; cost: number; count: number }> = {};
    for (const u of usage || []) {
      if (!byUser[u.user_id]) byUser[u.user_id] = { tokens: 0, cost: 0, count: 0 };
      byUser[u.user_id].tokens += u.tokens_total || 0;
      byUser[u.user_id].cost += u.estimated_cost || 0;
      byUser[u.user_id].count++;
    }
    const userIds = Object.keys(byUser);
    const { data: profiles } = await supabase.from("profiles").select("user_id, full_name, email").in("user_id", userIds);
    const { data: credits } = await supabase.from("user_credits").select("user_id, balance, tier_key").in("user_id", userIds);
    const profileMap: Record<string, any> = {};
    for (const p of profiles || []) profileMap[p.user_id] = p;
    const creditMap: Record<string, any> = {};
    for (const c of credits || []) creditMap[c.user_id] = c;
    const breakdown = userIds.map(uid => ({ user_id: uid, profile: profileMap[uid], credits: creditMap[uid], ...byUser[uid] }))
      .sort((a, b) => b.tokens - a.tokens).slice(0, resultLimit);
    return { success: true, query_type, time_range, count: breakdown.length, breakdown };
  }

  if (query_type === "model_distribution") {
    const { data: usage } = await supabase.from("agent_ai_usage")
      .select("model_used, tokens_total, estimated_cost, api_source").gte("created_at", since).limit(5000);
    const byModel: Record<string, { count: number; tokens: number; cost: number; sources: Record<string, number> }> = {};
    for (const u of usage || []) {
      if (!byModel[u.model_used]) byModel[u.model_used] = { count: 0, tokens: 0, cost: 0, sources: {} };
      byModel[u.model_used].count++;
      byModel[u.model_used].tokens += u.tokens_total || 0;
      byModel[u.model_used].cost += u.estimated_cost || 0;
      byModel[u.model_used].sources[u.api_source] = (byModel[u.model_used].sources[u.api_source] || 0) + 1;
    }
    return { success: true, query_type, time_range, models: byModel };
  }

  if (query_type === "daily_trends") {
    const { data: daily } = await supabase.from("daily_usage")
      .select("usage_date, total_uses, beebot_uses, ai_content_uses, daily_limit")
      .gte("usage_date", since.split("T")[0]).order("usage_date", { ascending: false }).limit(resultLimit);
    return { success: true, query_type, time_range, trends: daily || [] };
  }

  if (query_type === "top_consumers") {
    // Query 1: IU consumed from daily_usage (the actual IU metric)
    const { data: dailyUsage } = await supabase.from("daily_usage")
      .select("user_id, total_uses")
      .gte("usage_date", since.split("T")[0]);
    const iuByUser: Record<string, number> = {};
    for (const d of dailyUsage || []) {
      iuByUser[d.user_id] = (iuByUser[d.user_id] || 0) + (d.total_uses || 0);
    }

    // Query 2: Raw tokens from agent_ai_usage (supplementary metric, no row limit — use count aggregation)
    const { data: tokenUsage } = await supabase.from("agent_ai_usage")
      .select("user_id, tokens_total").gte("created_at", since);
    const tokensByUser: Record<string, number> = {};
    for (const u of tokenUsage || []) {
      tokensByUser[u.user_id] = (tokensByUser[u.user_id] || 0) + (u.tokens_total || 0);
    }

    // Merge all user IDs from both sources
    const allUserIds = [...new Set([...Object.keys(iuByUser), ...Object.keys(tokensByUser)])];

    // Sort by IU consumed (primary metric), fallback to tokens
    const sorted = allUserIds
      .map(uid => ({ uid, iu: iuByUser[uid] || 0, tokens: tokensByUser[uid] || 0 }))
      .sort((a, b) => b.iu - a.iu || b.tokens - a.tokens)
      .slice(0, resultLimit);

    const topIds = sorted.map(s => s.uid);
    const { data: profiles } = await supabase.from("profiles").select("user_id, full_name, email").in("user_id", topIds);
    const { data: credits } = await supabase.from("user_credits").select("user_id, balance, tier_key").in("user_id", topIds);
    const profileMap: Record<string, any> = {};
    for (const p of profiles || []) profileMap[p.user_id] = p;
    const creditMap: Record<string, any> = {};
    for (const c of credits || []) creditMap[c.user_id] = c;
    const topConsumers = sorted.map(s => ({
      user_id: s.uid,
      iu_consumed: s.iu,
      tokens_consumed: s.tokens,
      profile: profileMap[s.uid],
      credits: creditMap[s.uid],
    }));
    return { success: true, query_type, time_range, top_consumers: topConsumers, data_note: "Sorted by IU consumed (from daily_usage). tokens_consumed is supplementary from agent_ai_usage." };
  }

  if (query_type === "quota_alerts") {
    const today = new Date().toISOString().split("T")[0];
    const { data: daily } = await supabase.from("daily_usage")
      .select("user_id, total_uses, daily_limit").eq("usage_date", today);
    const alerts = (daily || []).filter((d: any) => d.daily_limit > 0 && d.total_uses >= d.daily_limit * 0.8)
      .sort((a: any, b: any) => (b.total_uses / b.daily_limit) - (a.total_uses / a.daily_limit));
    const alertIds = alerts.map((a: any) => a.user_id);
    const { data: profiles } = await supabase.from("profiles").select("user_id, full_name, email").in("user_id", alertIds);
    const profileMap: Record<string, any> = {};
    for (const p of profiles || []) profileMap[p.user_id] = p;
    const result = alerts.map((a: any) => ({ ...a, usage_percent: Math.round((a.total_uses / a.daily_limit) * 100), profile: profileMap[a.user_id] }));
    return { success: true, query_type, alerts: result };
  }

  return { error: `Unknown query_type: ${query_type}. Use: system_overview, user_breakdown, model_distribution, daily_trends, top_consumers, quota_alerts` };
}

// ═══ Fix 2: save_verbatim_content executor ═══
export async function executeSaveVerbatimContent(supabase: any, userId: string, args: any) {
  const { content, title, category = "general", language = "burmese" } = args;
  if (!content) return { error: "Content is required. Please provide the text to save." };

  const autoTitle = title || content.slice(0, 60).replace(/\n/g, " ").trim() + (content.length > 60 ? "..." : "");

  try {
    const { data, error } = await supabase.from("ai_generated_content").insert({
      user_id: userId,
      title: autoTitle,
      content,
      category,
      language,
      source_type: "user_verbatim",
      is_global: false,
      metadata: { verbatim: true, saved_at: new Date().toISOString() },
    }).select("id, title").single();

    if (error) return { error: `Failed to save: ${error.message}` };
    return { success: true, message: `✅ Saved "${autoTitle}" to My AI Content`, id: data.id, title: data.title };
  } catch (e: any) {
    return { error: `Save failed: ${e.message}` };
  }
}
