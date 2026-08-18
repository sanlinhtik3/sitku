import { useMemo, useState } from "react";
import {
  AddSquare,
  Calendar,
  CaseMinimalistic,
  Chart2,
  CheckCircle,
  CloseCircle,
  Document,
  Magnifer,
  Settings,
  UsersGroupRounded,
  Wallet,
} from "@solar-icons/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  calculateTeamHealth,
  kpiActual,
  kpiAttainment,
  memberMetrics,
  projectHealth,
  taskInPeriod,
  teamStore,
  useTeamState,
  type TeamKpiMetric,
  type TeamKpiPeriod,
  type TeamTaskPriority,
  type TeamTaskStatus,
} from "@/repositories/local/teamStore";

type View = "overview" | "work" | "people" | "performance" | "operations";
type AddMode = "member" | "project" | "task" | "kpi" | "attendance" | "leave" | "review" | "payroll" | null;
const NAV: Array<{ key: View; label: string; icon: typeof Chart2 }> = [
  { key: "overview", label: "Overview", icon: Chart2 },
  { key: "work", label: "Work", icon: CaseMinimalistic },
  { key: "people", label: "People", icon: UsersGroupRounded },
  { key: "performance", label: "Performance", icon: Chart2 },
  { key: "operations", label: "Operations", icon: Settings },
];
const STATUSES: Array<{ key: TeamTaskStatus; label: string }> = [
  { key: "backlog", label: "Backlog" },
  { key: "ready", label: "Ready" },
  { key: "in_progress", label: "Active" },
  { key: "blocked", label: "Blocked" },
  { key: "review", label: "Review" },
  { key: "done", label: "Done" },
  { key: "cancelled", label: "Cancelled" },
];

export function TeamManagementDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const workspace = useTeamState();
  const [view, setView] = useState<View>("overview");
  const [addMode, setAddMode] = useState<AddMode>(null);
  const [query, setQuery] = useState("");
  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(null);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const activeMembers = workspace.members.filter((member) => !member.archived);
  const activeProjects = workspace.projects.filter((project) => !project.archived);
  const health = useMemo(() => calculateTeamHealth(workspace), [workspace]);
  const activeTasks = workspace.tasks.filter((task) => ["ready", "in_progress", "blocked", "review"].includes(task.status));
  const dueToday = activeTasks.filter((task) => task.dueAt && new Date(task.dueAt).toDateString() === new Date().toDateString()).length;
  const blocked = activeTasks.filter((task) => task.status === "blocked").length;
  const monthDone = workspace.tasks.filter((task) => taskInPeriod(task, "monthly")).length;
  const pendingApprovals = workspace.approvals.filter((approval) => approval.status === "pending").length;

  if (!open) return null;
  return (
    <>
      <div className="team-os-backdrop fixed inset-0 z-[99]" aria-hidden="true" />
      <div className="team-os team-os-v2 fixed z-[100] overflow-hidden" role="dialog" aria-modal="true" aria-labelledby="team-os-title">
        <header className="ceo-header">
          <div className="ceo-brand">
            <span><CaseMinimalistic size={20} weight="Linear" /></span>
            <div><h2 id="team-os-title">Team OS</h2><p>{workspace.company.name} · local CEO workspace</p></div>
          </div>
          <nav aria-label="Team workspace views">
            {NAV.map(({ key, label, icon: Icon }) => (
              <button key={key} data-active={view === key} aria-label={label} title={label} onClick={() => setView(key)}>
                <Icon size={16} weight="Linear" /><span>{label}</span>
              </button>
            ))}
          </nav>
          <div className="ceo-actions">
            <Button className="gap-1.5" onClick={() => setAddMode(view === "people" ? "member" : view === "performance" ? "kpi" : "task")}>
              <AddSquare className="h-4 w-4" weight="Linear" />Add data
            </Button>
            <Button variant="ghost" size="icon" aria-label="Close Team OS" title="Close" onClick={() => onOpenChange(false)}>
              <CloseCircle className="h-5 w-5" weight="Linear" />
            </Button>
          </div>
        </header>

        <main className="ceo-main">
          <section className="ceo-pulse" aria-label="Team operating pulse">
            <Metric label="Health" value={health.score === null ? "Needs data" : `${health.score}%`} tone={health.status} />
            <Metric label="Active" value={String(activeTasks.length)} tone="info" />
            <Metric label="Due today" value={String(dueToday)} tone={dueToday ? "warning" : "neutral"} />
            <Metric label="Blocked" value={String(blocked)} tone={blocked ? "critical" : "neutral"} />
            <Metric label="Month done" value={String(monthDone)} tone="healthy" />
            <Metric label="Approvals" value={String(pendingApprovals)} tone={pendingApprovals ? "warning" : "neutral"} />
          </section>

          {view === "overview" && (
            <Overview workspace={workspace} health={health} onView={setView} onAdd={setAddMode} />
          )}
          {view === "work" && (
            <WorkView workspace={workspace} query={query} setQuery={setQuery} onAdd={setAddMode} onSelectTask={setSelectedTaskId} />
          )}
          {view === "people" && (
            <PeopleView workspace={workspace} query={query} setQuery={setQuery} onAdd={setAddMode} onSelect={setSelectedMemberId} />
          )}
          {view === "performance" && (
            <PerformanceView workspace={workspace} onAdd={setAddMode} />
          )}
          {view === "operations" && (
            <OperationsView workspace={workspace} onAdd={setAddMode} />
          )}
        </main>

        {addMode && <SmartAdd mode={addMode} workspace={workspace} onClose={() => setAddMode(null)} />}
        {selectedMemberId && (
          <MemberDetail
            member={workspace.members.find((member) => member.id === selectedMemberId)!}
            workspace={workspace}
            onClose={() => setSelectedMemberId(null)}
          />
        )}
        {selectedTaskId && workspace.tasks.some((task) => task.id === selectedTaskId) && (
          <TaskDetail
            task={workspace.tasks.find((task) => task.id === selectedTaskId)!}
            workspace={workspace}
            onClose={() => setSelectedTaskId(null)}
          />
        )}
      </div>
    </>
  );
}

