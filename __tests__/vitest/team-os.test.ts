import { afterEach, describe, expect, it, vi } from "vitest";

function storage(seed: Record<string, string> = {}) {
  const values = new Map(Object.entries(seed));
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, String(value)); },
    removeItem: (key: string) => { values.delete(key); },
    clear: () => values.clear(),
    key: (index: number) => [...values.keys()][index] ?? null,
    get length() { return values.size; },
  };
}

async function loadStore(seed: Record<string, string> = {}) {
  vi.resetModules();
  const localStorage = storage(seed);
  vi.stubGlobal("localStorage", localStorage);
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
  const module = await import("../../src/repositories/local/teamStore");
  await module.teamStore.ready();
  await module.teamStore.flush();
  return { ...module, localStorage };
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("Team OS production domain", () => {
  it("migrates legacy records without deleting the source and keeps a byte-for-byte backup", async () => {
    const legacy = JSON.stringify({
      members: [{ id: "member_1", name: "Zoe", role: "CEO", capacityHours: 40 }],
      tasks: [{ id: "task_1", title: "Launch", ownerId: "member_1", status: "ready" }],
      kpiTargets: [{ id: "kpi_1", memberId: "member_1", name: "Ship", metric: "tasks_completed", period: "monthly", target: 1 }],
    });
    const { teamStore, localStorage } = await loadStore({ "sitku.consultant.team.v1": legacy });
    const state = teamStore.getSnapshot();

    expect(state.schemaVersion).toBe(2);
    expect(state.members[0]).toMatchObject({ id: "member_1", name: "Zoe" });
    expect(state.tasks[0]).toMatchObject({ id: "task_1", teamId: "team_default" });
    expect(state.activity.some((event) => event.idempotencyKey === "legacy-v1-migration")).toBe(true);
    expect(localStorage.getItem("sitku.consultant.team.v1")).toBe(legacy);
    expect(localStorage.getItem("sitku.consultant.team.v1.migration-backup")).toBe(legacy);
  });

  it("deduplicates writes and creates an atomic CEO approval for leave", async () => {
    const { teamStore } = await loadStore();
    const member = teamStore.addMember({
      name: "Moe",
      role: "Editor",
      responsibilities: ["Publishing"],
      channels: ["YouTube"],
      capacityHours: 40,
    }, "member-moe");
    expect(member).not.toBeNull();
    expect(teamStore.addMember({
      name: "Moe duplicate",
      role: "Editor",
      responsibilities: [],
      channels: [],
      capacityHours: 40,
    }, "member-moe")).toBeNull();

    const leave = teamStore.addLeave({
      memberId: member!.id,
      startDate: "2026-07-27",
      endDate: "2026-07-28",
      type: "annual",
      status: "pending",
      note: "Family",
    }, "leave-1");
    expect(leave).not.toBeNull();
    expect(teamStore.addLeave({
      memberId: member!.id,
      startDate: "2026-07-27",
      endDate: "2026-07-28",
      type: "annual",
      status: "pending",
      note: "Family",
    }, "leave-1")).toBeNull();

    const pending = teamStore.getSnapshot().approvals.find((approval) => approval.subjectId === leave!.id);
    expect(pending).toMatchObject({ type: "leave", status: "pending" });
    teamStore.updateApproval(pending!.id, { status: "approved" }, "approve-leave-1");
    expect(teamStore.getSnapshot().leaveRequests.find((item) => item.id === leave!.id)?.status).toBe("approved");
    await teamStore.flush();
  });

  it("uses direction-aware KPI scoring and excludes missing health pillars", async () => {
    const { kpiAttainment, calculateTeamHealth, teamStore } = await loadStore();
    const base = teamStore.getSnapshot();
    const target = {
      id: "kpi",
      scope: "team" as const,
      scopeId: "team_default",
      memberId: null,
      name: "Cost per view",
      metric: "custom" as const,
      customMetricKey: "cpv",
      unit: "USDT",
      direction: "at_most" as const,
      period: "monthly" as const,
      target: 2,
      targetMax: null,
      active: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    expect(kpiAttainment(target, 1.5)).toBe(100);
    expect(kpiAttainment(target, 4)).toBe(50);
    const health = calculateTeamHealth({ ...base, kpiTargets: [], tasks: [], reviews: [], attendance: [] });
    expect(health.score).toBeNull();
    expect(health.status).toBe("needs_data");
    expect(health.availableWeight).toBeLessThan(50);
  });

  it("keeps 250 members, 100 projects, and 10,000 tasks within the local computation budget", async () => {
    const { calculateTeamHealth, projectHealth, teamStore } = await loadStore();
    const base = teamStore.getSnapshot();
    const stamp = new Date().toISOString();
    const members = Array.from({ length: 250 }, (_, index) => ({
      id: `m${index}`, teamIds: ["team_default"], projectIds: [], name: `Member ${index}`, role: "Operator",
      responsibilities: [], channels: [], capacityHours: 40, availability: "available" as const, archived: false,
      createdAt: stamp, updatedAt: stamp,
    }));
    const projects = Array.from({ length: 100 }, (_, index) => ({
      id: `p${index}`, teamId: "team_default", name: `Project ${index}`, description: "", status: "active" as const,
      ownerId: members[index % members.length].id, startAt: null, dueAt: null, color: "#fff", archived: false,
      createdAt: stamp, updatedAt: stamp,
    }));
    const tasks = Array.from({ length: 10_000 }, (_, index) => ({
      id: `t${index}`, teamId: "team_default", projectId: projects[index % projects.length].id, parentTaskId: null,
      title: `Task ${index}`, description: "", ownerId: members[index % members.length].id, reviewerId: null,
      status: index % 3 === 0 ? "done" as const : "ready" as const, priority: "medium" as const, dueAt: null,
      reminderAt: null, channel: "", plannedMinutes: 30, actualMinutes: 0, progress: index % 3 === 0 ? 100 : 0,
      views: 0, engagementRate: 0, kpiPoints: 0, recurrence: "none" as const,
      completedAt: index % 3 === 0 ? stamp : null, workType: "general" as const, platform: "", postUrl: "",
      postedAt: null, likes: 0, shares: 0, comments: 0, saves: 0, createdAt: stamp, updatedAt: stamp,
    }));
    const workspace = { ...base, members, projects, tasks };
    const started = performance.now();
    const health = calculateTeamHealth(workspace);
    const projectScores = projects.map((project) => projectHealth(project, tasks));
    const elapsed = performance.now() - started;

    expect(health.score).not.toBeNull();
    expect(projectScores).toHaveLength(100);
    expect(elapsed).toBeLessThan(2_500);
  });
});
