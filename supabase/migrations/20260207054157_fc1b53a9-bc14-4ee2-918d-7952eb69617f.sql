-- ═══════════════════════════════════════════════════════════════════════════
-- ENHANCED HIVE MIND SYSTEM - Option B Full Features
-- Real AI Worker Execution, Job Dependencies, Quality Review, Full 7 Workers
-- ═══════════════════════════════════════════════════════════════════════════

-- 1. Add new columns to hive_jobs for enhanced features
ALTER TABLE public.hive_jobs 
ADD COLUMN IF NOT EXISTS depends_on UUID[] DEFAULT '{}',
ADD COLUMN IF NOT EXISTS execution_mode TEXT DEFAULT 'sequential',
ADD COLUMN IF NOT EXISTS worker_config JSONB DEFAULT '{}',
ADD COLUMN IF NOT EXISTS ai_prompt TEXT,
ADD COLUMN IF NOT EXISTS ai_result JSONB,
ADD COLUMN IF NOT EXISTS tokens_used INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS review_score DECIMAL(3,2),
ADD COLUMN IF NOT EXISTS reviewed_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS auto_approve_threshold DECIMAL(3,2) DEFAULT 0.85,
ADD COLUMN IF NOT EXISTS source_language TEXT DEFAULT 'auto',
ADD COLUMN IF NOT EXISTS target_language TEXT,
ADD COLUMN IF NOT EXISTS design_style TEXT,
ADD COLUMN IF NOT EXISTS template_id UUID;

-- 2. Create job templates table for reusable workflows
CREATE TABLE IF NOT EXISTS public.hive_job_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  name_mm TEXT,
  description TEXT,
  description_mm TEXT,
  category TEXT DEFAULT 'general',
  job_type TEXT NOT NULL,
  specialist_type TEXT,
  default_priority TEXT DEFAULT 'normal',
  default_config JSONB DEFAULT '{}',
  prompt_template TEXT,
  sub_task_templates JSONB DEFAULT '[]',
  is_active BOOLEAN DEFAULT true,
  usage_count INTEGER DEFAULT 0,
  avg_completion_time_ms INTEGER,
  success_rate DECIMAL(5,2),
  created_by UUID,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Create quality review history table
CREATE TABLE IF NOT EXISTS public.hive_job_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID REFERENCES public.hive_jobs(id) ON DELETE CASCADE NOT NULL,
  reviewer_type TEXT NOT NULL DEFAULT 'ai',
  review_score DECIMAL(3,2) NOT NULL,
  review_criteria JSONB DEFAULT '{}',
  feedback TEXT,
  feedback_mm TEXT,
  issues_found JSONB DEFAULT '[]',
  suggestions JSONB DEFAULT '[]',
  approved BOOLEAN DEFAULT false,
  reviewed_at TIMESTAMPTZ DEFAULT NOW(),
  reviewed_by UUID
);

-- 4. Create worker performance metrics table
CREATE TABLE IF NOT EXISTS public.hive_worker_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  specialist_type TEXT NOT NULL,
  period_start DATE NOT NULL,
  jobs_completed INTEGER DEFAULT 0,
  jobs_failed INTEGER DEFAULT 0,
  avg_completion_time_ms INTEGER,
  avg_quality_score DECIMAL(3,2),
  tokens_used INTEGER DEFAULT 0,
  feedback_positive INTEGER DEFAULT 0,
  feedback_negative INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (user_id, specialist_type, period_start)
);

-- 5. Create indexes for new tables
CREATE INDEX IF NOT EXISTS idx_hive_job_templates_category ON public.hive_job_templates(category) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_hive_job_reviews_job ON public.hive_job_reviews(job_id);
CREATE INDEX IF NOT EXISTS idx_hive_job_reviews_score ON public.hive_job_reviews(review_score);
CREATE INDEX IF NOT EXISTS idx_hive_worker_metrics_user ON public.hive_worker_metrics(user_id, specialist_type);
CREATE INDEX IF NOT EXISTS idx_hive_jobs_depends ON public.hive_jobs USING GIN (depends_on) WHERE depends_on != '{}';

-- 6. Enable RLS on new tables
ALTER TABLE public.hive_job_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hive_job_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hive_worker_metrics ENABLE ROW LEVEL SECURITY;