function Metric({ label, value, tone }: { label: string; value: string; tone: string }) {
  return <article className="ceo-metric" data-tone={tone}><span>{label}</span><strong>{value}</strong></article>;
}

function Surface({ title, subtitle, action, onAction, className = "", children }: {
  title: string; subtitle?: string; action?: string; onAction?: () => void; className?: string; children: React.ReactNode;
}) {
  return (
    <section className={`ceo-surface ${className}`}>
      <header><div><h3>{title}</h3>{subtitle && <p>{subtitle}</p>}</div>{action && <button onClick={onAction}>{action}</button>}</header>
      {children}
    </section>
  );
}

function Overview({ workspace, health, onView, onAdd }: {
  workspace: ReturnType<typeof useTeamState>;
  health: ReturnType<typeof calculateTeamHealth>;
  onView: (view: View) => void;
  onAdd: (mode: AddMode) => void;
}) {
  const activeProjects = workspace.projects.filter((project) => !project.archived);
  const activeMembers = workspace.members.filter((member) => !member.archived);
  const alerts = [
    ...workspace.tasks.filter((task) => task.status === "blocked").map((task) => ({ tone: "critical", text: `Blocked: ${task.title}` })),
    ...workspace.tasks.filter((task) => task.status !== "done" && task.dueAt && new Date(task.dueAt) < new Date()).map((task) => ({ tone: "warning", text: `Overdue: ${task.title}` })),
    ...activeProjects.filter((project) => project.status === "at_risk").map((project) => ({ tone: "warning", text: `Project at risk: ${project.name}` })),
  ].slice(0, 3);
  return (
    <div className="ceo-dashboard-grid">
      <Surface title="Team health" subtitle="Transparent weighted score" className="ceo-health-card">
        <div className="ceo-health">
          <HealthRing score={health.score} status={health.status} />
          <div className="ceo-pillars">
            {(Object.keys(health.pillars) as Array<keyof typeof health.pillars>).map((key) => (
              <Progress key={key} label={key} value={health.pillars[key]} />
            ))}
          </div>
        </div>
      </Surface>
      <Surface title="Attention" subtitle="Highest-priority signals" className="ceo-alert-card">
        <div className="ceo-alerts">
          {alerts.map((alert) => <div key={alert.text} data-tone={alert.tone}><i />{alert.text}</div>)}
          {!alerts.length && <Empty title="Everything looks calm" detail="No blocked, overdue, or at-risk work." />}
        </div>
      </Surface>
      <Surface title="Project health" subtitle={`${activeProjects.length} active projects`} action="Open work" onAction={() => onView("work")} className="ceo-project-card">
        <div className="ceo-project-chart">
          {activeProjects.slice(0, 6).map((project) => {
            const score = projectHealth(project, workspace.tasks);
            return <Progress key={project.id} label={project.name} value={score} />;
          })}
          {!activeProjects.length && <Empty title="No projects yet" detail="Create a project to group work and track delivery." onClick={() => onAdd("project")} />}
        </div>
      </Surface>
      <Surface title="Workload" subtitle="Planned capacity by member" action="People" onAction={() => onView("people")} className="ceo-workload-card">
        <div className="ceo-workload-list">
          {activeMembers.slice(0, 6).map((member) => {
            const minutes = workspace.tasks.filter((task) => task.ownerId === member.id && ["ready", "in_progress", "blocked", "review"].includes(task.status)).reduce((sum, task) => sum + task.plannedMinutes, 0);
            return <Progress key={member.id} label={member.name} value={Math.round(minutes / Math.max(1, member.capacityHours * 60) * 100)} suffix=" load" />;
          })}
          {!activeMembers.length && <Empty title="No members yet" detail="Add a member to activate workload health." onClick={() => onAdd("member")} />}
        </div>
      </Surface>
      <Surface title="Task flow" subtitle="Current operating pipeline" action="Open board" onAction={() => onView("work")} className="ceo-flow-card">
        <div className="ceo-flow">
          {STATUSES.filter((status) => status.key !== "cancelled").map((status) => (
            <div key={status.key}><strong>{workspace.tasks.filter((task) => task.status === status.key).length}</strong><span>{status.label}</span></div>
          ))}
        </div>
      </Surface>
      <Surface title="KPI attainment" subtitle="Active targets this period" action="Performance" onAction={() => onView("performance")} className="ceo-kpi-card">
        <div className="ceo-kpi-bars">
          {workspace.kpiTargets.filter((target) => target.active).slice(0, 5).map((target) => {
            const actual = kpiActual(target, workspace.tasks, workspace.kpiMeasurements);
            return <Progress key={target.id} label={target.name} value={Math.min(100, kpiAttainment(target, actual))} />;
          })}
          {!workspace.kpiTargets.some((target) => target.active) && <Empty title="No active targets" detail="Set one measurable outcome." onClick={() => onAdd("kpi")} />}
        </div>
      </Surface>
    </div>
  );
}

function HealthRing({ score, status }: { score: number | null; status: string }) {
  const value = score ?? 0;
  return (
    <div className="ceo-health-ring" style={{ "--score": `${value * 3.6}deg` } as React.CSSProperties} data-tone={status}>
      <div><strong>{score === null ? "—" : `${score}%`}</strong><span>{score === null ? "Needs data" : status.replace("_", " ")}</span></div>
    </div>
  );
}

