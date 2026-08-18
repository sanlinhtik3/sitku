import { useSyncExternalStore } from "react";
import type {
  TeamActivityEvent,
  TeamApproval,
  TeamAttachment,
  TeamAttendanceEntry,
  TeamCompensationPlan,
  TeamHealthWeights,
  TeamKpiMeasurement,
  TeamKpiMetric,
  TeamKpiPeriod,
  TeamKpiTarget,
  TeamLeaveRequest,
  TeamMember,
  TeamPayrollEntry,
  TeamPerformanceReview,
  TeamProject,
  TeamTask,
  TeamTaskPriority,
  TeamTaskStatus,
  TeamUnit,
  TeamWorkspaceState,
} from "@/repositories/contracts/team";
import { createTeamRepository } from "./teamRepository";

export type {
  TeamActivityEvent,
  TeamApproval,
  TeamAttachment,
  TeamAttendanceEntry,
  TeamCompensationPlan,
  TeamHealthWeights,
  TeamKpiMeasurement,
  TeamKpiMetric,
  TeamKpiPeriod,
  TeamKpiTarget,
  TeamLeaveRequest,
  TeamMember,
  TeamPayrollEntry,
  TeamPerformanceReview,
  TeamProject,
  TeamTask,
  TeamTaskPriority,
  TeamTaskStatus,
  TeamUnit,
  TeamWorkspaceState,
};

const LEGACY_KEY = "sitku.consultant.team.v1";
const DEFAULT_TEAM_ID = "team_default";
const DEFAULT_WEIGHTS: TeamHealthWeights = {
  delivery: 30,
  kpi: 25,
  workload: 20,
  review: 15,
  attendance: 10,
};
const listeners = new Set<() => void>();
const repository = createTeamRepository();
const uid = (prefix = "team") => crypto.randomUUID?.() || `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2)}`;
const now = () => new Date().toISOString();

function emptyState(): TeamWorkspaceState {
  const timestamp = now();
  return {
    schemaVersion: 2,
    company: {
      id: "company_default",
      name: "Sitku Company",
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Bangkok",
      createdAt: timestamp,
      updatedAt: timestamp,
    },
    teams: [{
      id: DEFAULT_TEAM_ID,
      companyId: "company_default",
      name: "Core Team",
      description: "Primary operating team",
      color: "#f4d35e",
      archived: false,
      createdAt: timestamp,
      updatedAt: timestamp,
    }],
    projects: [],
    members: [],
    tasks: [],
    comments: [],
    attachments: [],
    kpiTargets: [],
    kpiMeasurements: [],
    healthChecks: [],
    reviews: [],
    attendance: [],
    leaveRequests: [],
    compensationPlans: [],
    payrollEntries: [],
    approvals: [],
    reminders: [],
    activity: [],
    healthWeights: { ...DEFAULT_WEIGHTS },
  };
}

