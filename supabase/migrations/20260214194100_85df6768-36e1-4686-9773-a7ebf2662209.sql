
-- Add trigger_type and event_config columns to agent_heartbeats
ALTER TABLE public.agent_heartbeats 
  ADD COLUMN IF NOT EXISTS trigger_type TEXT NOT NULL DEFAULT 'cron';

ALTER TABLE public.agent_heartbeats 
  ADD COLUMN IF NOT EXISTS event_config JSONB DEFAULT '{}';

-- Create validation trigger for trigger_type
CREATE OR REPLACE FUNCTION public.validate_heartbeat_trigger_type()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.trigger_type NOT IN ('cron', 'event', 'hybrid') THEN
    RAISE EXCEPTION 'Invalid trigger_type: %. Must be cron, event, or hybrid.', NEW.trigger_type;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS validate_heartbeat_trigger_type_trigger ON public.agent_heartbeats;
CREATE TRIGGER validate_heartbeat_trigger_type_trigger
  BEFORE INSERT OR UPDATE ON public.agent_heartbeats
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_heartbeat_trigger_type();

-- Enable realtime for admin monitoring
ALTER PUBLICATION supabase_realtime ADD TABLE public.agent_heartbeats;

-- Update seed_default_heartbeats function to auto-activate and set trigger types
CREATE OR REPLACE FUNCTION public.seed_default_heartbeats(p_user_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO agent_heartbeats (user_id, name, display_name, cron_expression, task_type, is_active, trigger_type, event_config, task_config)
  VALUES 
    (p_user_id, 'morning_briefing', '🌅 Saya Gyi Briefing', '0 7 * * *', 'briefing', true, 'cron', '{}', '{}'),
    (p_user_id, 'weekly_memory_review', '🧠 Memory Review', '0 20 * * 0', 'memory_review', true, 'hybrid', '{}', '{}'),
    (p_user_id, 'caring_check_in', '💛 Caring Check-in', '0 */6 * * *', 'check_in', true, 'event', '{"trigger_on": "inactivity", "threshold_hours": 1, "cooldown_minutes": 60}', '{}')
  ON CONFLICT DO NOTHING;
END;
$$;

-- One-time activation for existing users' default heartbeats
UPDATE public.agent_heartbeats 
SET is_active = true 
WHERE name IN ('morning_briefing', 'weekly_memory_review', 'caring_check_in')
  AND is_active = false;

-- Set trigger_type for existing heartbeats
UPDATE public.agent_heartbeats SET trigger_type = 'cron' WHERE name = 'morning_briefing' AND trigger_type = 'cron';
UPDATE public.agent_heartbeats SET trigger_type = 'hybrid' WHERE name = 'weekly_memory_review';
UPDATE public.agent_heartbeats SET trigger_type = 'event', event_config = '{"trigger_on": "inactivity", "threshold_hours": 1, "cooldown_minutes": 60}' WHERE name = 'caring_check_in';
