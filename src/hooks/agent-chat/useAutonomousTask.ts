// ═══ Autonomous Task Hook — DISABLED (2026-04) ═══
// Autonomous Mode was removed per user request. This hook is kept as a no-op
// stub so dependent UI components (cards, panels, inline status) silently
// hide themselves without requiring a cascade of import deletions.
// The full implementation can be restored from git history if ever needed.

export interface AutonomousTaskStep {
  id: string;
  step_index?: number;
  title: string;
  description?: string;
  tool?: string;
  agent_role?: string;
  depends_on?: string[];
  status: 'pending' | 'running' | 'done' | 'error' | 'skipped';
  result?: string;
  error?: string;
  retries?: number;
  metadata?: Record<string, unknown>;
  started_at?: string;
  completed_at?: string;
}

export interface AutonomousTask {
  id: string;
  user_id: string;
  session_id: string;
  original_prompt: string;
  status: 'planning' | 'working' | 'compiling' | 'completed' | 'failed';
  plan: AutonomousTaskStep[];
  current_step: number;
  total_steps: number;
  progress_pct: number;
  result: string | null;
  error: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
  execution_mode?: 'sequential' | 'dag';
  max_parallelism?: number;
  agent_roles_used?: string[];
}

export function useAutonomousTask(
  _sessionId: string | null,
  _forceTaskId?: string | null,
  _onCompleted?: () => void,
) {
  // Permanently disabled — always returns inactive state.
  return {
    activeTask: null as AutonomousTask | null,
    steps: [] as AutonomousTaskStep[],
    isActive: false,
    isComplete: false,
    isFailed: false,
    isStale: false,
    refetch: async () => {},
  };
}
