
CREATE TABLE public.agent_sync_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  entity_type text NOT NULL,
  entity_id uuid NOT NULL,
  action text NOT NULL,
  synced_at timestamptz,
  local_updated_at timestamptz NOT NULL,
  cloud_updated_at timestamptz,
  sync_status text DEFAULT 'pending',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.agent_sync_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own sync logs"
  ON public.agent_sync_log
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX idx_agent_sync_log_user_status ON public.agent_sync_log(user_id, sync_status);
CREATE INDEX idx_agent_sync_log_entity ON public.agent_sync_log(entity_type, entity_id);
