-- ═══ PHASE 4: Data Repair — Normalize one-off tasks + clean stale states ═══

-- 1. Backfill schedule_type and is_one_off for tasks with NULL cron_expression
UPDATE public.agent_heartbeats
SET task_config = COALESCE(task_config, '{}'::jsonb) || '{"schedule_type": "one_off", "is_one_off": true}'::jsonb
WHERE task_type = 'scheduled_task'
  AND cron_expression IS NULL
  AND (
    task_config->>'schedule_type' IS NULL 
    OR task_config->>'schedule_type' = 'one_off'
  );

-- 2. Deactivate already-fired one-off tasks that are still active
UPDATE public.agent_heartbeats
SET is_active = false
WHERE task_type = 'scheduled_task'
  AND cron_expression IS NULL
  AND is_active = true
  AND last_run_at IS NOT NULL
  AND last_status = 'success';