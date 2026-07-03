
-- Agent local heartbeat table for cloud-relay detection
CREATE TABLE public.agent_local_heartbeats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  agent_version TEXT NOT NULL DEFAULT '0.0.0',
  capabilities TEXT[] DEFAULT '{}',
  ollama_info JSONB DEFAULT NULL,
  sync_status TEXT DEFAULT 'synced',
  connection_count INTEGER DEFAULT 0,
  workspace_path TEXT DEFAULT NULL,
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id)
);

-- RLS
ALTER TABLE public.agent_local_heartbeats ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own heartbeat"
  ON public.agent_local_heartbeats FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can upsert own heartbeat"
  ON public.agent_local_heartbeats FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own heartbeat"
  ON public.agent_local_heartbeats FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Allow anon key to upsert (local agent uses anon key + user token)
CREATE POLICY "Anon can upsert heartbeat with user_id"
  ON public.agent_local_heartbeats FOR INSERT
  TO anon
  WITH CHECK (true);

CREATE POLICY "Anon can update heartbeat"
  ON public.agent_local_heartbeats FOR UPDATE
  TO anon
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Anon can read heartbeat"
  ON public.agent_local_heartbeats FOR SELECT
  TO anon
  USING (true);