function Progress({ label, value, suffix = "" }: { label: string; value: number | null; suffix?: string }) {
  const safe = value === null ? 0 : Math.max(0, Math.min(100, value));
  return (
    <div className="ceo-progress" data-empty={value === null}>
      <p><span>{label.replaceAll("_", " ")}</span><b>{value === null ? "Needs data" : `${Math.round(value)}%${suffix}`}</b></p>
      <i><b style={{ width: `${safe}%` }} /></i>
    </div>
  );
}

function WorkView({ workspace, query, setQuery, onAdd, onSelectTask }: {
  workspace: ReturnType<typeof useTeamState>; query: string; setQuery: (value: string) => void; onAdd: (mode: AddMode) => void; onSelectTask: (id: string) => void;
}) {
  const [projectId, setProjectId] = useState("all");
  const visible = workspace.tasks.filter((task) =>
    (projectId === "all" || task.projectId === projectId) &&
    `${task.title} ${task.description} ${task.channel}`.toLowerCase().includes(query.toLowerCase())
  );
  return (
    <section className="ceo-focus">
      <div className="ceo-toolbar">
        <div className="ceo-project-filter">
          <button data-active={projectId === "all"} onClick={() => setProjectId("all")}>All work</button>
          {workspace.projects.filter((project) => !project.archived).map((project) => (
            <button key={project.id} data-active={projectId === project.id} onClick={() => setProjectId(project.id)}>{project.name}</button>
          ))}
          <button onClick={() => onAdd("project")}><AddSquare size={15} weight="Linear" />Project</button>
        </div>
        <Search value={query} onChange={setQuery} />
      </div>
      <div className="ceo-board">
        {STATUSES.filter((status) => status.key !== "cancelled").map((status) => {
          const rows = visible.filter((task) => task.status === status.key).slice(0, 200);
          return (
            <section key={status.key} className="ceo-board-column" data-status={status.key}>
              <header><span>{status.label}</span><b>{visible.filter((task) => task.status === status.key).length}</b></header>
              {rows.map((task) => <TaskCard key={task.id} task={task} workspace={workspace} onOpen={() => onSelectTask(task.id)} />)}
              {!rows.length && <div className="ceo-column-empty">No {status.label.toLowerCase()} work</div>}
            </section>
          );
        })}
      </div>
    </section>
  );
}

function TaskCard({ task, workspace, onOpen }: { task: ReturnType<typeof useTeamState>["tasks"][number]; workspace: ReturnType<typeof useTeamState>; onOpen: () => void }) {
  const owner = workspace.members.find((member) => member.id === task.ownerId);
  const project = workspace.projects.find((item) => item.id === task.projectId);
  return (
    <article className="ceo-task-card" data-priority={task.priority} role="button" tabIndex={0} onClick={onOpen} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") onOpen(); }}>
      <div className="ceo-task-meta"><span>{project?.name || task.channel || "General"}</span><i>{task.priority}</i></div>
      <h4>{task.title}</h4>
      {task.description && <p>{task.description}</p>}
      <div className="ceo-task-result">
        {task.kpiPoints > 0 && <span>{task.kpiPoints} pts</span>}
        {task.views > 0 && <span>{compact(task.views)} views</span>}
        {workspace.comments.some((comment) => comment.taskId === task.id) && <span>{workspace.comments.filter((comment) => comment.taskId === task.id).length} notes</span>}
      </div>
      <footer>
        <Avatar name={owner?.name || "?"} />
        <time>{task.dueAt ? shortDate(task.dueAt) : "No due date"}</time>
        <select aria-label={`${task.title} status`} value={task.status} onClick={(event) => event.stopPropagation()} onChange={(event) => teamStore.updateTask(task.id, { status: event.target.value as TeamTaskStatus, progress: event.target.value === "done" ? 100 : task.progress })}>
          {STATUSES.map((status) => <option key={status.key} value={status.key}>{status.label}</option>)}
        </select>
      </footer>
    </article>
  );
}

function PeopleView({ workspace, query, setQuery, onAdd, onSelect }: {
  workspace: ReturnType<typeof useTeamState>; query: string; setQuery: (value: string) => void; onAdd: (mode: AddMode) => void; onSelect: (id: string) => void;
}) {
  const members = workspace.members.filter((member) => !member.archived && `${member.name} ${member.role}`.toLowerCase().includes(query.toLowerCase()));
  return (
    <section className="ceo-focus">
      <div className="ceo-toolbar"><span>{members.length} people</span><Search value={query} onChange={setQuery} /></div>
      <div className="ceo-people-grid">
        {members.map((member) => {
          const metrics = memberMetrics(member, workspace.tasks);
          const monthly = metrics.owned.filter((task) => taskInPeriod(task, "monthly")).length;
          const load = Math.round(metrics.owned.filter((task) => !["done", "cancelled"].includes(task.status)).reduce((sum, task) => sum + task.plannedMinutes, 0) / Math.max(1, member.capacityHours * 60) * 100);
          return (
            <button key={member.id} className="ceo-person-card" onClick={() => onSelect(member.id)}>
              <header><Avatar name={member.name} /><div><h3>{member.name}</h3><p>{member.role}</p></div><i data-status={member.availability} /></header>
              <div className="ceo-person-stats"><span><b>{monthly}</b>Month tasks</span><span><b>{metrics.onTimeRate ? `${Math.round(metrics.onTimeRate)}%` : "—"}</b>On time</span><span><b>{metrics.blocked}</b>Blocked</span></div>
              <Progress label="Workload" value={load} />
              <Sparkline values={metrics.owned.slice(-8).map((task) => task.progress)} />
            </button>
          );
        })}
        {!members.length && <Empty title="No people found" detail="Add the first member to activate team intelligence." onClick={() => onAdd("member")} />}
      </div>
    </section>
  );
}

