export interface AgentTask {
  id: string;
  title: string;
  status: "pending" | "running" | "paused" | "completed" | "failed" | "cancelled";
  schedule?: string | null;
  metadata?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface TaskRepository {
  listTasks(): Promise<AgentTask[]>;
  upsertTask(input: Partial<AgentTask> & { title: string }): Promise<AgentTask>;
  deleteTask(id: string): Promise<void>;
}
