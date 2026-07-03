-- ═══════════════════════════════════════════════════════════════════
-- HIVE MIND SYSTEM - Core Tables and Concurrency Control
-- ═══════════════════════════════════════════════════════════════════

-- Table 1: Central Job Board
CREATE TABLE public.hive_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_job_id UUID REFERENCES public.hive_jobs(id) ON DELETE SET NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  
  -- Job Identity
  title TEXT NOT NULL,
  description TEXT,
  job_type TEXT NOT NULL DEFAULT 'task',
  priority TEXT DEFAULT 'normal',
  
  -- State Machine
  status TEXT NOT NULL DEFAULT 'pending',
  
  -- Agent Assignment (Concurrency Locking)
  assigned_agent_id UUID,
  locked_at TIMESTAMPTZ,
  lock_expires_at TIMESTAMPTZ,
  
  -- Execution
  agent_type TEXT DEFAULT 'worker',
  specialist_type TEXT,
  context_snapshot JSONB DEFAULT '{}',
  execution_plan JSONB,
  
  -- Progress
  progress_percent INTEGER DEFAULT 0,
  current_step TEXT,
  step_message TEXT,
  estimated_duration_ms INTEGER,
  
  -- Results
  output JSONB,
  output_type TEXT,
  artifacts JSONB DEFAULT '[]',
  
  -- Review
  review_criteria JSONB,
  review_result TEXT,
  review_feedback TEXT,
  reviewed_by UUID,
  reviewed_at TIMESTAMPTZ,
  retry_count INTEGER DEFAULT 0,
  max_retries INTEGER DEFAULT 3,
  
  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  error_message TEXT,
  metadata JSONB DEFAULT '{}'
);

-- Table 2: Agent Thinking/Reasoning Logs
CREATE TABLE public.hive_job_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID REFERENCES public.hive_jobs(id) ON DELETE CASCADE NOT NULL,
  agent_id UUID,
  
  log_type TEXT NOT NULL,
  log_level TEXT DEFAULT 'info',
  message TEXT NOT NULL,
  details JSONB,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  duration_ms INTEGER
);

-- Indexes for performance
CREATE INDEX idx_hive_jobs_user_status ON public.hive_jobs(user_id, status);
CREATE INDEX idx_hive_jobs_pending ON public.hive_jobs(status) WHERE status IN ('pending', 'queued');
CREATE INDEX idx_hive_jobs_assigned ON public.hive_jobs(assigned_agent_id) WHERE assigned_agent_id IS NOT NULL;
CREATE INDEX idx_hive_jobs_parent ON public.hive_jobs(parent_job_id) WHERE parent_job_id IS NOT NULL;
CREATE INDEX idx_hive_job_logs_job ON public.hive_job_logs(job_id);
CREATE INDEX idx_hive_job_logs_type ON public.hive_job_logs(log_type);

-- Enable RLS
ALTER TABLE public.hive_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hive_job_logs ENABLE ROW LEVEL SECURITY;

-- RLS Policies for hive_jobs
CREATE POLICY "Users view own jobs" ON public.hive_jobs
  FOR SELECT USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins manage all jobs" ON public.hive_jobs
  FOR ALL USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Users insert own jobs" ON public.hive_jobs
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users update own jobs" ON public.hive_jobs
  FOR UPDATE USING (auth.uid() = user_id);

-- RLS Policies for hive_job_logs
CREATE POLICY "View logs for accessible jobs" ON public.hive_job_logs
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.hive_jobs WHERE id = job_id AND (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin')))
  );

CREATE POLICY "Insert logs for accessible jobs" ON public.hive_job_logs
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM public.hive_jobs WHERE id = job_id AND (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin')))
  );

-- Enable Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.hive_jobs;
ALTER PUBLICATION supabase_realtime ADD TABLE public.hive_job_logs;

-- ═══════════════════════════════════════════════════════════════════
-- Concurrency Control RPCs
-- ═══════════════════════════════════════════════════════════════════

-- RPC: Acquire job lock (prevents conflicts)
CREATE OR REPLACE FUNCTION public.acquire_hive_job_lock(
  p_job_id UUID, 
  p_agent_id UUID,
  p_lock_duration_minutes INTEGER DEFAULT 5
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_locked BOOLEAN := FALSE;
BEGIN
  UPDATE hive_jobs
  SET 
    assigned_agent_id = p_agent_id,
    locked_at = NOW(),
    lock_expires_at = NOW() + (p_lock_duration_minutes || ' minutes')::INTERVAL,
    status = 'in_progress',
    started_at = COALESCE(started_at, NOW())
  WHERE id = p_job_id
    AND status IN ('pending', 'queued')
    AND (assigned_agent_id IS NULL OR lock_expires_at < NOW())
  RETURNING TRUE INTO v_locked;
  
  RETURN COALESCE(v_locked, FALSE);
END;
$$;

-- RPC: Release job lock with result
CREATE OR REPLACE FUNCTION public.release_hive_job_lock(
  p_job_id UUID, 
  p_agent_id UUID, 
  p_status TEXT,
  p_output JSONB DEFAULT NULL,
  p_error_message TEXT DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE hive_jobs
  SET 
    status = p_status,
    output = COALESCE(p_output, output),
    error_message = p_error_message,
    completed_at = CASE WHEN p_status IN ('completed', 'failed') THEN NOW() ELSE NULL END,
    progress_percent = CASE WHEN p_status = 'completed' THEN 100 ELSE progress_percent END,
    assigned_agent_id = NULL,
    locked_at = NULL,
    lock_expires_at = NULL
  WHERE id = p_job_id
    AND assigned_agent_id = p_agent_id;
    
  RETURN FOUND;
END;
$$;

-- RPC: Update job progress
CREATE OR REPLACE FUNCTION public.update_hive_job_progress(
  p_job_id UUID,
  p_progress INTEGER,
  p_step TEXT DEFAULT NULL,
  p_message TEXT DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE hive_jobs
  SET 
    progress_percent = LEAST(p_progress, 100),
    current_step = COALESCE(p_step, current_step),
    step_message = COALESCE(p_message, step_message)
  WHERE id = p_job_id;
  
  RETURN FOUND;
END;
$$;

-- RPC: Get pending jobs for worker
CREATE OR REPLACE FUNCTION public.get_pending_hive_jobs(
  p_user_id UUID DEFAULT NULL,
  p_specialist_type TEXT DEFAULT NULL,
  p_limit INTEGER DEFAULT 10
)
RETURNS TABLE (
  id UUID,
  title TEXT,
  job_type TEXT,
  priority TEXT,
  specialist_type TEXT,
  context_snapshot JSONB,
  created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    j.id,
    j.title,
    j.job_type,
    j.priority,
    j.specialist_type,
    j.context_snapshot,
    j.created_at
  FROM hive_jobs j
  WHERE j.status = 'pending'
    AND (p_user_id IS NULL OR j.user_id = p_user_id)
    AND (p_specialist_type IS NULL OR j.specialist_type = p_specialist_type)
    AND (j.assigned_agent_id IS NULL OR j.lock_expires_at < NOW())
  ORDER BY 
    CASE j.priority 
      WHEN 'urgent' THEN 1 
      WHEN 'high' THEN 2 
      WHEN 'normal' THEN 3 
      ELSE 4 
    END,
    j.created_at
  LIMIT p_limit;
END;
$$;