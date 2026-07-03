
-- Drop the existing check constraint
ALTER TABLE public.agent_heartbeats 
  DROP CONSTRAINT IF EXISTS valid_task_type;

-- Re-add with check_in included
ALTER TABLE public.agent_heartbeats 
  ADD CONSTRAINT valid_task_type 
    CHECK (task_type IN ('briefing', 'memory_review', 'check_in', 'custom'));

-- Update seed function to include caring_check_in default
CREATE OR REPLACE FUNCTION public.seed_default_heartbeats(p_user_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.agent_heartbeats (user_id, name, display_name, cron_expression, is_active, task_type, task_config)
  VALUES
    (p_user_id, 'morning_briefing', 'Morning Briefing', '30 1 * * *', false, 'briefing',
     '{"description": "Daily morning briefing with mood-aware Saya Gyi mentoring", "timezone": "Asia/Yangon"}'::jsonb),
    (p_user_id, 'weekly_memory_review', 'Weekly Memory Review', '30 14 * * 0', false, 'memory_review',
     '{"description": "Weekly review of conversations to extract and learn user preferences", "timezone": "Asia/Yangon"}'::jsonb),
    (p_user_id, 'caring_check_in', 'Caring Check-In', '0 6 * * *', false, 'check_in',
     '{"description": "Checks if user has been inactive for 24h and sends a warm caring message", "inactivity_threshold_hours": 24, "timezone": "Asia/Yangon"}'::jsonb)
  ON CONFLICT (user_id, name) DO NOTHING;
END;
$$;
