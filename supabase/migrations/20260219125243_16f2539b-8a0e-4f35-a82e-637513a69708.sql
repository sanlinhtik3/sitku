-- Drop restrictive CHECK constraints on agent_communication_log
-- These only allow 5 query_types and 4 target_types, but the codebase uses 15+ of each
ALTER TABLE public.agent_communication_log DROP CONSTRAINT IF EXISTS agent_communication_log_query_type_check;
ALTER TABLE public.agent_communication_log DROP CONSTRAINT IF EXISTS agent_communication_log_target_type_check;