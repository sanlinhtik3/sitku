
-- Fix search_path for cleanup_old_logs
ALTER FUNCTION public.cleanup_old_logs() SET search_path = public;
