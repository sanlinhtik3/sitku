
-- Make source_session_id nullable and drop FK constraint to prevent silent failures
-- The session ID is informational, not relational - it shouldn't block memory storage
ALTER TABLE public.user_memories
DROP CONSTRAINT IF EXISTS user_memories_source_session_id_fkey;
