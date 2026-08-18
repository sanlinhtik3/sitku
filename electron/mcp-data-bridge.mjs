// Finance, consultant, and team MCP tools. That data lives in the RENDERER's local stores
// (IndexedDB/localStorage), which the Electron main process can't read directly. So each of
// these tools round-trips to the renderer over IPC: main sends { id, op, args } → the renderer runs
// the query against IndexedDB (src/lib/mcp/mcpDataBridge.ts) → replies { id, ok, result|error }.
//
// Consequence: these tools only work while a Sitku window is open (notes tools don't need one — they
// read files in main). If no window, the call rejects with a clear "open the app" message.

let getWebContents = () => null;
let counter = 1;
const pending = new Map();

export function setWebContentsGetter(fn) { getWebContents = fn; }

// Wired to ipcMain.on("beebot:mcp-data-reply") in main.mjs.
export function handleReply(payload) {
  const p = payload && pending.get(payload.id);
  if (!p) return;
  pending.delete(payload.id);
  clearTimeout(p.timer);
  if (payload.ok) p.resolve(payload.result);
  else p.reject(new Error(payload.error || "data bridge error"));
}

function callRenderer(op, args, timeoutMs = 8000) {
  const wc = getWebContents();
  if (!wc) return Promise.reject(new Error("Sitku app window is not open — Personal CFO, Consultant, and Team data need the app running."));
  const id = counter++;
  wc.send("beebot:mcp-data-request", { id, op, args: args || {} });
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      if (pending.has(id)) { pending.delete(id); reject(new Error("data bridge timeout — the app window may be busy or closed.")); }
    }, timeoutMs);
    pending.set(id, { resolve, reject, timer });
  });
}

// tool name === renderer op name.
const tool = (name, description, properties, required) => ({
  name, description,
  inputSchema: { type: "object", properties: properties || {}, ...(required ? { required } : {}) },
  run: (args) => callRenderer(name, args),
});

const YMD = { type: "string", description: "date as YYYY-MM-DD" };
const IDEMPOTENCY = { type: "string", description: "Stable unique key for retry-safe writes." };

