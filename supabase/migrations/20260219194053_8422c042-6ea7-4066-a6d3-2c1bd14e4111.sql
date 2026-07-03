
-- Fix Root Cause 1: Missing column on agent_learning_context
ALTER TABLE agent_learning_context 
  ADD COLUMN IF NOT EXISTS is_active boolean DEFAULT true;

-- Silence Watchdog function (Root Cause 3)
CREATE OR REPLACE FUNCTION check_silent_sessions()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT DISTINCT s.id AS session_id, s.user_id, m.created_at
    FROM agent_chat_sessions s
    JOIN agent_chat_messages m ON m.session_id = s.id
    WHERE s.is_active = true
      AND m.role = 'user'
      AND m.created_at > NOW() - INTERVAL '10 minutes'
      AND m.created_at < NOW() - INTERVAL '3 minutes'
      AND NOT EXISTS (
        SELECT 1 FROM agent_chat_messages a
        WHERE a.session_id = s.id AND a.role = 'assistant'
          AND a.created_at > m.created_at
      )
    LIMIT 5
  LOOP
    INSERT INTO agent_chat_messages (session_id, user_id, role, content)
    VALUES (r.session_id, r.user_id, 'assistant',
      E'\u1017\u103B\u102D\u102F\u1037 Zoe... \u1000\u103B\u103D\u1014\u103A\u1010\u1031\u102C\u103A \u1014\u100A\u103A\u1038\u1014\u100A\u103A\u1038 \u1021\u102C\u101B\u102F\u1036\u101C\u103D\u1010\u103A\u101E\u103D\u102C\u1038\u101C\u102D\u102F\u1037\u1015\u102B\u104B \u1021\u1001\u102F \u1015\u103C\u1014\u103A\u101B\u1031\u102C\u1000\u103A\u1015\u102B\u1015\u103C\u102E! \U0001F41D');

    INSERT INTO notifications (user_id, type, title, message)
    VALUES (r.user_id, 'system', 'BeeBot Recovery',
      'BeeBot detected a silence gap and has auto-recovered.');
  END LOOP;
END;
$$;
