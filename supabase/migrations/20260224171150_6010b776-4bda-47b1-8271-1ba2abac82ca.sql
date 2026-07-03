-- OpenClaw Isolation: Backfill session DNA labels
-- Label group sessions
UPDATE agent_chat_sessions
SET metadata = COALESCE(metadata, '{}'::jsonb) || '{"kind": "subagent-group"}'::jsonb
WHERE title LIKE '[TG-Group]%' OR metadata->>'gateway' = 'group';

-- Label heartbeat sessions  
UPDATE agent_chat_sessions
SET metadata = COALESCE(metadata, '{}'::jsonb) || '{"kind": "heartbeat"}'::jsonb
WHERE title LIKE '[Heartbeat]%';

-- Label all remaining as partner
UPDATE agent_chat_sessions
SET metadata = COALESCE(metadata, '{}'::jsonb) || '{"kind": "partner"}'::jsonb
WHERE metadata->>'kind' IS NULL;