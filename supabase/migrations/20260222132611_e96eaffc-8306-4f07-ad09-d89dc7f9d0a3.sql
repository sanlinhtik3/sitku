
CREATE OR REPLACE FUNCTION public.check_user_has_anthropic_api_key(p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM ai_user_settings 
    WHERE user_id = p_user_id 
    AND personal_anthropic_key IS NOT NULL 
    AND personal_anthropic_key != ''
  );
$$;

GRANT EXECUTE ON FUNCTION public.check_user_has_anthropic_api_key(UUID) TO authenticated;
