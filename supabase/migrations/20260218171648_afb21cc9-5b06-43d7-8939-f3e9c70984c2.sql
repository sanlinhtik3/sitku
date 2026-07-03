-- Phase 4: Legacy Hive Mind Cleanup
-- Drop all legacy Hive Mind tables (dependency order)
DROP TABLE IF EXISTS hive_job_logs CASCADE;
DROP TABLE IF EXISTS hive_job_reviews CASCADE;
DROP TABLE IF EXISTS hive_worker_metrics CASCADE;
DROP TABLE IF EXISTS hive_job_templates CASCADE;
DROP TABLE IF EXISTS hive_jobs CASCADE;

-- Drop all legacy Hive Mind functions
DROP FUNCTION IF EXISTS acquire_hive_job_lock CASCADE;
DROP FUNCTION IF EXISTS release_hive_job_lock CASCADE;
DROP FUNCTION IF EXISTS execute_hive_worker_job CASCADE;
DROP FUNCTION IF EXISTS get_hive_analytics CASCADE;
DROP FUNCTION IF EXISTS get_pending_hive_jobs CASCADE;
DROP FUNCTION IF EXISTS submit_hive_job_result CASCADE;
DROP FUNCTION IF EXISTS update_hive_job_progress CASCADE;

-- Enable realtime for sub-agent monitoring
ALTER PUBLICATION supabase_realtime ADD TABLE public.agent_sub_tasks;