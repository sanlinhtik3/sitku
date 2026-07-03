
-- Create agent_tool_permissions table for persistent allowlist
CREATE TABLE public.agent_tool_permissions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  pattern TEXT NOT NULL,
  permission TEXT NOT NULL CHECK (permission IN ('allow', 'deny')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Unique constraint: one permission per pattern per user
CREATE UNIQUE INDEX idx_agent_tool_permissions_unique ON public.agent_tool_permissions (user_id, pattern);

-- Index for fast lookups
CREATE INDEX idx_agent_tool_permissions_user ON public.agent_tool_permissions (user_id);

-- Enable RLS
ALTER TABLE public.agent_tool_permissions ENABLE ROW LEVEL SECURITY;

-- RLS: Users can only manage their own permissions
CREATE POLICY "Users can view their own tool permissions"
  ON public.agent_tool_permissions FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own tool permissions"
  ON public.agent_tool_permissions FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own tool permissions"
  ON public.agent_tool_permissions FOR DELETE
  USING (auth.uid() = user_id);

-- Add strict_mode to user_agent_settings
ALTER TABLE public.user_agent_settings
  ADD COLUMN IF NOT EXISTS strict_mode BOOLEAN NOT NULL DEFAULT false;
