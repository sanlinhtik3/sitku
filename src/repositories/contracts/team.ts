export type TeamEntityId = string;
export type TeamTaskStatus =
  | "backlog"
  | "ready"
  | "in_progress"
  | "blocked"
  | "review"
  | "done"
  | "cancelled";
export type TeamTaskPriority = "low" | "medium" | "high" | "urgent";
export type TeamKpiPeriod = "daily" | "weekly" | "monthly" | "quarterly";
export type TeamKpiDirection = "at_least" | "at_most" | "range";
export type TeamKpiMetric =
  | "tasks_completed"
  | "kpi_points"
  | "on_time_rate"
  | "views"
  | "engagement_rate"
  | "custom";
export type TeamScope = "company" | "team" | "project" | "member";

export interface TeamCompany {
  id: TeamEntityId;
  name: string;
  timezone: string;
  createdAt: string;
  updatedAt: string;
}

export interface TeamUnit {
  id: TeamEntityId;
  companyId: TeamEntityId;
  name: string;
  description: string;
  color: string;
  archived: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface TeamProject {
  id: TeamEntityId;
  teamId: TeamEntityId;
  name: string;
  description: string;
  status: "planned" | "active" | "at_risk" | "paused" | "completed";
  ownerId: TeamEntityId | null;
  startAt: string | null;
  dueAt: string | null;
  color: string;
  archived: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface TeamMember {
  id: TeamEntityId;
  teamIds: TeamEntityId[];
  projectIds: TeamEntityId[];
  name: string;
  role: string;
  responsibilities: string[];
  channels: string[];
  capacityHours: number;
  availability: "available" | "focused" | "away" | "leave";
  archived: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface TeamTask {
  id: TeamEntityId;
  teamId: TeamEntityId;
  projectId: TeamEntityId | null;
  parentTaskId: TeamEntityId | null;
  title: string;
  description: string;
  ownerId: TeamEntityId | null;
  reviewerId: TeamEntityId | null;
  status: TeamTaskStatus;
  priority: TeamTaskPriority;
  dueAt: string | null;
  reminderAt: string | null;
  channel: string;
  plannedMinutes: number;
  actualMinutes: number;
  progress: number;
  views: number;
  engagementRate: number;
  kpiPoints: number;
  recurrence: "none" | TeamKpiPeriod;
  completedAt: string | null;
  workType: "general" | "social_post";
  platform: string;
  postUrl: string;
  postedAt: string | null;
  likes: number;
  shares: number;
  comments: number;
  saves: number;
  createdAt: string;
  updatedAt: string;
}

export interface TeamComment {
  id: TeamEntityId;
  taskId: TeamEntityId;
  body: string;
  createdAt: string;
  updatedAt: string;
}

export interface TeamAttachment {
  id: TeamEntityId;
  taskId: TeamEntityId | null;
  reviewId: TeamEntityId | null;
  payrollEntryId: TeamEntityId | null;
  name: string;
  mediaType: string;
  size: number;
  storageKey: string;
  createdAt: string;
}

export interface TeamKpiTarget {
  id: TeamEntityId;
  scope: TeamScope;
  scopeId: TeamEntityId | null;
  memberId: TeamEntityId | null;
  name: string;
  metric: TeamKpiMetric;
  customMetricKey: string | null;
  unit: string;
  direction: TeamKpiDirection;
  period: TeamKpiPeriod;
  target: number;
  targetMax: number | null;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface TeamKpiMeasurement {
  id: TeamEntityId;
  targetId: TeamEntityId;
  value: number;
  measuredAt: string;
  note: string;
  createdAt: string;
}

export interface TeamHealthWeights {
  delivery: number;
  kpi: number;
  workload: number;
  review: number;
  attendance: number;
}

export interface TeamHealthCheck {
  id: TeamEntityId;
  scope: "team" | "project" | "member";
  scopeId: TeamEntityId;
  energy: number;
  confidence: number;
  risk: "healthy" | "at_risk" | "critical";
  note: string;
  recordedAt: string;
  createdAt: string;
}

export interface TeamPerformanceReview {
  id: TeamEntityId;
  memberId: TeamEntityId;
  periodStart: string;
  periodEnd: string;
  score: number;
  strengths: string;
  improvements: string;
  nextActions: string;
  status: "draft" | "final";
  createdAt: string;
  updatedAt: string;
}

export interface TeamAttendanceEntry {
  id: TeamEntityId;
  memberId: TeamEntityId;
  date: string;
  status: "present" | "remote" | "leave" | "absent";
  minutes: number;
  note: string;
  createdAt: string;
  updatedAt: string;
}

export interface TeamLeaveRequest {
  id: TeamEntityId;
  memberId: TeamEntityId;
  startDate: string;
  endDate: string;
  type: "annual" | "sick" | "personal" | "other";
  status: "draft" | "pending" | "approved" | "rejected";
  note: string;
  createdAt: string;
  updatedAt: string;
}

export interface TeamCompensationPlan {
  id: TeamEntityId;
  memberId: TeamEntityId;
  currency: string;
  baseAmount: number;
  cadence: "monthly" | "weekly" | "project";
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface TeamPayrollEntry {
  id: TeamEntityId;
  memberId: TeamEntityId;
  period: string;
  currency: string;
  salary: number;
  bonus: number;
  deduction: number;
  status: "draft" | "pending" | "paid";
  paidAt: string | null;
  note: string;
  createdAt: string;
  updatedAt: string;
}

export interface TeamApproval {
  id: TeamEntityId;
  type: "task" | "leave" | "review" | "payroll" | "target_change";
  subjectId: TeamEntityId;
  title: string;
  status: "draft" | "pending" | "approved" | "rejected";
  note: string;
  decidedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TeamReminder {
  id: TeamEntityId;
  taskId: TeamEntityId | null;
  title: string;
  remindAt: string;
  dismissedAt: string | null;
  createdAt: string;
}

export interface TeamActivityEvent {
  id: TeamEntityId;
  entityType: string;
  entityId: TeamEntityId;
  action: string;
  summary: string;
  idempotencyKey: string | null;
  createdAt: string;
}

export interface TeamWorkspaceState {
  schemaVersion: 2;
  company: TeamCompany;
  teams: TeamUnit[];
  projects: TeamProject[];
  members: TeamMember[];
  tasks: TeamTask[];
  comments: TeamComment[];
  attachments: TeamAttachment[];
  kpiTargets: TeamKpiTarget[];
  kpiMeasurements: TeamKpiMeasurement[];
  healthChecks: TeamHealthCheck[];
  reviews: TeamPerformanceReview[];
  attendance: TeamAttendanceEntry[];
  leaveRequests: TeamLeaveRequest[];
  compensationPlans: TeamCompensationPlan[];
  payrollEntries: TeamPayrollEntry[];
  approvals: TeamApproval[];
  reminders: TeamReminder[];
  activity: TeamActivityEvent[];
  healthWeights: TeamHealthWeights;
}

export interface TeamRepositoryEnvelope {
  revision: number;
  checksum: string;
  updatedAt: string;
  state: TeamWorkspaceState;
}

export interface TeamRepository {
  load(): Promise<TeamRepositoryEnvelope | null>;
  save(state: TeamWorkspaceState, expectedRevision: number): Promise<TeamRepositoryEnvelope>;
  exportBackup(): Promise<string>;
  importBackup(payload: string): Promise<TeamRepositoryEnvelope>;
  putAttachment(input: { id: string; name: string; mediaType: string; data: ArrayBuffer }): Promise<{ storageKey: string; size: number }>;
  getAttachment(storageKey: string): Promise<ArrayBuffer | null>;
  deleteAttachment(storageKey: string): Promise<void>;
}
