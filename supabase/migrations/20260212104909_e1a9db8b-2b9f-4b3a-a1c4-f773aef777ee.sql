
-- Step 1a: Add module_tags column to agent_prompt_files
ALTER TABLE public.agent_prompt_files
ADD COLUMN module_tags TEXT[] DEFAULT '{}';

-- Step 1b: Populate default module_tags for existing prompt files
UPDATE public.agent_prompt_files SET module_tags = ARRAY['CORE'] WHERE file_name = 'CORE_IDENTITY.md';
UPDATE public.agent_prompt_files SET module_tags = ARRAY['CORE'] WHERE file_name = 'SECURITY.md';
UPDATE public.agent_prompt_files SET module_tags = ARRAY['CORE'] WHERE file_name = 'SECURITY_ISOLATION.md';
UPDATE public.agent_prompt_files SET module_tags = ARRAY['CORE'] WHERE file_name = 'RESPONSE_FORMAT.md';
UPDATE public.agent_prompt_files SET module_tags = ARRAY['CORE'] WHERE file_name = 'SOUL.md';
UPDATE public.agent_prompt_files SET module_tags = ARRAY['CORE'] WHERE file_name = 'STRICT_QUERY.md';
UPDATE public.agent_prompt_files SET module_tags = ARRAY['CORE'] WHERE file_name = 'CRITICAL_THINKING.md';
UPDATE public.agent_prompt_files SET module_tags = ARRAY['CORE'] WHERE file_name = 'USER_CONTEXT.md';
UPDATE public.agent_prompt_files SET module_tags = ARRAY['CORE'] WHERE file_name = 'LOCALIZED_INTELLIGENCE.md';
UPDATE public.agent_prompt_files SET module_tags = ARRAY['CORE', 'CONTENT'] WHERE file_name = 'TOOLS.md';
UPDATE public.agent_prompt_files SET module_tags = ARRAY['FINANCE', 'CONTENT', 'WORKSPACE'] WHERE file_name = 'RESOURCEFUL.md';
UPDATE public.agent_prompt_files SET module_tags = ARRAY['FINANCE', 'CONTENT'] WHERE file_name = 'USER_CONSENT.md';
UPDATE public.agent_prompt_files SET module_tags = ARRAY['KNOWLEDGE'] WHERE file_name = 'FULL_APP_KNOWLEDGE.md';
UPDATE public.agent_prompt_files SET module_tags = ARRAY['CORE'] WHERE file_name = 'FIRST_INTERACTION.md';
UPDATE public.agent_prompt_files SET module_tags = ARRAY['ADMIN'] WHERE file_name = 'SUPER_AGENT.md';
UPDATE public.agent_prompt_files SET module_tags = ARRAY['ADMIN'] WHERE file_name = 'ADMIN_SECTION.md';
UPDATE public.agent_prompt_files SET module_tags = ARRAY['HIVE'] WHERE file_name = 'HIVE_MIND_SYSTEM.md';
UPDATE public.agent_prompt_files SET module_tags = ARRAY['HIVE'] WHERE file_name = 'INTER_AGENT_COLLABORATION.md';

-- Create index for module_tags filtering
CREATE INDEX idx_agent_prompt_files_module_tags ON public.agent_prompt_files USING GIN(module_tags);

-- Step 1c: Create agent_knowledge_gaps table
CREATE TABLE public.agent_knowledge_gaps (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  topic TEXT NOT NULL,
  session_id UUID REFERENCES public.agent_chat_sessions(id),
  flagged_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved BOOLEAN DEFAULT false,
  resolved_at TIMESTAMPTZ,
  resolved_by UUID
);

-- Enable RLS
ALTER TABLE public.agent_knowledge_gaps ENABLE ROW LEVEL SECURITY;

-- Users can insert their own gaps
CREATE POLICY "Users can insert own knowledge gaps"
ON public.agent_knowledge_gaps
FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- Users can read their own gaps
CREATE POLICY "Users can read own knowledge gaps"
ON public.agent_knowledge_gaps
FOR SELECT
USING (auth.uid() = user_id);

-- Admins can read all gaps
CREATE POLICY "Admins can read all knowledge gaps"
ON public.agent_knowledge_gaps
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_roles.user_id = auth.uid()
    AND user_roles.role = 'admin'
  )
);

-- Admins can update gaps (mark resolved)
CREATE POLICY "Admins can update knowledge gaps"
ON public.agent_knowledge_gaps
FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_roles.user_id = auth.uid()
    AND user_roles.role = 'admin'
  )
);