function PerformanceView({ workspace, onAdd }: { workspace: ReturnType<typeof useTeamState>; onAdd: (mode: AddMode) => void }) {
  const health = calculateTeamHealth(workspace);
  const [weights, setWeights] = useState(workspace.healthWeights);
  const weightTotal = Object.values(weights).reduce((sum, value) => sum + Number(value), 0);
  return (
    <div className="ceo-performance-grid">
      <Surface title="Health model" subtitle="Weights are transparent and total 100%" className="ceo-weight-card">
        <div className="ceo-weight-list">
          {(Object.keys(weights) as Array<keyof typeof weights>).map((key) => (
            <label key={key}><span>{key}</span><input type="number" min="0" max="100" value={weights[key]} onChange={(event) => setWeights((current) => ({ ...current, [key]: Number(event.target.value) || 0 }))} /><em>%</em></label>
          ))}
        </div>
        <div className="ceo-weight-footer">
          <p className="ceo-model-note">Coverage {health.availableWeight}% · total {weightTotal}%</p>
          <button disabled={weightTotal !== 100} onClick={() => teamStore.updateHealthWeights(weights)}>Save weights</button>
        </div>
      </Surface>
      <Surface title="KPI targets" subtitle="Company, team, project, and member outcomes" action="Add KPI" onAction={() => onAdd("kpi")} className="ceo-targets-card">
        <div className="ceo-target-grid">
          {workspace.kpiTargets.filter((target) => target.active).map((target) => {
            const actual = kpiActual(target, workspace.tasks, workspace.kpiMeasurements);
            const attainment = kpiAttainment(target, actual);
            return (
              <article key={target.id}>
                <header><span>{target.period}</span><strong>{formatAttainment(attainment)}</strong></header>
                <h4>{target.name}</h4>
                <p>{formatMetric(actual, target.metric)} of {formatMetric(target.target, target.metric)} · {target.scope}</p>
                <Progress label="Attainment" value={Math.min(100, attainment)} />
              </article>
            );
          })}
          {!workspace.kpiTargets.some((target) => target.active) && <Empty title="No KPI targets" detail="Set one measurable operating outcome." onClick={() => onAdd("kpi")} />}
        </div>
      </Surface>
      <Surface title="Performance reviews" subtitle="Evidence-based CEO review history" action="Add review" onAction={() => onAdd("review")} className="ceo-reviews-card">
        <div className="ceo-record-list">
          {workspace.reviews.slice().reverse().slice(0, 8).map((review) => {
            const member = workspace.members.find((item) => item.id === review.memberId);
            return <div key={review.id}><Avatar name={member?.name || "?"} /><span><b>{member?.name || "Unknown"}</b><small>{review.periodStart} – {review.periodEnd}</small></span><strong>{review.score}%</strong><i data-status={review.status}>{review.status}</i></div>;
          })}
          {!workspace.reviews.length && <Empty title="No reviews yet" detail="Add a monthly or quarterly performance review." onClick={() => onAdd("review")} />}
        </div>
      </Surface>
    </div>
  );
}