function legacyState(): TeamWorkspaceState | null {
  if (typeof localStorage === "undefined") return null;
  const payload = localStorage.getItem(LEGACY_KEY);
  if (!payload) return null;
  const parsed = JSON.parse(payload) as {
    members?: Array<Partial<TeamMember> & { id: string }>;
    tasks?: Array<Partial<TeamTask> & { id: string }>;
    kpiTargets?: Array<Partial<TeamKpiTarget> & { id: string }>;
  };
  localStorage.setItem(`${LEGACY_KEY}.migration-backup`, payload);
  const base = emptyState();
  const timestamp = now();
  base.members = (parsed.members || []).map((member) => ({
    id: member.id,
    teamIds: member.teamIds?.length ? member.teamIds : [DEFAULT_TEAM_ID],
    projectIds: member.projectIds || [],
    name: member.name || "Team member",
    role: member.role || "Team member",
    responsibilities: member.responsibilities || [],
    channels: member.channels || [],
    capacityHours: Number(member.capacityHours) || 40,
    availability: member.availability || "available",
    archived: Boolean(member.archived),
    createdAt: member.createdAt || timestamp,
    updatedAt: member.updatedAt || timestamp,
  }));
  base.tasks = (parsed.tasks || []).map((task) => ({
    id: task.id,
    teamId: task.teamId || DEFAULT_TEAM_ID,
    projectId: task.projectId || null,
    parentTaskId: task.parentTaskId || null,
    title: task.title || "Untitled task",
    description: task.description || "",
    ownerId: task.ownerId || null,
    reviewerId: task.reviewerId || null,
    status: task.status || "ready",
    priority: task.priority || "medium",
    dueAt: task.dueAt || null,
    reminderAt: task.reminderAt || null,
    channel: task.channel || "",
    plannedMinutes: Number(task.plannedMinutes) || 0,
    actualMinutes: Number(task.actualMinutes) || 0,
    progress: Number(task.progress) || 0,
    views: Number(task.views) || 0,
    engagementRate: Number(task.engagementRate) || 0,
    kpiPoints: Number(task.kpiPoints) || 0,
    recurrence: task.recurrence || "none",
    completedAt: task.completedAt || null,
    workType: task.workType || "general",
    platform: task.platform || "",
    postUrl: task.postUrl || "",
    postedAt: task.postedAt || null,
    likes: Number(task.likes) || 0,
    shares: Number(task.shares) || 0,
    comments: Number(task.comments) || 0,
    saves: Number(task.saves) || 0,
    createdAt: task.createdAt || timestamp,
    updatedAt: task.updatedAt || timestamp,
  }));
  base.kpiTargets = (parsed.kpiTargets || []).map((target) => ({
    id: target.id,
    scope: target.scope || (target.memberId ? "member" : "team"),
    scopeId: target.scopeId || target.memberId || DEFAULT_TEAM_ID,
    memberId: target.memberId || null,
    name: target.name || "KPI target",
    metric: target.metric || "tasks_completed",
    customMetricKey: target.customMetricKey || null,
    unit: target.unit || (String(target.metric).includes("rate") ? "%" : ""),
    direction: target.direction || "at_least",
    period: target.period || "monthly",
    target: Number(target.target) || 1,
    targetMax: target.targetMax || null,
    active: target.active !== false,
    createdAt: target.createdAt || timestamp,
    updatedAt: target.updatedAt || timestamp,
  }));
  base.activity.push({
    id: uid("activity"),
    entityType: "workspace",
    entityId: base.company.id,
    action: "migrated",
    summary: `Migrated ${base.members.length} members, ${base.tasks.length} tasks, and ${base.kpiTargets.length} KPI targets`,
    idempotencyKey: "legacy-v1-migration",
    createdAt: timestamp,
  });
  return base;
}

let state = (() => {
  try { return legacyState() || emptyState(); }
  catch (error) {
    console.warn("[teamStore] Legacy data could not be read; preserving it untouched", error);
    return emptyState();
  }
})();
let revision = 0;
let hydrated = false;
let dirtyBeforeHydrate = false;
let persistenceQueue: Promise<unknown> = Promise.resolve();

function emit() {
  listeners.forEach((listener) => listener());
}

function persist(snapshot: TeamWorkspaceState) {
  persistenceQueue = persistenceQueue.then(async () => {
    const envelope = await repository.save(snapshot, revision);
    revision = envelope.revision;
  }).catch((error) => {
    console.error("[teamStore] Save failed", error);
  });
}

