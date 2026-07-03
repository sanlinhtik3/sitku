DO $$
BEGIN
  PERFORM cron.unschedule('nba-analyzer-every-30min');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DROP TABLE IF EXISTS public.next_best_actions CASCADE;