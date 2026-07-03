-- Fix get_user_agent_skills RPC - ORDER BY must be inside aggregate or use subquery
CREATE OR REPLACE FUNCTION get_user_agent_skills(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_skills JSONB;
BEGIN
  -- Use subquery to properly order before aggregation
  SELECT COALESCE(jsonb_agg(skill_obj), '[]'::jsonb) INTO v_skills
  FROM (
    SELECT jsonb_build_object(
      'skill_name', skill_name,
      'skill_category', skill_category,
      'mastery_level', mastery_level,
      'usage_count', usage_count,
      'unlocked_at', unlocked_at,
      'capabilities', skill_data->'capabilities'
    ) as skill_obj
    FROM public.agent_skills
    WHERE user_id = p_user_id
    ORDER BY mastery_level DESC, usage_count DESC
  ) AS ordered_skills;
  
  RETURN v_skills;
END;
$$;