function OperationsView({ workspace, onAdd }: { workspace: ReturnType<typeof useTeamState>; onAdd: (mode: AddMode) => void }) {
  const exportData = async () => {
    const payload = await teamStore.exportBackup();
    const url = URL.createObjectURL(new Blob([payload], { type: "application/json" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `sitku-team-os-${new Date().toISOString().slice(0, 10)}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  };
  const importData = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "application/json,.json";
    input.onchange = async () => {
      const file = input.files?.[0];
      if (file) await teamStore.importBackup(await file.text());
    };
    input.click();
  };
  return (
    <div className="ceo-operations-grid">
      <Surface title="Attendance & leave" subtitle="Manual CEO-entered records" className="ceo-attendance-card">
        <div className="ceo-operation-actions"><button onClick={() => onAdd("attendance")}><Calendar size={17} weight="Linear" />Attendance</button><button onClick={() => onAdd("leave")}><Document size={17} weight="Linear" />Leave</button></div>
        <div className="ceo-record-list">
          {workspace.attendance.slice().reverse().slice(0, 5).map((entry) => <Record key={entry.id} title={workspace.members.find((member) => member.id === entry.memberId)?.name || "Unknown"} detail={`${entry.date} · ${entry.minutes} min`} value={entry.status} />)}
          {!workspace.attendance.length && <Empty title="No attendance records" detail="Record presence, remote work, leave, or absence." />}
        </div>
      </Surface>
      <Surface title="Compensation ledger" subtitle="Salary, bonus, deductions, and payment status" action="Add payroll" onAction={() => onAdd("payroll")} className="ceo-payroll-card">
        <div className="ceo-record-list">
          {workspace.payrollEntries.slice().reverse().slice(0, 6).map((entry) => <Record key={entry.id} title={workspace.members.find((member) => member.id === entry.memberId)?.name || "Unknown"} detail={`${entry.period} · ${entry.currency}`} value={`${money(entry.salary + entry.bonus - entry.deduction)} · ${entry.status}`} />)}
          {!workspace.payrollEntries.length && <Empty title="No payroll entries" detail="Track compensation locally without tax or bank automation." />}
        </div>
      </Surface>
      <Surface title="Approvals" subtitle="CEO decision record" className="ceo-approval-card">
        <div className="ceo-record-list">
          {workspace.approvals.slice().reverse().slice(0, 8).map((approval) => <div key={approval.id}><CheckCircle size={18} weight="Linear" /><span><b>{approval.title}</b><small>{approval.type}</small></span>{approval.status === "pending" ? <span className="ceo-decision"><button onClick={() => teamStore.updateApproval(approval.id, { status: "rejected" })}>Reject</button><button onClick={() => teamStore.updateApproval(approval.id, { status: "approved" })}>Approve</button></span> : <i data-status={approval.status}>{approval.status}</i>}</div>)}
          {!workspace.approvals.length && <Empty title="No approvals pending" detail="Leave, payroll, review, and target decisions appear here." />}
        </div>
      </Surface>
      <Surface title="Activity history" subtitle="Append-only local audit trail" className="ceo-activity-card">
        <div className="ceo-timeline">
          {workspace.activity.slice().reverse().slice(0, 12).map((event) => <div key={event.id}><i /><span><b>{event.summary}</b><small>{new Date(event.createdAt).toLocaleString()}</small></span></div>)}
          {!workspace.activity.length && <Empty title="No activity yet" detail="Every Team OS change will appear here." />}
        </div>
      </Surface>
      <Surface title="Local data" subtitle="Portable backup and verified restore" className="ceo-backup-card">
        <div className="ceo-backup-actions"><button onClick={exportData}>Export all data</button><button onClick={importData}>Restore from file</button></div>
        <p>Legacy Team MVP data remains preserved in its migration backup and is never deleted automatically.</p>
      </Surface>
    </div>
  );
}

function Record({ title, detail, value }: { title: string; detail: string; value: string }) {
  return <div><span><b>{title}</b><small>{detail}</small></span><strong>{value}</strong></div>;
}

function MemberDetail({ member, workspace, onClose }: { member: ReturnType<typeof useTeamState>["members"][number]; workspace: ReturnType<typeof useTeamState>; onClose: () => void }) {
  const metrics = memberMetrics(member, workspace.tasks);
  const memberTasks = metrics.owned.filter((task) => taskInPeriod(task, "monthly"));
  const reviews = workspace.reviews.filter((review) => review.memberId === member.id);
  const attendance = workspace.attendance.filter((entry) => entry.memberId === member.id);
  return (
    <div className="ceo-detail-layer">
      <section className="ceo-detail">
        <header><div><Avatar name={member.name} /><span><h2>{member.name}</h2><p>{member.role} · monthly operating view</p></span></div><button aria-label="Close member detail" onClick={onClose}><CloseCircle size={22} weight="Linear" /></button></header>
        <div className="ceo-detail-metrics">
          <Metric label="Tasks" value={String(memberTasks.length)} tone="info" />
          <Metric label="On time" value={metrics.onTimeRate ? `${Math.round(metrics.onTimeRate)}%` : "Needs data"} tone={metrics.onTimeRate >= 75 ? "healthy" : "warning"} />
          <Metric label="KPI score" value={metrics.kpi ? `${metrics.kpi}%` : "Needs data"} tone={metrics.kpi >= 75 ? "healthy" : "warning"} />
          <Metric label="Blocked" value={String(metrics.blocked)} tone={metrics.blocked ? "critical" : "neutral"} />
        </div>
        <div className="ceo-detail-grid">
          <Surface title="Work this month" subtitle={`${memberTasks.length} records`}>
            <div className="ceo-record-list">{memberTasks.map((task) => <Record key={task.id} title={task.title} detail={task.projectId ? workspace.projects.find((project) => project.id === task.projectId)?.name || "Project" : task.channel || "General"} value={task.status.replaceAll("_", " ")} />)}{!memberTasks.length && <Empty title="No work recorded" detail="Assigned tasks will appear here." />}</div>
          </Surface>
          <Surface title="Review & attendance" subtitle="Latest evidence">
            <div className="ceo-record-list">
              {reviews.slice(-3).map((review) => <Record key={review.id} title="Performance review" detail={`${review.periodStart} – ${review.periodEnd}`} value={`${review.score}%`} />)}
              {attendance.slice(-3).map((entry) => <Record key={entry.id} title={entry.date} detail={`${entry.minutes} minutes`} value={entry.status} />)}
              {!reviews.length && !attendance.length && <Empty title="Needs data" detail="Add a review or attendance record." />}
            </div>
          </Surface>
        </div>
      </section>
    </div>
  );
}

function TaskDetail({ task, workspace, onClose }: { task: ReturnType<typeof useTeamState>["tasks"][number]; workspace: ReturnType<typeof useTeamState>; onClose: () => void }) {
  const [comment, setComment] = useState("");
  const owner = workspace.members.find((member) => member.id === task.ownerId);
  const project = workspace.projects.find((item) => item.id === task.projectId);
  const comments = workspace.comments.filter((item) => item.taskId === task.id);
  const attachments = workspace.attachments.filter((item) => item.taskId === task.id);
  const addComment = () => {
    if (!comment.trim()) return;
    teamStore.addComment(task.id, comment.trim());
    setComment("");
  };
  const pickAttachment = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.onchange = async () => {
      const file = input.files?.[0];
      if (file) await teamStore.addAttachment(task.id, file);
    };
    input.click();
  };
  return (
    <div className="ceo-detail-layer">
      <section className="ceo-detail ceo-task-detail">
        <header><div><Avatar name={owner?.name || "?"} /><span><h2>{task.title}</h2><p>{project?.name || task.channel || "General"} · {owner?.name || "Unassigned"}</p></span></div><button aria-label="Close task detail" onClick={onClose}><CloseCircle size={22} weight="Linear" /></button></header>
        <div className="ceo-detail-metrics">
          <Metric label="Status" value={task.status.replaceAll("_", " ")} tone={task.status === "blocked" ? "critical" : task.status === "done" ? "healthy" : "info"} />
          <Metric label="Progress" value={`${task.progress}%`} tone="info" />
          <Metric label="Planned" value={`${task.plannedMinutes} min`} tone="neutral" />
          <Metric label="KPI" value={`${task.kpiPoints} pts`} tone={task.kpiPoints ? "healthy" : "neutral"} />
        </div>
        <div className="ceo-detail-grid">
          <Surface title="Task evidence" subtitle="Description, timing, and social outcome">
            <p className="ceo-task-description">{task.description || "No description yet."}</p>
            <div className="ceo-evidence-grid">
              <Record title="Due" detail={task.reminderAt ? `Reminder ${new Date(task.reminderAt).toLocaleString()}` : "No reminder"} value={task.dueAt ? new Date(task.dueAt).toLocaleString() : "No due date"} />
              <Record title="Social result" detail={`${task.likes} likes · ${task.comments} comments · ${task.shares} shares · ${task.saves} saves`} value={`${compact(task.views)} views`} />
            </div>
          </Surface>
          <Surface title="Comments & files" subtitle={`${comments.length} comments · ${attachments.length} files`}>
            <div className="ceo-comment-compose"><input value={comment} onChange={(event) => setComment(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") addComment(); }} placeholder="Add a CEO note" /><button onClick={addComment}>Add</button><button onClick={pickAttachment}><Document size={15} weight="Linear" />File</button></div>
            <div className="ceo-record-list">
              {comments.slice().reverse().map((item) => <Record key={item.id} title={item.body} detail={new Date(item.createdAt).toLocaleString()} value="Note" />)}
              {attachments.slice().reverse().map((item) => <div key={item.id}><Document size={17} weight="Linear" /><span><b>{item.name}</b><small>{Math.max(1, Math.round(item.size / 1024))} KB</small></span><button onClick={() => teamStore.openAttachment(item.id)}>Open</button></div>)}
              {!comments.length && !attachments.length && <Empty title="No evidence yet" detail="Add a comment or attach a local file." />}
            </div>
          </Surface>
        </div>
      </section>
    </div>
  );
}

function SmartAdd({ mode: initialMode, workspace, onClose }: { mode: Exclude<AddMode, null>; workspace: ReturnType<typeof useTeamState>; onClose: () => void }) {
  const [mode, setMode] = useState<Exclude<AddMode, null>>(initialMode);
  const [form, setForm] = useState<Record<string, string>>({
    capacity: "40", priority: "medium", planned: "60", status: "ready", period: "monthly",
    target: "1", metric: "tasks_completed", direction: "at_least", score: "75", currency: "USDT",
    salary: "0", bonus: "0", deduction: "0", attendanceStatus: "present", minutes: "480",
    projectStatus: "active", color: "#f4d35e", leaveType: "annual", reviewStatus: "final",
  });
  const set = (key: string, value: string) => setForm((current) => ({ ...current, [key]: value }));
  const memberOptions = workspace.members.filter((member) => !member.archived);
  const projectOptions = workspace.projects.filter((project) => !project.archived);
  const firstTeam = workspace.teams.find((team) => !team.archived)?.id || "team_default";
  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (mode === "member" && form.name?.trim()) teamStore.addMember({ name: form.name.trim(), role: form.role || "Team member", responsibilities: split(form.responsibilities), channels: split(form.channels), capacityHours: Number(form.capacity) || 40 });
    if (mode === "project" && form.name?.trim()) teamStore.addProject({ teamId: firstTeam, name: form.name.trim(), description: form.description || "", status: form.projectStatus as "planned" | "active" | "at_risk" | "paused" | "completed", ownerId: form.owner || null, startAt: iso(form.startAt), dueAt: iso(form.dueAt), color: form.color || "#f4d35e" });
    if (mode === "task" && form.title?.trim()) teamStore.addTask({ title: form.title.trim(), description: form.description || "", teamId: firstTeam, projectId: form.project || null, ownerId: form.owner || null, reviewerId: form.reviewer || null, priority: form.priority as TeamTaskPriority, dueAt: iso(form.dueAt), reminderAt: iso(form.reminderAt), channel: form.channel || "", plannedMinutes: Number(form.planned) || 0, status: form.status as TeamTaskStatus });
    if (mode === "kpi" && form.name?.trim()) teamStore.addKpiTarget({ name: form.name.trim(), memberId: form.owner || null, scope: form.project ? "project" : form.owner ? "member" : "team", scopeId: form.project || form.owner || firstTeam, metric: form.metric as TeamKpiMetric, period: form.period as TeamKpiPeriod, direction: form.direction as "at_least" | "at_most" | "range", unit: form.unit || "", target: Number(form.target) || 1, targetMax: form.targetMax ? Number(form.targetMax) : null });
    if (mode === "attendance" && form.owner && form.date) teamStore.addAttendance({ memberId: form.owner, date: form.date, status: form.attendanceStatus as "present" | "remote" | "leave" | "absent", minutes: Number(form.minutes) || 0, note: form.note || "" });
    if (mode === "leave" && form.owner && form.startAt && form.endAt) teamStore.addLeave({ memberId: form.owner, startDate: form.startAt, endDate: form.endAt, type: form.leaveType as "annual" | "sick" | "personal" | "other", status: "pending", note: form.note || "" });
    if (mode === "review" && form.owner && form.startAt && form.endAt) teamStore.addReview({ memberId: form.owner, periodStart: form.startAt, periodEnd: form.endAt, score: Math.max(0, Math.min(100, Number(form.score) || 0)), strengths: form.strengths || "", improvements: form.improvements || "", nextActions: form.nextActions || "", status: form.reviewStatus as "draft" | "final" });
    if (mode === "payroll" && form.owner && form.period) teamStore.addPayrollEntry({ memberId: form.owner, period: form.period, currency: form.currency || "USDT", salary: Number(form.salary) || 0, bonus: Number(form.bonus) || 0, deduction: Number(form.deduction) || 0, status: "pending", paidAt: null, note: form.note || "" });
    onClose();
  };
  return (
    <div className="ceo-add-layer">
      <form onSubmit={submit}>
        <header><div><h2>Smart Add</h2><p>One focused form for operating data.</p></div><button type="button" onClick={onClose}><CloseCircle size={20} weight="Linear" /></button></header>
        <nav>{(["task", "project", "member", "kpi", "attendance", "leave", "review", "payroll"] as const).map((item) => <button type="button" key={item} data-active={mode === item} onClick={() => setMode(item)}>{item}</button>)}</nav>
        <div className="ceo-form-grid">
          {mode === "member" && <><Field label="Name" span={6}><Input autoFocus value={form.name || ""} onChange={(event) => set("name", event.target.value)} /></Field><Field label="Role" span={3}><Input value={form.role || ""} onChange={(event) => set("role", event.target.value)} /></Field><Field label="Weekly capacity" span={3}><Input type="number" value={form.capacity} onChange={(event) => set("capacity", event.target.value)} /></Field><Field label="Responsibilities" span={7}><Input placeholder="Operations, publishing" value={form.responsibilities || ""} onChange={(event) => set("responsibilities", event.target.value)} /></Field><Field label="Channels" span={5}><Input placeholder="YouTube, Telegram" value={form.channels || ""} onChange={(event) => set("channels", event.target.value)} /></Field></>}
          {mode === "project" && <><Field label="Project name" span={5}><Input autoFocus value={form.name || ""} onChange={(event) => set("name", event.target.value)} /></Field><Field label="Owner" span={3}><MemberSelect members={memberOptions} value={form.owner} onChange={(value) => set("owner", value)} /></Field><Field label="Status" span={2}><Select value={form.projectStatus} onChange={(value) => set("projectStatus", value)} options={["planned", "active", "at_risk", "paused", "completed"]} /></Field><Field label="Color" span={2}><Input type="color" value={form.color} onChange={(event) => set("color", event.target.value)} /></Field><Field label="Description" span={6}><Input value={form.description || ""} onChange={(event) => set("description", event.target.value)} /></Field><Field label="Start" span={3}><Input type="date" value={form.startAt || ""} onChange={(event) => set("startAt", event.target.value)} /></Field><Field label="Due" span={3}><Input type="date" value={form.dueAt || ""} onChange={(event) => set("dueAt", event.target.value)} /></Field></>}
          {mode === "task" && <><Field label="Task title" span={5}><Input autoFocus value={form.title || ""} onChange={(event) => set("title", event.target.value)} /></Field><Field label="Project" span={3}><select value={form.project || ""} onChange={(event) => set("project", event.target.value)}><option value="">No project</option>{projectOptions.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</select></Field><Field label="Owner" span={2}><MemberSelect members={memberOptions} value={form.owner} onChange={(value) => set("owner", value)} /></Field><Field label="Reviewer" span={2}><MemberSelect members={memberOptions} value={form.reviewer} onChange={(value) => set("reviewer", value)} /></Field><Field label="Description" span={6}><Input value={form.description || ""} onChange={(event) => set("description", event.target.value)} /></Field><Field label="Status" span={2}><Select value={form.status} onChange={(value) => set("status", value)} options={STATUSES.map((status) => status.key)} /></Field><Field label="Priority" span={2}><Select value={form.priority} onChange={(value) => set("priority", value)} options={["low", "medium", "high", "urgent"]} /></Field><Field label="Planned min" span={2}><Input type="number" value={form.planned} onChange={(event) => set("planned", event.target.value)} /></Field><Field label="Due date & time" span={4}><Input type="datetime-local" value={form.dueAt || ""} onChange={(event) => set("dueAt", event.target.value)} /></Field><Field label="Reminder" span={4}><Input type="datetime-local" value={form.reminderAt || ""} onChange={(event) => set("reminderAt", event.target.value)} /></Field><Field label="Channel" span={4}><Input value={form.channel || ""} onChange={(event) => set("channel", event.target.value)} /></Field></>}
          {mode === "kpi" && <><Field label="KPI name" span={5}><Input autoFocus value={form.name || ""} onChange={(event) => set("name", event.target.value)} /></Field><Field label="Owner" span={3}><MemberSelect members={memberOptions} value={form.owner} onChange={(value) => set("owner", value)} wholeTeam /></Field><Field label="Period" span={2}><Select value={form.period} onChange={(value) => set("period", value)} options={["daily", "weekly", "monthly", "quarterly"]} /></Field><Field label="Direction" span={2}><Select value={form.direction} onChange={(value) => set("direction", value)} options={["at_least", "at_most", "range"]} /></Field><Field label="Measured by" span={5}><Select value={form.metric} onChange={(value) => set("metric", value)} options={["tasks_completed", "kpi_points", "on_time_rate", "views", "engagement_rate", "custom"]} /></Field><Field label="Target" span={3}><Input type="number" value={form.target} onChange={(event) => set("target", event.target.value)} /></Field><Field label="Maximum" span={2}><Input type="number" disabled={form.direction !== "range"} value={form.targetMax || ""} onChange={(event) => set("targetMax", event.target.value)} /></Field><Field label="Unit" span={2}><Input value={form.unit || ""} onChange={(event) => set("unit", event.target.value)} /></Field></>}
          {mode === "attendance" && <><Field label="Member" span={4}><MemberSelect members={memberOptions} value={form.owner} onChange={(value) => set("owner", value)} /></Field><Field label="Date" span={3}><Input type="date" value={form.date || ""} onChange={(event) => set("date", event.target.value)} /></Field><Field label="Status" span={3}><Select value={form.attendanceStatus} onChange={(value) => set("attendanceStatus", value)} options={["present", "remote", "leave", "absent"]} /></Field><Field label="Minutes" span={2}><Input type="number" value={form.minutes} onChange={(event) => set("minutes", event.target.value)} /></Field><Field label="Note" span={12}><Input value={form.note || ""} onChange={(event) => set("note", event.target.value)} /></Field></>}
          {mode === "leave" && <><Field label="Member" span={4}><MemberSelect members={memberOptions} value={form.owner} onChange={(value) => set("owner", value)} /></Field><Field label="Leave type" span={3}><Select value={form.leaveType} onChange={(value) => set("leaveType", value)} options={["annual", "sick", "personal", "other"]} /></Field><Field label="Start" span={2}><Input type="date" value={form.startAt || ""} onChange={(event) => set("startAt", event.target.value)} /></Field><Field label="End" span={3}><Input type="date" value={form.endAt || ""} onChange={(event) => set("endAt", event.target.value)} /></Field><Field label="Note" span={12}><Input value={form.note || ""} onChange={(event) => set("note", event.target.value)} /></Field></>}
          {mode === "review" && <><Field label="Member" span={4}><MemberSelect members={memberOptions} value={form.owner} onChange={(value) => set("owner", value)} /></Field><Field label="Period start" span={3}><Input type="date" value={form.startAt || ""} onChange={(event) => set("startAt", event.target.value)} /></Field><Field label="Period end" span={3}><Input type="date" value={form.endAt || ""} onChange={(event) => set("endAt", event.target.value)} /></Field><Field label="Score" span={2}><Input type="number" min="0" max="100" value={form.score} onChange={(event) => set("score", event.target.value)} /></Field><Field label="Strengths" span={4}><Input value={form.strengths || ""} onChange={(event) => set("strengths", event.target.value)} /></Field><Field label="Improvements" span={4}><Input value={form.improvements || ""} onChange={(event) => set("improvements", event.target.value)} /></Field><Field label="Next actions" span={4}><Input value={form.nextActions || ""} onChange={(event) => set("nextActions", event.target.value)} /></Field></>}
          {mode === "payroll" && <><Field label="Member" span={4}><MemberSelect members={memberOptions} value={form.owner} onChange={(value) => set("owner", value)} /></Field><Field label="Period" span={3}><Input type="month" value={form.period} onChange={(event) => set("period", event.target.value)} /></Field><Field label="Currency" span={2}><Input value={form.currency} onChange={(event) => set("currency", event.target.value)} /></Field><Field label="Salary" span={3}><Input type="number" value={form.salary} onChange={(event) => set("salary", event.target.value)} /></Field><Field label="Bonus" span={3}><Input type="number" value={form.bonus} onChange={(event) => set("bonus", event.target.value)} /></Field><Field label="Deduction" span={3}><Input type="number" value={form.deduction} onChange={(event) => set("deduction", event.target.value)} /></Field><Field label="Note" span={6}><Input value={form.note || ""} onChange={(event) => set("note", event.target.value)} /></Field></>}
        </div>
        <footer><Button type="button" variant="ghost" onClick={onClose}>Cancel</Button><Button type="submit"><CheckCircle size={17} weight="Linear" />Save {mode}</Button></footer>
      </form>
    </div>
  );
}

function Field({ label, span, children }: { label: string; span: number; children: React.ReactNode }) {
  return <label style={{ gridColumn: `span ${span}` }}><span>{label}</span>{children}</label>;
}
function MemberSelect({ members, value = "", onChange, wholeTeam = false }: { members: ReturnType<typeof useTeamState>["members"]; value?: string; onChange: (value: string) => void; wholeTeam?: boolean }) {
  return <select value={value} onChange={(event) => onChange(event.target.value)}><option value="">{wholeTeam ? "Whole team" : "Unassigned"}</option>{members.map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}</select>;
}
function Select({ value, onChange, options }: { value: string; onChange: (value: string) => void; options: string[] }) {
  return <select value={value} onChange={(event) => onChange(event.target.value)}>{options.map((option) => <option key={option} value={option}>{option.replaceAll("_", " ")}</option>)}</select>;
}
function Search({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return <label className="ceo-search"><Magnifer size={16} weight="Linear" /><input value={value} onChange={(event) => onChange(event.target.value)} placeholder="Search" /></label>;
}
function Empty({ title, detail, onClick }: { title: string; detail: string; onClick?: () => void }) {
  return <button type="button" className="ceo-empty" onClick={onClick}><strong>{title}</strong><span>{detail}</span></button>;
}
function Avatar({ name }: { name: string }) {
  return <span className="ceo-avatar">{name.split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase()}</span>;
}
function Sparkline({ values }: { values: number[] }) {
  const data = values.length ? values : [0, 0, 0];
  const points = data.map((value, index) => `${index * (100 / Math.max(1, data.length - 1))},${30 - Math.max(0, Math.min(100, value)) * .25}`).join(" ");
  return <svg className="ceo-sparkline" viewBox="0 0 100 32" preserveAspectRatio="none" aria-hidden="true"><polyline points={points} /></svg>;
}
function compact(value: number) { return value >= 1_000_000 ? `${(value / 1_000_000).toFixed(1)}M` : value >= 1_000 ? `${(value / 1_000).toFixed(1)}K` : String(Math.round(value)); }
function money(value: number) { return new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(value); }
function shortDate(value: string) { return new Date(value).toLocaleDateString(undefined, { month: "short", day: "numeric" }); }
function split(value?: string) { return (value || "").split(",").map((item) => item.trim()).filter(Boolean); }
function iso(value?: string) { return value ? new Date(value).toISOString() : null; }
function formatMetric(value: number, metric: TeamKpiMetric) { return metric.includes("rate") ? `${value.toFixed(1)}%` : compact(value); }
function formatAttainment(value: number) { return `${Math.round(value)}%`; }
