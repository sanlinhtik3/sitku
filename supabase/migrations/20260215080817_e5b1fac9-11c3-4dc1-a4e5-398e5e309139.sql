
-- Auto-provisioning trigger: create default heartbeats for every new user
CREATE OR REPLACE FUNCTION public.provision_default_heartbeats()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.agent_heartbeats (user_id, name, display_name, cron_expression, task_type, trigger_type, is_active)
  VALUES
    (NEW.user_id, 'morning_briefing', 'Morning Briefing', '0 7 * * *', 'briefing', 'cron', false),
    (NEW.user_id, 'weekly_memory_review', 'Weekly Memory Review', '0 9 * * 1', 'memory_review', 'cron', false),
    (NEW.user_id, 'caring_check_in', 'Caring Check-In', '0 */5 * * *', 'check_in', 'hybrid', false);
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_profile_created_provision_heartbeats
  AFTER INSERT ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.provision_default_heartbeats();
