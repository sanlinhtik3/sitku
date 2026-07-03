
CREATE TABLE public.agent_heartbeat_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  heartbeat_id uuid REFERENCES public.agent_heartbeats(id) ON DELETE CASCADE NOT NULL,
  user_id uuid NOT NULL,
  status text NOT NULL,
  result jsonb,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.agent_heartbeat_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view all heartbeat logs"
  ON public.agent_heartbeat_logs
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE INDEX idx_heartbeat_logs_heartbeat_id ON public.agent_heartbeat_logs(heartbeat_id);
CREATE INDEX idx_heartbeat_logs_created_at ON public.agent_heartbeat_logs(created_at DESC);
