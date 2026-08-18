import { financeStore } from "@/repositories/local/financeStore";
import { consultantStore, LOCAL_USER_ID, type Platform } from "@/repositories/local/consultantStore";
import { calculateTeamHealth, kpiActual, kpiAttainment, memberMetrics, projectHealth, teamStore, type TeamKpiMetric, type TeamKpiPeriod, type TeamTask, type TeamTaskStatus } from "@/repositories/local/teamStore";

// Renderer-side handler for the Phase-2 finance/consultant MCP tools. Electron main round-trips each
// tool call here (electron/mcp-data-bridge.mjs) because this data lives in IndexedDB — only the
// renderer can read it. Registered on boot via window.beebotDesktop.registerMcpDataHandler (main.tsx).
// Returns plain JSON-serialisable objects; throws on bad input (surfaced to the AI as a tool error).

const FIN_UID = "local-user"; // matches useAuth()/useWorkspaceIdentity local id

function ymd(date = new Date()): string {
  const y = date.getFullYear(), m = String(date.getMonth() + 1).padStart(2, "0"), d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
function daysAgo(n: number): string { const d = new Date(); d.setDate(d.getDate() - n); return ymd(d); }

type Args = Record<string, unknown>;
const str = (v: unknown): string | undefined => (typeof v === "string" && v ? v : undefined);
const posInt = (v: unknown, fallback: number): number => { const n = Number(v); return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback; };
const posNum = (v: unknown): number | undefined => { const n = Number(v); return Number.isFinite(n) && n > 0 ? n : undefined; };
const nonNeg = (v: unknown): number | undefined => { const n = Number(v); return Number.isFinite(n) && n >= 0 ? n : undefined; };
const strings = (v: unknown): string[] => Array.isArray(v) ? v.filter((item): item is string => typeof item === "string" && !!item.trim()) : [];
const oneOf = <T extends string>(v: unknown, values: readonly T[], label: string): T => {
  const value = str(v);
  if (!value || !values.includes(value as T)) throw new Error(`${label} must be one of: ${values.join(", ")}`);
  return value as T;
};

const PLATFORMS = ["facebook", "instagram", "tiktok", "youtube", "telegram", "x", "linkedin", "threads", "podcast", "newsletter", "other"] as const satisfies readonly Platform[];
const TASK_STATUSES = ["backlog", "ready", "in_progress", "blocked", "review", "done", "cancelled"] as const satisfies readonly TeamTaskStatus[];
const KPI_METRICS = ["tasks_completed", "kpi_points", "on_time_rate", "views", "engagement_rate", "custom"] as const satisfies readonly TeamKpiMetric[];
const KPI_PERIODS = ["daily", "weekly", "monthly", "quarterly"] as const satisfies readonly TeamKpiPeriod[];

export async function handleMcpDataRequest(op: string, args: Args = {}): Promise<unknown> {
  if (op.startsWith("team_")) await teamStore.ready();
  switch (op) {
    /* ── Personal CFO ── */
    case "finance_summary": {
      const from = str(args.from) || daysAgo(90), to = str(args.to) || ymd();
      const txns = await financeStore.listTransactions(FIN_UID, from, to);
      let income = 0, expense = 0;
      for (const t of txns) { if (t.type === "income") income += t.amount; else if (t.type === "expense") expense += t.amount; }
      return { from, to, income, expense, net: income - expense, transactions: txns.length };
    }
    case "finance_list_transactions": {
      const from = str(args.from) || daysAgo(30), to = str(args.to) || ymd();
      const type = str(args.type), limit = posInt(args.limit, 50);
      const cats = await financeStore.listCategories(FIN_UID);
      const catName = new Map(cats.map((c) => [c.id, c.name]));
      let txns = await financeStore.listTransactions(FIN_UID, from, to);
      if (type) txns = txns.filter((t) => t.type === type);
      return {
        from, to, total: txns.length, returned: Math.min(txns.length, limit),
        transactions: txns.slice(0, limit).map((t) => ({
          date: t.transaction_date, type: t.type, amount: t.amount, currency: t.currency,
          category: t.category_id ? catName.get(t.category_id) ?? null : null,
          description: t.description, source: t.source ?? null,
        })),
      };
    }
    case "finance_add_transaction": {
      const type = str(args.type), amount = posNum(args.amount);
      if (type !== "income" && type !== "expense") throw new Error("type must be 'income' or 'expense'");
      if (!amount) throw new Error("amount must be a positive number");
      const accounts = await financeStore.listAccounts(FIN_UID);
      const acc = accounts.find((a) => a.is_default) ?? accounts[0];
      const category = str(args.category);
      let category_id: string | null = null;
      if (category) {
        const cats = await financeStore.listCategories(FIN_UID);
        category_id = cats.find((c) => c.type === type && c.name.toLowerCase() === category.toLowerCase())?.id ?? null;
      }
      const created = await financeStore.addTransaction(FIN_UID, {
        type, amount, account_id: acc?.id || "", currency: acc?.currency || "THB",
        category_id, description: str(args.description) ?? (category_id ? null : category ?? null),
        source: str(args.source) ?? null, transaction_date: str(args.date) || ymd(),
      });
      return { ok: true, id: created.id, type: created.type, amount: created.amount, currency: created.currency, date: created.transaction_date };
    }
    case "finance_update_transaction": {
      const id = str(args.id);
      if (!id) throw new Error("id is required");
      const existing = (await financeStore.listTransactions(FIN_UID, "0000-01-01", "9999-12-31")).find((t) => t.id === id);
      if (!existing) throw new Error("transaction not found");
      const updates: Record<string, unknown> = {};
      if (args.amount !== undefined) { const amount = posNum(args.amount); if (!amount) throw new Error("amount must be positive"); updates.amount = amount; }
      if (str(args.date)) updates.transaction_date = str(args.date);
      if (args.description !== undefined) updates.description = str(args.description) ?? null;
      const category = str(args.category);
      if (category) {
        const cats = await financeStore.listCategories(FIN_UID);
        updates.category_id = cats.find((c) => c.type === existing.type && c.name.toLowerCase() === category.toLowerCase())?.id ?? null;
      }
      await financeStore.updateTransaction(id, updates);
      return { ok: true, id };
    }
    case "finance_subscriptions": {
      const rows = await financeStore.listSubscriptions(FIN_UID);
      return { total: rows.length, subscriptions: rows.map((s) => ({ id: s.id, name: s.name, amount: s.amount, currency: s.currency, billing_cycle: s.billing_cycle, next_billing_date: s.next_billing_date })) };
    }

    /* ── Agent Consultant ── */
    case "consultant_summary": {
      const from = str(args.from) || daysAgo(90), to = str(args.to) || ymd();
      return await consultantStore.dashboardSummary(from, to);
    }
    case "consultant_list_posts": {
      const limit = posInt(args.limit, 50);
      const posts = await consultantStore.listPosts();
      return {
        total: posts.length, returned: Math.min(posts.length, limit),
        posts: posts.slice(0, limit).map((p) => ({
          title: p.title, platform: p.agentic_channels?.platform ?? null, posted_at: p.posted_at, url: p.post_url,
          views: p.views, likes: p.likes, comments: p.comments, shares: p.shares, saves: p.saves,
        })),
      };
    }
    case "consultant_top_posts": {
      const from = str(args.from) || daysAgo(90), to = str(args.to) || ymd();
      const metric = str(args.metric) === "views" ? "views" : "engagement";
      return await consultantStore.topPosts(from, to, metric, posInt(args.limit, 5));
    }
    case "consultant_add_revenue": {
      const amount = posNum(args.amount);
      if (!amount) throw new Error("amount must be a positive number");
      const source = str(args.source) || "other";
      await consultantStore.addRevenue(LOCAL_USER_ID, {
        amount, source, entry_date: str(args.date), description: str(args.description) ?? null,
      });
      return { ok: true, amount, currency: "USDT", source, date: str(args.date) || ymd() };
    }
    case "consultant_add_expense": {
      const amount = posNum(args.amount), category = str(args.category);
      if (!amount || !category) throw new Error("positive amount and category are required");
      await consultantStore.addExpense(LOCAL_USER_ID, { amount, category, entry_date: str(args.date), description: str(args.description) ?? null });
      return { ok: true, amount, currency: "USDT", category, date: str(args.date) || ymd() };
    }
    case "consultant_add_post": {
      const platform = oneOf(args.platform, PLATFORMS, "platform");
      const post_name = str(args.post_name);
      if (!post_name) throw new Error("post_name is required");
      const created = await consultantStore.upsertPost(LOCAL_USER_ID, { platform, post_name, post_url: str(args.post_url) ?? null, posted_at: str(args.posted_at), notes: str(args.notes) ?? null });
      return { ok: true, id: created.id, platform, post_name };
    }
    case "consultant_update_post_metrics": {
      const id = str(args.id);
      if (!id) throw new Error("id is required");
      if (!(await consultantStore.listPostMetrics(id)).length) throw new Error("post not found");
      await consultantStore.updatePostMetrics(id, {
        views: nonNeg(args.views), likes: nonNeg(args.likes), comments: nonNeg(args.comments),
        shares: nonNeg(args.shares), saves: nonNeg(args.saves), reach: nonNeg(args.reach),
      });
      return { ok: true, id };
    }

    /* ── Team Management ── */
    case "team_overview": {
      const state = teamStore.getSnapshot();
      const active = state.tasks.filter((task) => ["ready", "in_progress", "blocked", "review"].includes(task.status));
      const dueToday = active.filter((task) => task.dueAt?.slice(0, 10) === ymd()).length;
      const urgent = active.filter((task) => task.priority === "urgent").length;
      const targetsMet = state.kpiTargets.filter((target) => target.active && kpiAttainment(target, kpiActual(target, state.tasks, state.kpiMeasurements)) >= 100).length;
      return {
        company: state.company,
        teams: state.teams.filter((team) => !team.archived).length,
        projects: state.projects.filter((project) => !project.archived).length,
        members: state.members.filter((member) => !member.archived).length,
        active_tasks: active.length,
        blocked: active.filter((task) => task.status === "blocked").length,
        due_today: dueToday,
        urgent,
        kpi_targets: state.kpiTargets.filter((target) => target.active).length,
        targets_met: targetsMet,
        pending_approvals: state.approvals.filter((approval) => approval.status === "pending").length,
        health: calculateTeamHealth(state),
      };
    }
    case "team_list_members": {
      const state = teamStore.getSnapshot();
      return { members: state.members.filter((member) => !member.archived).map((member) => ({ ...member, metrics: memberMetrics(member, state.tasks) })) };
    }
    case "team_list_tasks": {
      const state = teamStore.getSnapshot();
      const owner = str(args.owner_id), status = str(args.status), limit = posInt(args.limit, 100);
      const rows = state.tasks.filter((task) => (!owner || task.ownerId === owner) && (!status || task.status === status)).slice(0, limit);
      return { total: rows.length, tasks: rows };
    }
    case "team_list_projects": {
      const state = teamStore.getSnapshot();
      return {
        projects: state.projects.filter((project) => !project.archived).map((project) => ({
          ...project,
          health: projectHealth(project, state.tasks),
          task_count: state.tasks.filter((task) => task.projectId === project.id && task.status !== "cancelled").length,
        })),
      };
    }
    case "team_health": {
      const state = teamStore.getSnapshot();
      return { ...calculateTeamHealth(state), weights: state.healthWeights };
    }
    case "team_kpi_status": {
      const state = teamStore.getSnapshot();
      return { targets: state.kpiTargets.filter((target) => target.active).map((target) => { const actual = kpiActual(target, state.tasks, state.kpiMeasurements); return { ...target, actual, attainment: kpiAttainment(target, actual) }; }) };
    }
    case "team_list_reviews": {
      const state = teamStore.getSnapshot();
      const memberId = str(args.member_id);
      return { reviews: state.reviews.filter((review) => !memberId || review.memberId === memberId) };
    }
    case "team_list_attendance": {
      const state = teamStore.getSnapshot();
      const memberId = str(args.member_id), from = str(args.from), to = str(args.to);
      return { attendance: state.attendance.filter((entry) => (!memberId || entry.memberId === memberId) && (!from || entry.date >= from) && (!to || entry.date <= to)), leave_requests: state.leaveRequests.filter((entry) => !memberId || entry.memberId === memberId) };
    }
    case "team_list_payroll": {
      const state = teamStore.getSnapshot();
      const memberId = str(args.member_id), period = str(args.period);
      return { payroll: state.payrollEntries.filter((entry) => (!memberId || entry.memberId === memberId) && (!period || entry.period === period)), compensation_plans: state.compensationPlans.filter((entry) => !memberId || entry.memberId === memberId) };
    }
    case "team_list_approvals": {
      const state = teamStore.getSnapshot();
      const status = str(args.status);
      return { approvals: state.approvals.filter((approval) => !status || approval.status === status) };
    }
    case "team_activity": {
      const state = teamStore.getSnapshot();
      const limit = posInt(args.limit, 100);
      return { activity: state.activity.slice().reverse().slice(0, limit) };
    }
    case "team_add_member": {
      const name = str(args.name), role = str(args.role);
      if (!name || !role) throw new Error("name and role are required");
      const result = teamStore.addMember({ name, role, responsibilities: strings(args.responsibilities), channels: strings(args.channels), capacityHours: posNum(args.capacity_hours) || 40 }, str(args.idempotency_key));
      await teamStore.flush();
      return result || { ok: true, duplicate: true };
    }
    case "team_add_project": {
      const state = teamStore.getSnapshot();
      const name = str(args.name);
      if (!name) throw new Error("name is required");
      const result = teamStore.addProject({
        teamId: str(args.team_id) || state.teams.find((team) => !team.archived)?.id || "team_default",
        name,
        description: str(args.description) || "",
        status: oneOf(args.status || "active", ["planned", "active", "at_risk", "paused", "completed"] as const, "status"),
        ownerId: str(args.owner_id) || null,
        startAt: str(args.start_at) || null,
        dueAt: str(args.due_at) || null,
        color: str(args.color) || "#f4d35e",
      }, str(args.idempotency_key));
      await teamStore.flush();
      return result || { ok: true, duplicate: true };
    }
    case "team_add_task": {
      const title = str(args.title);
      if (!title) throw new Error("title is required");
      const snapshot = teamStore.getSnapshot();
      const ownerId = str(args.owner_id) || null, reviewerId = str(args.reviewer_id) || null;
      if (ownerId && !snapshot.members.some((member) => member.id === ownerId && !member.archived)) throw new Error("owner_id does not match an active team member");
      if (reviewerId && !snapshot.members.some((member) => member.id === reviewerId && !member.archived)) throw new Error("reviewer_id does not match an active team member");
      return teamStore.addTask({
        title, ownerId, reviewerId, description: str(args.description) || "",
        projectId: str(args.project_id) || null,
        status: str(args.status) ? oneOf(args.status, TASK_STATUSES, "status") : "ready",
        priority: (str(args.priority) as "low" | "medium" | "high" | "urgent") || "medium",
        dueAt: str(args.due_at) || null, reminderAt: str(args.reminder_at) || null, channel: str(args.channel) || "", plannedMinutes: nonNeg(args.planned_minutes) || 0,
        workType: (str(args.work_type) as "general" | "social_post") || "general", platform: str(args.platform) || "",
        postUrl: str(args.post_url) || "", postedAt: str(args.posted_at) || null,
      }, str(args.idempotency_key));
    }
    case "team_update_task": {
      const id = str(args.id);
      if (!id) throw new Error("id is required");
      if (!teamStore.getSnapshot().tasks.some((task) => task.id === id)) throw new Error("task not found");
      const updates: Partial<TeamTask> = {};
      for (const [input, field] of [["status", "status"], ["progress", "progress"], ["actual_minutes", "actualMinutes"], ["views", "views"], ["engagement_rate", "engagementRate"], ["likes", "likes"], ["shares", "shares"], ["comments", "comments"], ["saves", "saves"], ["kpi_points", "kpiPoints"]] as const) {
        if (args[input] === undefined) continue;
        if (input === "status") updates.status = oneOf(args[input], TASK_STATUSES, "status");
        else {
          const value = nonNeg(args[input]);
          if (value === undefined) throw new Error(`${input} must be zero or greater`);
          updates[field] = value;
        }
      }
      teamStore.updateTask(id, updates, str(args.idempotency_key));
      await teamStore.flush();
      return { ok: true, id };
    }
    case "team_add_kpi": {
      const name = str(args.name), target = posNum(args.target);
      if (!name || !target) throw new Error("name and positive target are required");
      const metric = oneOf(args.metric, KPI_METRICS, "metric"), period = oneOf(args.period, KPI_PERIODS, "period");
      const memberId = str(args.member_id) || null;
      if (memberId && !teamStore.getSnapshot().members.some((member) => member.id === memberId && !member.archived)) throw new Error("member_id does not match an active team member");
      const result = teamStore.addKpiTarget({
        memberId, name, metric, period, target,
        direction: str(args.direction) ? oneOf(args.direction, ["at_least", "at_most", "range"] as const, "direction") : "at_least",
        targetMax: posNum(args.target_max) || null,
        unit: str(args.unit) || "",
      }, str(args.idempotency_key));
      await teamStore.flush();
      return result || { ok: true, duplicate: true };
    }
    case "team_record_kpi": {
      const targetId = str(args.target_id), value = nonNeg(args.value);
      if (!targetId || value === undefined) throw new Error("target_id and non-negative value are required");
      if (!teamStore.getSnapshot().kpiTargets.some((target) => target.id === targetId)) throw new Error("KPI target not found");
      const result = teamStore.addKpiMeasurement({ targetId, value, measuredAt: str(args.measured_at) || new Date().toISOString(), note: str(args.note) || "" }, str(args.idempotency_key));
      await teamStore.flush();
      return result || { ok: true, duplicate: true };
    }
    case "team_add_comment": {
      const taskId = str(args.task_id), body = str(args.body);
      if (!taskId || !body) throw new Error("task_id and body are required");
      const result = teamStore.addComment(taskId, body, str(args.idempotency_key));
      await teamStore.flush();
      return result || { ok: true, duplicate: true };
    }
    case "team_add_attendance": {
      const memberId = str(args.member_id), date = str(args.date);
      if (!memberId || !date) throw new Error("member_id and date are required");
      const result = teamStore.addAttendance({ memberId, date, status: oneOf(args.status, ["present", "remote", "leave", "absent"] as const, "status"), minutes: nonNeg(args.minutes) || 0, note: str(args.note) || "" }, str(args.idempotency_key));
      await teamStore.flush();
      return result || { ok: true, duplicate: true };
    }
    case "team_add_leave": {
      const memberId = str(args.member_id), startDate = str(args.start_date), endDate = str(args.end_date);
      if (!memberId || !startDate || !endDate) throw new Error("member_id, start_date, and end_date are required");
      const result = teamStore.addLeave({ memberId, startDate, endDate, type: oneOf(args.type, ["annual", "sick", "personal", "other"] as const, "type"), status: "pending", note: str(args.note) || "" }, str(args.idempotency_key));
      await teamStore.flush();
      return result || { ok: true, duplicate: true };
    }
    case "team_add_review": {
      const memberId = str(args.member_id), periodStart = str(args.period_start), periodEnd = str(args.period_end);
      const score = nonNeg(args.score);
      if (!memberId || !periodStart || !periodEnd || score === undefined || score > 100) throw new Error("member_id, period_start, period_end, and score 0-100 are required");
      const result = teamStore.addReview({ memberId, periodStart, periodEnd, score, strengths: str(args.strengths) || "", improvements: str(args.improvements) || "", nextActions: str(args.next_actions) || "", status: "final" }, str(args.idempotency_key));
      await teamStore.flush();
      return result || { ok: true, duplicate: true };
    }
    case "team_add_payroll": {
      const memberId = str(args.member_id), period = str(args.period), currency = str(args.currency);
      if (!memberId || !period || !currency) throw new Error("member_id, period, and currency are required");
      const result = teamStore.addPayrollEntry({ memberId, period, currency, salary: nonNeg(args.salary) || 0, bonus: nonNeg(args.bonus) || 0, deduction: nonNeg(args.deduction) || 0, status: "pending", paidAt: null, note: str(args.note) || "" }, str(args.idempotency_key));
      await teamStore.flush();
      return result || { ok: true, duplicate: true };
    }
    case "team_update_approval": {
      const id = str(args.id);
      if (!id) throw new Error("id is required");
      const status = oneOf(args.status, ["approved", "rejected"] as const, "status");
      teamStore.updateApproval(id, { status, note: str(args.note) || "" }, str(args.idempotency_key));
      await teamStore.flush();
      return { ok: true, id, status };
    }

    default:
      throw new Error(`Unknown data op: ${op}`);
  }
}
