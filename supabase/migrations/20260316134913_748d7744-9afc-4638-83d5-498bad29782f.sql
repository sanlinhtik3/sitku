
-- ═══ Phase 4: DAG Execution + Multi-Agent Schema ═══

-- 1. Autonomous Task Steps — granular step tracking with dependencies
CREATE TABLE public.autonomous_task_steps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES public.autonomous_tasks(id) ON DELETE CASCADE,
  step_index INTEGER NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  tool TEXT,
  agent_role TEXT NOT NULL DEFAULT 'general',
  depends_on TEXT[] DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'pending',
  result TEXT,
  error TEXT,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  retries INTEGER DEFAULT 0,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(task_id, step_index)
);

-- Index for fast lookups
CREATE INDEX idx_task_steps_task_id ON public.autonomous_task_steps(task_id);
CREATE INDEX idx_task_steps_status ON public.autonomous_task_steps(status);

-- 2. Add DAG metadata columns to autonomous_tasks
ALTER TABLE public.autonomous_tasks 
  ADD COLUMN IF NOT EXISTS execution_mode TEXT DEFAULT 'sequential',
  ADD COLUMN IF NOT EXISTS max_parallelism INTEGER DEFAULT 3,
  ADD COLUMN IF NOT EXISTS agent_roles_used TEXT[] DEFAULT '{}';

-- 3. Enable RLS
ALTER TABLE public.autonomous_task_steps ENABLE ROW LEVEL SECURITY;

-- 4. RLS policies — only task owner can access their steps
CREATE POLICY "Users can view own task steps"
  ON public.autonomous_task_steps FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.autonomous_tasks t 
      WHERE t.id = autonomous_task_steps.task_id 
      AND t.user_id = auth.uid()
    )
  );

-- Service role handles inserts/updates from edge functions
CREATE POLICY "Service role full access on task steps"
  ON public.autonomous_task_steps FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- 5. Enable realtime for step-level updates
ALTER PUBLICATION supabase_realtime ADD TABLE public.autonomous_task_steps;