export const DATA_TOOLS = [
  // ── Personal CFO (financeStore) ──
  tool("finance_summary",
    "Personal CFO: total income, expense and net over a date range (defaults to the last 90 days). Use before answering money questions.",
    { from: YMD, to: YMD }),
  tool("finance_list_transactions",
    "Personal CFO: recent transactions, newest first. Optionally filter by type and date range.",
    { from: YMD, to: YMD, type: { type: "string", enum: ["income", "expense"] }, limit: { type: "number", description: "default 50" } }),
  tool("finance_add_transaction",
    "Personal CFO: record an income or expense. `category` matches an existing category by name when possible.",
    { type: { type: "string", enum: ["income", "expense"] }, amount: { type: "number" }, category: { type: "string" }, date: YMD, description: { type: "string" }, source: { type: "string", description: "income source label" }, idempotency_key: IDEMPOTENCY },
    ["type", "amount"]),
  tool("finance_update_transaction",
    "Personal CFO: update an existing transaction by id.",
    { id: { type: "string" }, amount: { type: "number" }, category: { type: "string" }, date: YMD, description: { type: "string" }, idempotency_key: IDEMPOTENCY },
    ["id"]),
  tool("finance_subscriptions", "Personal CFO: list active subscriptions.", {}),

  // ── Agent Consultant (consultantStore) ──
  tool("consultant_summary",
    "Agent Consultant: content dashboard — posts, views, engagement, followers, and per-platform breakdown over a range (defaults to the last 90 days).",
    { from: YMD, to: YMD }),
  tool("consultant_list_posts",
    "Agent Consultant: recent content posts with their metrics (views, likes, comments, shares, saves).",
    { limit: { type: "number", description: "default 50" } }),
  tool("consultant_top_posts",
    "Agent Consultant: top-performing posts by a metric over a range.",
    { from: YMD, to: YMD, metric: { type: "string", enum: ["engagement", "views"] }, limit: { type: "number", description: "default 5" } }),
  tool("consultant_add_revenue",
    "Agent Consultant: log a revenue entry (USDT). `source` is an income-source label (e.g. sponsorship, affiliate).",
    { amount: { type: "number" }, source: { type: "string" }, date: YMD, description: { type: "string" }, idempotency_key: IDEMPOTENCY },
    ["amount"]),
  tool("consultant_add_expense", "Agent Consultant: log an expense entry (USDT).",
    { amount: { type: "number" }, category: { type: "string" }, date: YMD, description: { type: "string" }, idempotency_key: IDEMPOTENCY }, ["amount", "category"]),
  tool("consultant_add_post", "Agent Consultant: create a social content post record.",
    { platform: { type: "string", enum: ["youtube", "instagram", "tiktok", "facebook", "telegram", "linkedin", "x", "threads", "podcast", "newsletter", "other"] }, post_name: { type: "string" }, post_url: { type: "string" }, posted_at: YMD, notes: { type: "string" }, idempotency_key: IDEMPOTENCY }, ["platform", "post_name"]),
  tool("consultant_update_post_metrics", "Agent Consultant: update views, likes, comments, shares, saves, and reach for one post.",
    { id: { type: "string" }, views: { type: "number" }, likes: { type: "number" }, comments: { type: "number" }, shares: { type: "number" }, saves: { type: "number" }, reach: { type: "number" }, idempotency_key: IDEMPOTENCY }, ["id"]),

  // ── Local CEO Team OS (teamStore) ──
  tool("team_overview", "Team OS: company, teams, projects, workload, task flow, approvals, KPI attainment, and transparent health score.", {}),
  tool("team_list_members", "Team OS: list members with monthly performance metrics.", {}),
  tool("team_list_tasks", "Team OS: list tasks. Optionally filter by owner or status.",
    { owner_id: { type: "string" }, status: { type: "string" }, limit: { type: "number" } }),
  tool("team_list_projects", "Team OS: list projects with task counts and delivery health.", {}),
  tool("team_health", "Team OS: weighted team health score, pillar coverage, and configured weights.", {}),
  tool("team_kpi_status", "Team OS: list active KPI targets with actual values and direction-aware attainment.", {}),
  tool("team_list_reviews", "Team OS: list performance reviews, optionally for one member.", { member_id: { type: "string" } }),
  tool("team_list_attendance", "Team OS: list attendance and leave records.", { member_id: { type: "string" }, from: YMD, to: YMD }),
  tool("team_list_payroll", "Team OS: list local compensation and payroll ledger records.", { member_id: { type: "string" }, period: { type: "string", description: "YYYY-MM" } }),
  tool("team_list_approvals", "Team OS: list CEO approval records.", { status: { type: "string", enum: ["draft", "pending", "approved", "rejected"] } }),
  tool("team_activity", "Team OS: append-only operating activity history.", { limit: { type: "number", description: "default 100" } }),
  tool("team_add_member", "Team OS: add a member with role, responsibilities, channels, and weekly capacity.",
    { name: { type: "string" }, role: { type: "string" }, responsibilities: { type: "array", items: { type: "string" } }, channels: { type: "array", items: { type: "string" } }, capacity_hours: { type: "number" }, idempotency_key: IDEMPOTENCY }, ["name", "role", "idempotency_key"]),
  tool("team_add_project", "Team OS: create a project inside a team.",
    { team_id: { type: "string" }, name: { type: "string" }, description: { type: "string" }, status: { type: "string", enum: ["planned", "active", "at_risk", "paused", "completed"] }, owner_id: { type: "string" }, start_at: YMD, due_at: YMD, color: { type: "string" }, idempotency_key: IDEMPOTENCY }, ["name", "idempotency_key"]),
  tool("team_add_task", "Team OS: assign a task or social post to a member and project.",
    { title: { type: "string" }, description: { type: "string" }, project_id: { type: "string" }, owner_id: { type: "string" }, reviewer_id: { type: "string" }, status: { type: "string", enum: ["backlog", "ready", "in_progress", "blocked", "review", "done", "cancelled"] }, priority: { type: "string", enum: ["low", "medium", "high", "urgent"] }, due_at: { type: "string" }, reminder_at: { type: "string" }, channel: { type: "string" }, planned_minutes: { type: "number" }, work_type: { type: "string", enum: ["general", "social_post"] }, platform: { type: "string" }, post_url: { type: "string" }, posted_at: { type: "string" }, idempotency_key: IDEMPOTENCY }, ["title", "idempotency_key"]),
  tool("team_update_task", "Team OS: update task status, progress, work time, social metrics, and KPI points.",
    { id: { type: "string" }, status: { type: "string", enum: ["backlog", "ready", "in_progress", "blocked", "review", "done", "cancelled"] }, progress: { type: "number" }, actual_minutes: { type: "number" }, views: { type: "number" }, engagement_rate: { type: "number" }, likes: { type: "number" }, shares: { type: "number" }, comments: { type: "number" }, saves: { type: "number" }, kpi_points: { type: "number" }, idempotency_key: IDEMPOTENCY }, ["id", "idempotency_key"]),
  tool("team_add_kpi", "Team OS: create a daily, weekly, monthly, or quarterly KPI target.",
    { member_id: { type: "string" }, name: { type: "string" }, metric: { type: "string", enum: ["tasks_completed", "kpi_points", "on_time_rate", "views", "engagement_rate", "custom"] }, period: { type: "string", enum: ["daily", "weekly", "monthly", "quarterly"] }, direction: { type: "string", enum: ["at_least", "at_most", "range"] }, target: { type: "number" }, target_max: { type: "number" }, unit: { type: "string" }, idempotency_key: IDEMPOTENCY }, ["name", "metric", "period", "target", "idempotency_key"]),
  tool("team_record_kpi", "Team OS: record an explicit KPI measurement.", { target_id: { type: "string" }, value: { type: "number" }, measured_at: { type: "string" }, note: { type: "string" }, idempotency_key: IDEMPOTENCY }, ["target_id", "value", "idempotency_key"]),
  tool("team_add_comment", "Team OS: add a CEO comment to a task.", { task_id: { type: "string" }, body: { type: "string" }, idempotency_key: IDEMPOTENCY }, ["task_id", "body", "idempotency_key"]),
  tool("team_add_attendance", "Team OS: record manual attendance.", { member_id: { type: "string" }, date: YMD, status: { type: "string", enum: ["present", "remote", "leave", "absent"] }, minutes: { type: "number" }, note: { type: "string" }, idempotency_key: IDEMPOTENCY }, ["member_id", "date", "status", "idempotency_key"]),
  tool("team_add_leave", "Team OS: create a leave record for CEO approval.", { member_id: { type: "string" }, start_date: YMD, end_date: YMD, type: { type: "string", enum: ["annual", "sick", "personal", "other"] }, note: { type: "string" }, idempotency_key: IDEMPOTENCY }, ["member_id", "start_date", "end_date", "type", "idempotency_key"]),
  tool("team_add_review", "Team OS: record a performance review.", { member_id: { type: "string" }, period_start: YMD, period_end: YMD, score: { type: "number" }, strengths: { type: "string" }, improvements: { type: "string" }, next_actions: { type: "string" }, idempotency_key: IDEMPOTENCY }, ["member_id", "period_start", "period_end", "score", "idempotency_key"]),
  tool("team_add_payroll", "Team OS: add a local compensation ledger entry for CEO approval.", { member_id: { type: "string" }, period: { type: "string", description: "YYYY-MM" }, currency: { type: "string" }, salary: { type: "number" }, bonus: { type: "number" }, deduction: { type: "number" }, note: { type: "string" }, idempotency_key: IDEMPOTENCY }, ["member_id", "period", "currency", "idempotency_key"]),
  tool("team_update_approval", "Team OS: approve or reject a pending CEO decision.", { id: { type: "string" }, status: { type: "string", enum: ["approved", "rejected"] }, note: { type: "string" }, idempotency_key: IDEMPOTENCY }, ["id", "status", "idempotency_key"]),
];