function ensureWilliamTask() {
  let william = state.members.find((m) => m.name.toLowerCase() === "william" && !m.archived);
  if (!william) {
    const timestamp = now();
    william = {
      id: uid("member"),
      teamIds: [state.teams.find((t) => !t.archived)?.id || DEFAULT_TEAM_ID],
      projectIds: [],
      name: "William",
      role: "Content Creator",
      responsibilities: ["Facebook Content"],
      channels: ["facebook"],
      capacityHours: 40,
      availability: "available",
      archived: false,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    state.members.push(william);
  }
  const taskTitle = "ဘာလို့ မြန်မာတွေ Binance ကိုပဲ သုံးတာလဲ?";
  const taskUrl = "https://www.facebook.com/share/r/1LRQCMFi2q/?mibextid=wwXIfr";
  const existingTask = state.tasks.find((t) => t.title === taskTitle || t.postUrl === taskUrl);
  if (!existingTask) {
    const timestamp = now();
    const task: TeamTask = {
      id: uid("task"),
      teamId: william.teamIds[0] || DEFAULT_TEAM_ID,
      projectId: null,
      parentTaskId: null,
      title: taskTitle,
      description: "Facebook Reel Content",
      ownerId: william.id,
      reviewerId: william.id,
      status: "done",
      priority: "medium",
      dueAt: timestamp,
      reminderAt: null,
      channel: "facebook",
      plannedMinutes: 60,
      actualMinutes: 60,
      progress: 100,
      views: 1000,
      engagementRate: 2.7,
      kpiPoints: 10,
      recurrence: "none",
      completedAt: timestamp,
      workType: "content",
      platform: "facebook",
      postUrl: taskUrl,
      postedAt: timestamp.slice(0, 10),
      likes: 25,
      shares: 1,
      comments: 1,
      saves: 0,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    state.tasks.push(task);
  }
}

const readyPromise = (async () => {
  const envelope = await repository.load();
  if (dirtyBeforeHydrate) {
    hydrated = true;
    persist(state);
    return;
  }
  if (envelope) {
    state = envelope.state;
    revision = envelope.revision;
  } else {
    persist(state);
  }
  ensureWilliamTask();
  hydrated = true;
  emit();
})().catch((error) => {
  hydrated = true;
  console.error("[teamStore] Hydration failed; recovery state remains active", error);
  emit();
});

function activityEvent(entityType: string, entityId: string, action: string, summary: string, idempotencyKey?: string): TeamActivityEvent {
  return {
    id: uid("activity"),
    entityType,
    entityId,
    action,
    summary,
    idempotencyKey: idempotencyKey || null,
    createdAt: now(),
  };
}

function commit(next: TeamWorkspaceState, event?: TeamActivityEvent) {
  if (!hydrated) dirtyBeforeHydrate = true;
  state = event ? { ...next, activity: [...next.activity, event] } : next;
  emit();
  persist(state);
}

function duplicateAction(idempotencyKey?: string) {
  return Boolean(idempotencyKey && state.activity.some((event) => event.idempotencyKey === idempotencyKey));
}

function assertMember(id: string | null) {
  if (id && !state.members.some((member) => member.id === id && !member.archived)) throw new Error("Team member not found.");
}

function assertProject(id: string | null) {
  if (id && !state.projects.some((project) => project.id === id && !project.archived)) throw new Error("Project not found.");
}

export const teamStore = {
  getSnapshot: () => state,
  subscribe(listener: () => void) { listeners.add(listener); return () => listeners.delete(listener); },
  ready: () => readyPromise,
  flush: () => persistenceQueue.then(() => undefined),
  isReady: () => hydrated,
  async exportBackup() { await this.flush(); return repository.exportBackup(); },
  async importBackup(payload: string) {
    const envelope = await repository.importBackup(payload);
    state = envelope.state;
    revision = envelope.revision;
    emit();
    return envelope;
  },
  updateCompany(updates: Partial<TeamWorkspaceState["company"]>) {
    const company = { ...state.company, ...updates, updatedAt: now() };
    commit({ ...state, company }, activityEvent("company", company.id, "updated", `Updated ${company.name}`));
  },
  addTeam(input: Pick<TeamUnit, "name" | "description" | "color">, idempotencyKey?: string) {
    if (duplicateAction(idempotencyKey)) return null;
    const timestamp = now();
    const team: TeamUnit = {
      id: uid("team"), companyId: state.company.id, archived: false, ...input,
      createdAt: timestamp, updatedAt: timestamp,
    };
    commit({ ...state, teams: [...state.teams, team] }, activityEvent("team", team.id, "created", `Created team ${team.name}`, idempotencyKey));
    return team;
  },
  addProject(input: Pick<TeamProject, "teamId" | "name" | "description" | "status" | "ownerId" | "startAt" | "dueAt" | "color">, idempotencyKey?: string) {
    if (duplicateAction(idempotencyKey)) return null;
    assertMember(input.ownerId);
    const timestamp = now();
    const project: TeamProject = { id: uid("project"), archived: false, ...input, createdAt: timestamp, updatedAt: timestamp };
    commit({ ...state, projects: [...state.projects, project] }, activityEvent("project", project.id, "created", `Created project ${project.name}`, idempotencyKey));
    return project;
  },
  updateProject(id: string, updates: Partial<TeamProject>) {
    commit(
      { ...state, projects: state.projects.map((project) => project.id === id ? { ...project, ...updates, updatedAt: now() } : project) },
      activityEvent("project", id, "updated", "Updated project"),
    );
  },
  addMember(input: Pick<TeamMember, "name" | "role" | "responsibilities" | "channels" | "capacityHours"> & Partial<Pick<TeamMember, "teamIds" | "projectIds">>, idempotencyKey?: string) {
    if (duplicateAction(idempotencyKey)) return null;
    const timestamp = now();
    const member: TeamMember = {
      id: uid("member"),
      teamIds: input.teamIds?.length ? input.teamIds : [state.teams.find((team) => !team.archived)?.id || DEFAULT_TEAM_ID],
      projectIds: input.projectIds || [],
      name: input.name,
      role: input.role,
      responsibilities: input.responsibilities,
      channels: input.channels,
      capacityHours: input.capacityHours,
      availability: "available",
      archived: false,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    commit({ ...state, members: [...state.members, member] }, activityEvent("member", member.id, "created", `Added ${member.name}`, idempotencyKey));
    return member;
  },
  updateMember(id: string, updates: Partial<TeamMember>) {
    commit(
      { ...state, members: state.members.map((member) => member.id === id ? { ...member, ...updates, updatedAt: now() } : member) },
      activityEvent("member", id, "updated", "Updated member"),
    );
  },
  addTask(input: Pick<TeamTask, "title" | "ownerId" | "reviewerId" | "priority" | "dueAt" | "channel" | "plannedMinutes"> & Partial<Omit<TeamTask, "id" | "title" | "ownerId" | "reviewerId" | "priority" | "dueAt" | "channel" | "plannedMinutes" | "createdAt" | "updatedAt">>, idempotencyKey?: string) {
    if (duplicateAction(idempotencyKey)) return null;
    assertMember(input.ownerId);
    assertMember(input.reviewerId);
    assertProject(input.projectId || null);
    const timestamp = now();
    const task: TeamTask = {
      id: uid("task"),
      teamId: input.teamId || state.teams.find((team) => !team.archived)?.id || DEFAULT_TEAM_ID,
      projectId: input.projectId || null,
      parentTaskId: input.parentTaskId || null,
      title: input.title,
      description: input.description || "",
      ownerId: input.ownerId,
      reviewerId: input.reviewerId,
      status: input.status || "ready",
      priority: input.priority,
      dueAt: input.dueAt,
      reminderAt: input.reminderAt || null,
      channel: input.channel,
      plannedMinutes: input.plannedMinutes,
      actualMinutes: input.actualMinutes || 0,
      progress: input.progress || 0,
      views: input.views || 0,
      engagementRate: input.engagementRate || 0,
      kpiPoints: input.kpiPoints || 0,
      recurrence: input.recurrence || "none",
      completedAt: input.completedAt || null,
      workType: input.workType || "general",
      platform: input.platform || "",
      postUrl: input.postUrl || "",
      postedAt: input.postedAt || null,
      likes: input.likes || 0,
      shares: input.shares || 0,
      comments: input.comments || 0,
      saves: input.saves || 0,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    const reminder = task.reminderAt ? {
      id: uid("reminder"),
      taskId: task.id,
      title: task.title,
      remindAt: task.reminderAt,
      dismissedAt: null,
      createdAt: timestamp,
    } : null;
    commit(
      {
        ...state,
        tasks: [...state.tasks, task],
        reminders: reminder ? [...state.reminders, reminder] : state.reminders,
      },
      activityEvent("task", task.id, "created", `Created task ${task.title}`, idempotencyKey),
    );
    return task;
  },
  updateTask(id: string, updates: Partial<TeamTask>, idempotencyKey?: string) {
    if (duplicateAction(idempotencyKey)) return;
    const timestamp = now();
    commit(
      {
        ...state,
        tasks: state.tasks.map((task) => task.id === id ? {
          ...task,
          ...updates,
          completedAt: updates.status === "done" ? task.completedAt || timestamp : updates.status ? null : task.completedAt,
          updatedAt: timestamp,
        } : task),
      },
      activityEvent("task", id, "updated", "Updated task", idempotencyKey),
    );
  },
  addComment(taskId: string, body: string, idempotencyKey?: string) {
    if (duplicateAction(idempotencyKey)) return null;
    if (!state.tasks.some((task) => task.id === taskId)) throw new Error("Task not found.");
    const timestamp = now();
    const comment = { id: uid("comment"), taskId, body: body.trim(), createdAt: timestamp, updatedAt: timestamp };
    commit({ ...state, comments: [...state.comments, comment] }, activityEvent("comment", comment.id, "created", "Added task comment", idempotencyKey));
    return comment;
  },
  async addAttachment(taskId: string, file: File, idempotencyKey?: string) {
    if (duplicateAction(idempotencyKey)) return null;
    if (!state.tasks.some((task) => task.id === taskId)) throw new Error("Task not found.");
    const id = uid("attachment");
    const saved = await repository.putAttachment({
      id,
      name: file.name,
      mediaType: file.type || "application/octet-stream",
      data: await file.arrayBuffer(),
    });
    const attachment: TeamAttachment = {
      id,
      taskId,
      reviewId: null,
      payrollEntryId: null,
      name: file.name,
      mediaType: file.type || "application/octet-stream",
      size: saved.size,
      storageKey: saved.storageKey,
      createdAt: now(),
    };
    commit(
      { ...state, attachments: [...state.attachments, attachment] },
      activityEvent("attachment", attachment.id, "created", `Attached ${attachment.name}`, idempotencyKey),
    );
    await this.flush();
    return attachment;
  },
  async openAttachment(id: string) {
    const attachment = state.attachments.find((item) => item.id === id);
    if (!attachment) throw new Error("Attachment not found.");
    const data = await repository.getAttachment(attachment.storageKey);
    if (!data) throw new Error("Attachment file is unavailable.");
    const url = URL.createObjectURL(new Blob([data], { type: attachment.mediaType }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = attachment.name;
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
  },
  async deleteAttachment(id: string) {
    const attachment = state.attachments.find((item) => item.id === id);
    if (!attachment) return;
    await repository.deleteAttachment(attachment.storageKey);
    commit(
      { ...state, attachments: state.attachments.filter((item) => item.id !== id) },
      activityEvent("attachment", attachment.id, "deleted", `Removed ${attachment.name}`),
    );
  },
  addKpiTarget(input: Pick<TeamKpiTarget, "memberId" | "name" | "metric" | "period" | "target"> & Partial<Omit<TeamKpiTarget, "id" | "memberId" | "name" | "metric" | "period" | "target" | "createdAt" | "updatedAt">>, idempotencyKey?: string) {
    if (duplicateAction(idempotencyKey)) return null;
    assertMember(input.memberId);
    const timestamp = now();
    const target: TeamKpiTarget = {
      id: uid("kpi"),
      scope: input.scope || (input.memberId ? "member" : "team"),
      scopeId: input.scopeId || input.memberId || state.teams.find((team) => !team.archived)?.id || DEFAULT_TEAM_ID,
      memberId: input.memberId,
      name: input.name,
      metric: input.metric,
      customMetricKey: input.customMetricKey || null,
      unit: input.unit || (String(input.metric).includes("rate") ? "%" : ""),
      direction: input.direction || "at_least",
      period: input.period,
      target: input.target,
      targetMax: input.targetMax || null,
      active: input.active !== false,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    commit({ ...state, kpiTargets: [...state.kpiTargets, target] }, activityEvent("kpi", target.id, "created", `Created KPI ${target.name}`, idempotencyKey));
    return target;
  },
  updateKpiTarget(id: string, updates: Partial<TeamKpiTarget>) {
    commit(
      { ...state, kpiTargets: state.kpiTargets.map((target) => target.id === id ? { ...target, ...updates, updatedAt: now() } : target) },
      activityEvent("kpi", id, "updated", "Updated KPI target"),
    );
  },
  addKpiMeasurement(input: Omit<TeamKpiMeasurement, "id" | "createdAt">, idempotencyKey?: string) {
    if (duplicateAction(idempotencyKey)) return null;
    const measurement: TeamKpiMeasurement = { id: uid("measurement"), ...input, createdAt: now() };
    commit({ ...state, kpiMeasurements: [...state.kpiMeasurements, measurement] }, activityEvent("kpi_measurement", measurement.id, "created", "Recorded KPI measurement", idempotencyKey));
    return measurement;
  },
  addAttendance(input: Omit<TeamAttendanceEntry, "id" | "createdAt" | "updatedAt">, idempotencyKey?: string) {
    if (duplicateAction(idempotencyKey)) return null;
    assertMember(input.memberId);
    const timestamp = now();
    const entry: TeamAttendanceEntry = { id: uid("attendance"), ...input, createdAt: timestamp, updatedAt: timestamp };
    commit({ ...state, attendance: [...state.attendance, entry] }, activityEvent("attendance", entry.id, "created", "Recorded attendance", idempotencyKey));
    return entry;
  },
  addLeave(input: Omit<TeamLeaveRequest, "id" | "createdAt" | "updatedAt">, idempotencyKey?: string) {
    if (duplicateAction(idempotencyKey)) return null;
    assertMember(input.memberId);
    const timestamp = now();
    const leave: TeamLeaveRequest = { id: uid("leave"), ...input, createdAt: timestamp, updatedAt: timestamp };
    const approval: TeamApproval = {
      id: uid("approval"),
      type: "leave",
      subjectId: leave.id,
      title: `Leave request · ${state.members.find((member) => member.id === input.memberId)?.name || "Member"}`,
      status: "pending",
      note: input.note,
      decidedAt: null,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    commit(
      { ...state, leaveRequests: [...state.leaveRequests, leave], approvals: [...state.approvals, approval] },
      activityEvent("leave", leave.id, "created", "Recorded leave request for CEO approval", idempotencyKey),
    );
    return leave;
  },
  addReview(input: Omit<TeamPerformanceReview, "id" | "createdAt" | "updatedAt">, idempotencyKey?: string) {
    if (duplicateAction(idempotencyKey)) return null;
    assertMember(input.memberId);
    const timestamp = now();
    const review: TeamPerformanceReview = { id: uid("review"), ...input, createdAt: timestamp, updatedAt: timestamp };
    commit({ ...state, reviews: [...state.reviews, review] }, activityEvent("review", review.id, "created", "Recorded performance review", idempotencyKey));
    return review;
  },
  addCompensationPlan(input: Omit<TeamCompensationPlan, "id" | "createdAt" | "updatedAt">) {
    assertMember(input.memberId);
    const timestamp = now();
    const plan: TeamCompensationPlan = { id: uid("compensation"), ...input, createdAt: timestamp, updatedAt: timestamp };
    commit({ ...state, compensationPlans: [...state.compensationPlans, plan] }, activityEvent("compensation", plan.id, "created", "Added compensation plan"));
    return plan;
  },
  addPayrollEntry(input: Omit<TeamPayrollEntry, "id" | "createdAt" | "updatedAt">, idempotencyKey?: string) {
    if (duplicateAction(idempotencyKey)) return null;
    assertMember(input.memberId);
    const timestamp = now();
    const entry: TeamPayrollEntry = { id: uid("payroll"), ...input, createdAt: timestamp, updatedAt: timestamp };
    const approval: TeamApproval = {
      id: uid("approval"),
      type: "payroll",
      subjectId: entry.id,
      title: `Payroll ${entry.period} · ${state.members.find((member) => member.id === input.memberId)?.name || "Member"}`,
      status: "pending",
      note: input.note,
      decidedAt: null,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    commit(
      { ...state, payrollEntries: [...state.payrollEntries, entry], approvals: [...state.approvals, approval] },
      activityEvent("payroll", entry.id, "created", "Added payroll entry for CEO approval", idempotencyKey),
    );
    return entry;
  },
  addApproval(input: Omit<TeamApproval, "id" | "createdAt" | "updatedAt">) {
    const timestamp = now();
    const approval: TeamApproval = { id: uid("approval"), ...input, createdAt: timestamp, updatedAt: timestamp };
    commit({ ...state, approvals: [...state.approvals, approval] }, activityEvent("approval", approval.id, "created", `Created approval ${approval.title}`));
    return approval;
  },
  updateApproval(id: string, updates: Partial<TeamApproval>, idempotencyKey?: string) {
    if (duplicateAction(idempotencyKey)) return;
    const current = state.approvals.find((approval) => approval.id === id);
    if (!current) throw new Error("Approval not found.");
    const decided = updates.status && ["approved", "rejected"].includes(updates.status);
    const updatedAt = now();
    commit(
      {
        ...state,
        approvals: state.approvals.map((approval) => approval.id === id ? {
          ...approval,
          ...updates,
          decidedAt: decided ? updatedAt : approval.decidedAt,
          updatedAt,
        } : approval),
        leaveRequests: current.type === "leave" && decided
          ? state.leaveRequests.map((leave) => leave.id === current.subjectId ? {
              ...leave,
              status: updates.status as "approved" | "rejected",
              updatedAt,
            } : leave)
          : state.leaveRequests,
      },
      activityEvent("approval", id, "decided", `${updates.status === "approved" ? "Approved" : updates.status === "rejected" ? "Rejected" : "Updated"} ${current.title}`, idempotencyKey),
    );
  },
  updateHealthWeights(weights: TeamHealthWeights) {
    const total = Object.values(weights).reduce((sum, value) => sum + value, 0);
    if (Math.round(total) !== 100) throw new Error("Health weights must total 100.");
    commit({ ...state, healthWeights: weights }, activityEvent("workspace", state.company.id, "health_weights_updated", "Updated health score weights"));
  },
};

export function useTeamState() {
  return useSyncExternalStore(teamStore.subscribe, teamStore.getSnapshot, teamStore.getSnapshot);
}

export function memberMetrics(member: TeamMember, tasks: TeamTask[]) {
  const owned = tasks.filter((task) => task.ownerId === member.id && task.status !== "cancelled");
  const done = owned.filter((task) => task.status === "done");
  const overdue = owned.filter((task) => !["done", "cancelled"].includes(task.status) && task.dueAt && new Date(task.dueAt).getTime() < Date.now()).length;
  const onTime = done.filter((task) => !task.dueAt || new Date(task.completedAt || task.updatedAt) <= new Date(task.dueAt)).length;
  const completion = owned.length ? (done.length / owned.length) * 100 : 0;
  const onTimeRate = done.length ? (onTime / done.length) * 100 : 0;
  const impact = done.length ? done.reduce((sum, task) => sum + Math.min(100, task.engagementRate * 10 + Math.log10(Math.max(1, task.views)) * 12), 0) / done.length : 0;
  const delivery = completion * .55 + onTimeRate * .45;
  return {
    owned,
    active: owned.filter((task) => ["ready", "in_progress", "blocked", "review"].includes(task.status)).length,
    blocked: owned.filter((task) => task.status === "blocked").length,
    overdue,
    completion,
    onTimeRate,
    delivery,
    impact,
    kpi: Math.round(delivery * .6 + impact * .4),
  };
}

export function taskInPeriod(task: TeamTask, period: TeamKpiPeriod, date = new Date()) {
  const completed = new Date(task.completedAt || task.updatedAt);
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  if (period === "weekly") start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
  if (period === "monthly") start.setDate(1);
  if (period === "quarterly") start.setMonth(Math.floor(start.getMonth() / 3) * 3, 1);
  return task.status === "done" && completed >= start && completed <= date;
}

export function kpiActual(target: TeamKpiTarget, tasks: TeamTask[], measurements: TeamKpiMeasurement[] = []) {
  if (target.metric === "custom") {
    const rows = measurements.filter((measurement) => measurement.targetId === target.id);
    return rows.length ? rows[rows.length - 1].value : 0;
  }
  const relevant = tasks.filter((task) =>
    (!target.memberId || task.ownerId === target.memberId) &&
    (target.scope !== "project" || task.projectId === target.scopeId) &&
    taskInPeriod(task, target.period)
  );
  if (target.metric === "tasks_completed") return relevant.length;
  if (target.metric === "kpi_points") return relevant.reduce((sum, task) => sum + (task.kpiPoints || 0), 0);
  if (target.metric === "views") return relevant.reduce((sum, task) => sum + (task.views || 0), 0);
  if (target.metric === "engagement_rate") return relevant.length ? relevant.reduce((sum, task) => sum + (task.engagementRate || 0), 0) / relevant.length : 0;
  const onTime = relevant.filter((task) => !task.dueAt || new Date(task.completedAt || task.updatedAt) <= new Date(task.dueAt)).length;
  return relevant.length ? (onTime / relevant.length) * 100 : 0;
}

export function kpiAttainment(target: TeamKpiTarget, actual: number) {
  if (target.direction === "at_most") return actual <= target.target ? 100 : Math.max(0, target.target / Math.max(actual, 1) * 100);
  if (target.direction === "range") {
    if (actual >= target.target && actual <= (target.targetMax ?? target.target)) return 100;
    const boundary = actual < target.target ? target.target : target.targetMax || target.target;
    return Math.max(0, 100 - Math.abs(actual - boundary) / Math.max(Math.abs(boundary), 1) * 100);
  }
  return target.target > 0 ? actual / target.target * 100 : 0;
}

export function calculateTeamHealth(workspace: TeamWorkspaceState) {
  const activeMembers = workspace.members.filter((member) => !member.archived);
  const activeTasks = workspace.tasks.filter((task) => task.status !== "cancelled");
  const done = activeTasks.filter((task) => task.status === "done");
  const onTime = done.filter((task) => !task.dueAt || new Date(task.completedAt || task.updatedAt) <= new Date(task.dueAt));
  const completion = activeTasks.length ? done.length / activeTasks.length * 100 : null;
  const onTimeRate = done.length ? onTime.length / done.length * 100 : null;
  const delivery = completion === null ? null : completion * .55 + (onTimeRate ?? completion) * .45;
  const activeTargets = workspace.kpiTargets.filter((target) => target.active);
  const kpi = activeTargets.length
    ? activeTargets.reduce((sum, target) => sum + Math.min(100, kpiAttainment(target, kpiActual(target, workspace.tasks, workspace.kpiMeasurements))), 0) / activeTargets.length
    : null;
  const loads = activeMembers.map((member) => {
    const minutes = workspace.tasks
      .filter((task) => task.ownerId === member.id && ["ready", "in_progress", "blocked", "review"].includes(task.status))
      .reduce((sum, task) => sum + task.plannedMinutes, 0);
    return minutes / Math.max(1, member.capacityHours * 60) * 100;
  });
  const workload = loads.length
    ? loads.reduce((sum, load) => sum + (load <= 100 ? Math.max(55, 100 - Math.abs(75 - load) * .6) : Math.max(0, 100 - (load - 100) * 2)), 0) / loads.length
    : null;
  const finalReviews = workspace.reviews.filter((review) => review.status === "final");
  const review = finalReviews.length ? finalReviews.reduce((sum, item) => sum + item.score, 0) / finalReviews.length : null;
  const attendanceRows = workspace.attendance.filter((entry) => entry.status !== "leave");
  const attendance = attendanceRows.length
    ? attendanceRows.filter((entry) => entry.status === "present" || entry.status === "remote").length / attendanceRows.length * 100
    : null;
  const pillars = { delivery, kpi, workload, review, attendance };
  let weighted = 0;
  let availableWeight = 0;
  for (const key of Object.keys(workspace.healthWeights) as Array<keyof TeamHealthWeights>) {
    const value = pillars[key];
    if (value === null) continue;
    weighted += Math.max(0, Math.min(100, value)) * workspace.healthWeights[key];
    availableWeight += workspace.healthWeights[key];
  }
  const score = availableWeight >= 50 ? Math.round(weighted / availableWeight) : null;
  return {
    score,
    status: score === null ? "needs_data" as const : score >= 75 ? "healthy" as const : score >= 50 ? "at_risk" as const : "critical" as const,
    pillars,
    availableWeight,
  };
}

export function projectHealth(project: TeamProject, tasks: TeamTask[]) {
  const projectTasks = tasks.filter((task) => task.projectId === project.id && task.status !== "cancelled");
  if (!projectTasks.length) return null;
  const done = projectTasks.filter((task) => task.status === "done").length;
  const blocked = projectTasks.filter((task) => task.status === "blocked").length;
  const overdue = projectTasks.filter((task) => task.status !== "done" && task.dueAt && new Date(task.dueAt) < new Date()).length;
  return Math.max(0, Math.round(done / projectTasks.length * 100 - blocked * 8 - overdue * 6));
}
