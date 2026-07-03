-- ═══ CONFIDENCE REINFORCEMENT RPC ═══
-- Increments access_count, refreshes last_accessed_at, and applies a small confidence boost
-- for memories that were actively retrieved during proactive recall.
-- This prevents useful frequently-recalled memories from decaying during the dream consolidation cycle.

CREATE OR REPLACE FUNCTION reinforce_recalled_memories(
  p_memory_ids UUID[],
  p_confidence_boost NUMERIC DEFAULT 0.03
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE user_memories
  SET
    access_count = COALESCE(access_count, 0) + 1,
    last_accessed_at = now(),
    confidence = LEAST(1.0, COALESCE(confidence, 0.5) + p_confidence_boost)
  WHERE id = ANY(p_memory_ids)
    AND is_active = true;
END;
$$;