-- 7. RLS Policies for job templates (admin-managed, read by all)
CREATE POLICY "Anyone can view active templates" ON public.hive_job_templates
  FOR SELECT USING (is_active = true);

CREATE POLICY "Admins manage templates" ON public.hive_job_templates
  FOR ALL USING (public.has_role(auth.uid(), 'admin'));

-- 8. RLS Policies for job reviews
CREATE POLICY "View reviews for accessible jobs" ON public.hive_job_reviews
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM hive_jobs WHERE id = job_id AND (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin')))
  );

CREATE POLICY "Insert reviews for accessible jobs" ON public.hive_job_reviews
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM hive_jobs WHERE id = job_id AND (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin')))
  );

CREATE POLICY "Admins manage all reviews" ON public.hive_job_reviews
  FOR ALL USING (public.has_role(auth.uid(), 'admin'));

-- 9. RLS Policies for worker metrics
CREATE POLICY "Users view own metrics" ON public.hive_worker_metrics
  FOR SELECT USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "System can insert/update metrics" ON public.hive_worker_metrics
  FOR ALL USING (public.has_role(auth.uid(), 'admin'));

-- 10. RPC: Execute worker job with AI
CREATE OR REPLACE FUNCTION execute_hive_worker_job(
  p_job_id UUID,
  p_worker_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_job RECORD;
  v_lock_acquired BOOLEAN;
  v_result JSONB;
BEGIN
  -- Get job details
  SELECT * INTO v_job FROM hive_jobs WHERE id = p_job_id;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Job not found');
  END IF;
  
  -- Check dependencies are completed
  IF v_job.depends_on IS NOT NULL AND array_length(v_job.depends_on, 1) > 0 THEN
    IF EXISTS (
      SELECT 1 FROM hive_jobs 
      WHERE id = ANY(v_job.depends_on) 
      AND status NOT IN ('completed')
    ) THEN
      RETURN jsonb_build_object('success', false, 'error', 'Dependencies not completed', 'status', 'waiting');
    END IF;
  END IF;
  
  -- Try to acquire lock
  v_lock_acquired := acquire_hive_job_lock(p_job_id, COALESCE(p_worker_id, gen_random_uuid()), 10);
  
  IF NOT v_lock_acquired THEN
    RETURN jsonb_build_object('success', false, 'error', 'Could not acquire job lock');
  END IF;
  
  -- Return job details for worker execution
  RETURN jsonb_build_object(
    'success', true,
    'job_id', v_job.id,
    'title', v_job.title,
    'description', v_job.description,
    'job_type', v_job.job_type,
    'specialist_type', v_job.specialist_type,
    'ai_prompt', v_job.ai_prompt,
    'worker_config', v_job.worker_config,
    'context_snapshot', v_job.context_snapshot,
    'source_language', v_job.source_language,
    'target_language', v_job.target_language
  );
END;
$$;

-- 11. RPC: Submit worker job result with quality check
CREATE OR REPLACE FUNCTION submit_hive_job_result(
  p_job_id UUID,
  p_agent_id UUID,
  p_output JSONB,
  p_tokens_used INTEGER DEFAULT 0,
  p_auto_review BOOLEAN DEFAULT true
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_job RECORD;
  v_review_score DECIMAL(3,2) := 0.75;
  v_auto_approved BOOLEAN := false;
  v_status TEXT := 'review';
BEGIN
  -- Get job details
  SELECT * INTO v_job FROM hive_jobs WHERE id = p_job_id;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Job not found');
  END IF;
  
  -- Simple quality heuristics
  IF p_output IS NOT NULL THEN
    -- Has meaningful output
    IF jsonb_typeof(p_output) = 'object' AND p_output ? 'content' THEN
      v_review_score := v_review_score + 0.1;
    END IF;
    
    -- Output has reasonable length
    IF length(p_output::text) > 100 THEN
      v_review_score := v_review_score + 0.1;
    END IF;
  END IF;
  
  -- Auto-approve if score meets threshold
  IF v_review_score >= COALESCE(v_job.auto_approve_threshold, 0.85) THEN
    v_auto_approved := true;
    v_status := 'completed';
  END IF;
  
  -- Update job
  UPDATE hive_jobs SET
    output = p_output,
    ai_result = p_output,
    tokens_used = COALESCE(tokens_used, 0) + p_tokens_used,
    review_score = v_review_score,
    status = v_status,
    progress_percent = CASE WHEN v_status = 'completed' THEN 100 ELSE 90 END,
    completed_at = CASE WHEN v_status = 'completed' THEN NOW() ELSE NULL END,
    assigned_agent_id = NULL,
    locked_at = NULL,
    lock_expires_at = NULL
  WHERE id = p_job_id;
  
  -- Insert review record if auto-review enabled
  IF p_auto_review THEN
    INSERT INTO hive_job_reviews (job_id, reviewer_type, review_score, approved, feedback)
    VALUES (p_job_id, 'ai', v_review_score, v_auto_approved, 
      CASE WHEN v_auto_approved THEN 'Auto-approved: meets quality threshold' 
      ELSE 'Pending manual review' END);
  END IF;
  
  -- Log completion
  INSERT INTO hive_job_logs (job_id, agent_id, log_type, log_level, message, details)
  VALUES (p_job_id, p_agent_id, 'result', 'info', 
    'Job ' || CASE WHEN v_auto_approved THEN 'completed' ELSE 'submitted for review' END,
    jsonb_build_object('score', v_review_score, 'auto_approved', v_auto_approved, 'tokens', p_tokens_used));
  
  RETURN jsonb_build_object(
    'success', true,
    'status', v_status,
    'review_score', v_review_score,
    'auto_approved', v_auto_approved
  );
END;
$$;

-- 12. RPC: Get job dependencies chain
CREATE OR REPLACE FUNCTION get_job_dependency_chain(p_job_id UUID)
RETURNS TABLE (
  job_id UUID,
  title TEXT,
  status TEXT,
  depth INTEGER,
  is_blocking BOOLEAN
)
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH RECURSIVE dep_chain AS (
    -- Base case: the job itself
    SELECT j.id, j.title, j.status, 0 AS depth, false AS is_blocking
    FROM hive_jobs j
    WHERE j.id = p_job_id
    
    UNION ALL
    
    -- Recursive case: dependencies
    SELECT d.id, d.title, d.status, c.depth + 1, d.status != 'completed'
    FROM dep_chain c
    JOIN hive_jobs j ON j.id = c.job_id
    JOIN hive_jobs d ON d.id = ANY(j.depends_on)
    WHERE c.depth < 5 -- Max depth to prevent infinite loops
  )
  SELECT dc.job_id, dc.title, dc.status, dc.depth, dc.is_blocking
  FROM dep_chain dc
  ORDER BY dc.depth;
END;
$$;

-- 13. RPC: Get advanced hive analytics
CREATE OR REPLACE FUNCTION get_hive_analytics(
  p_time_range TEXT DEFAULT 'today',
  p_specialist_type TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  v_start_time TIMESTAMPTZ;
  v_result JSONB;
  v_total INTEGER;
  v_completed INTEGER;
  v_failed INTEGER;
  v_avg_time INTEGER;
  v_by_specialist JSONB;
  v_by_status JSONB;
  v_quality_metrics JSONB;
BEGIN
  -- Calculate start time
  v_start_time := CASE p_time_range
    WHEN 'today' THEN date_trunc('day', NOW())
    WHEN 'this_week' THEN date_trunc('week', NOW())
    WHEN 'this_month' THEN date_trunc('month', NOW())
    ELSE NOW() - INTERVAL '1 day'
  END;
  
  -- Basic counts
  SELECT 
    COUNT(*),
    COUNT(*) FILTER (WHERE status = 'completed'),
    COUNT(*) FILTER (WHERE status = 'failed')
  INTO v_total, v_completed, v_failed
  FROM hive_jobs
  WHERE created_at >= v_start_time
  AND (p_specialist_type IS NULL OR specialist_type = p_specialist_type);
  
  -- Average completion time
  SELECT AVG(EXTRACT(EPOCH FROM (completed_at - started_at)) * 1000)::INTEGER
  INTO v_avg_time
  FROM hive_jobs
  WHERE created_at >= v_start_time
  AND status = 'completed'
  AND started_at IS NOT NULL
  AND completed_at IS NOT NULL;
  
  -- By specialist
  SELECT jsonb_object_agg(
    COALESCE(specialist_type, 'unassigned'),
    jsonb_build_object('total', cnt, 'completed', comp, 'failed', fail)
  )
  INTO v_by_specialist
  FROM (
    SELECT 
      specialist_type,
      COUNT(*) AS cnt,
      COUNT(*) FILTER (WHERE status = 'completed') AS comp,
      COUNT(*) FILTER (WHERE status = 'failed') AS fail
    FROM hive_jobs
    WHERE created_at >= v_start_time
    GROUP BY specialist_type
  ) s;
  
  -- By status
  SELECT jsonb_object_agg(status, cnt)
  INTO v_by_status
  FROM (
    SELECT status, COUNT(*) AS cnt
    FROM hive_jobs
    WHERE created_at >= v_start_time
    GROUP BY status
  ) s;
  
  -- Quality metrics from reviews
  SELECT jsonb_build_object(
    'avg_score', AVG(review_score),
    'total_reviews', COUNT(*),
    'auto_approved', COUNT(*) FILTER (WHERE approved = true AND reviewer_type = 'ai'),
    'manual_approved', COUNT(*) FILTER (WHERE approved = true AND reviewer_type = 'human')
  )
  INTO v_quality_metrics
  FROM hive_job_reviews r
  JOIN hive_jobs j ON j.id = r.job_id
  WHERE j.created_at >= v_start_time;
  
  RETURN jsonb_build_object(
    'period', p_time_range,
    'total_jobs', v_total,
    'completed', v_completed,
    'failed', v_failed,
    'success_rate', CASE WHEN v_total > 0 THEN ROUND((v_completed::DECIMAL / v_total) * 100, 1) ELSE 0 END,
    'avg_completion_time_ms', COALESCE(v_avg_time, 0),
    'by_specialist', COALESCE(v_by_specialist, '{}'::JSONB),
    'by_status', COALESCE(v_by_status, '{}'::JSONB),
    'quality_metrics', COALESCE(v_quality_metrics, '{}'::JSONB)
  );
END;
$$;

-- 14. Insert default job templates for all 7 worker types
INSERT INTO public.hive_job_templates (name, name_mm, category, job_type, specialist_type, prompt_template, default_config) VALUES
-- Writer
('Content Writing', 'Content ရေးသားခြင်း', 'content', 'content', 'writer', 
 'Write {{content_type}} about: {{topic}}. Tone: {{tone}}. Length: {{length}} words.',
 '{"default_tone": "professional", "default_length": 500}'),

-- Researcher 
('Research Task', 'သုတေသနလုပ်ငန်း', 'research', 'research', 'researcher',
 'Research and gather information about: {{topic}}. Focus on: {{focus_areas}}. Provide: {{output_format}}.',
 '{"output_format": "structured_report", "max_sources": 5}'),

-- Analyst
('Data Analysis', 'Data ခွဲခြမ်းစိတ်ဖြာခြင်း', 'analysis', 'analysis', 'analyst',
 'Analyze the following data/situation: {{subject}}. Identify: {{analysis_type}}. Provide: {{deliverables}}.',
 '{"analysis_type": "trends_and_patterns", "include_visualization": true}'),

-- Coordinator
('Task Coordination', 'Task ညှိနှိုင်းခြင်း', 'workflow', 'automation', 'coordinator',
 'Coordinate and plan: {{objective}}. Resources: {{resources}}. Timeline: {{timeline}}.',
 '{"create_subtasks": true, "assign_specialists": true}'),

-- Coder
('Code Generation', 'Code ရေးသားခြင်း', 'development', 'automation', 'coder',
 'Generate {{code_type}} code for: {{requirement}}. Language: {{language}}. Standards: {{standards}}.',
 '{"language": "typescript", "include_tests": true}'),

-- Translator
('Translation', 'ဘာသာပြန်ခြင်း', 'translation', 'content', 'translator',
 'Translate the following from {{source_lang}} to {{target_lang}}: {{content}}. Style: {{style}}.',
 '{"preserve_formatting": true, "localize": true}'),

-- Designer
('Design Brief', 'ဒီဇိုင်းအကြံပြုချက်', 'design', 'content', 'designer',
 'Create design specifications for: {{project}}. Style: {{style}}. Platform: {{platform}}.',
 '{"include_colors": true, "include_typography": true, "format": "figma_spec"}')

ON CONFLICT DO NOTHING;

-- Enable realtime for new tables
ALTER PUBLICATION supabase_realtime ADD TABLE public.hive_job_reviews;
ALTER PUBLICATION supabase_realtime ADD TABLE public.hive_job_templates;