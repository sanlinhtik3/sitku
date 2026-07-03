
CREATE TABLE public.memory_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  session_id UUID NOT NULL,
  task_type TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'pending',
  retry_count INT DEFAULT 0,
  locked_until TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  processed_at TIMESTAMPTZ
);

CREATE INDEX idx_memory_queue_pending ON public.memory_queue (status, created_at) WHERE status = 'pending';
CREATE INDEX idx_memory_queue_session ON public.memory_queue (session_id);

ALTER TABLE public.memory_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access on memory_queue"
  ON public.memory_queue
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
