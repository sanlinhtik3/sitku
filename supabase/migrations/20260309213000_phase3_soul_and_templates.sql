-- Phase 3: Agent Intelligence & Identity
-- 1. SOUL Config Table (Agent Personality)
CREATE TABLE IF NOT EXISTS public.agent_soul_config (
    user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
    soul_text text NOT NULL DEFAULT 'You are BeeBot, a helpful, friendly, and highly capable AI assistant. You speak clearly, professionally, and use a warm tone.',
    updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.agent_soul_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage their own agent soul" ON public.agent_soul_config
    FOR ALL USING (auth.uid() = user_id);

-- 2. Prompt Templates Table
CREATE TABLE IF NOT EXISTS public.agent_prompt_templates (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
    title text NOT NULL,
    prompt_text text NOT NULL,
    category text,
    usage_count integer DEFAULT 0,
    created_at timestamptz DEFAULT now()
);

ALTER TABLE public.agent_prompt_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage their own templates" ON public.agent_prompt_templates
    FOR ALL USING (auth.uid() = user_id);

-- Insert some default templates for users automatically via trigger or just let app handle it.
