-- Phase 4: Advanced Features & Polish
-- 1. Daily Memory Logs
CREATE TABLE IF NOT EXISTS public.agent_daily_logs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
    log_date date NOT NULL DEFAULT CURRENT_DATE,
    content text NOT NULL,
    updated_at timestamptz DEFAULT now(),
    UNIQUE(user_id, log_date)
);

ALTER TABLE public.agent_daily_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage their daily logs" ON public.agent_daily_logs FOR ALL USING (auth.uid() = user_id);

-- 2. Heartbeat Configuration (Proactive Agent)
CREATE TABLE IF NOT EXISTS public.agent_heartbeat_config (
    user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
    enabled boolean DEFAULT false,
    interval_minutes integer DEFAULT 30,
    active_hours_start time DEFAULT '08:00',
    active_hours_end time DEFAULT '22:00',
    tasks_md text DEFAULT '- Check pending emails\n- Review today''s calendar\n- Summarize recent news',
    updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.agent_heartbeat_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage their heartbeat config" ON public.agent_heartbeat_config FOR ALL USING (auth.uid() = user_id);

-- 3. Hybrid Search Vector Setup (Assuming chat_memory_embeddings exists)
-- We add a TSVECTOR column for BM25 text search to complement the vector similarity
DO $$
BEGIN
    IF EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'chat_memory_embeddings') THEN
        ALTER TABLE public.chat_memory_embeddings ADD COLUMN IF NOT EXISTS fts tsvector GENERATED ALWAYS AS (to_tsvector('english', memory_text)) STORED;
        CREATE INDEX IF NOT EXISTS chat_memory_embeddings_fts_idx ON public.chat_memory_embeddings USING GIN (fts);
    END IF;
END $$;
