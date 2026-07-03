CREATE OR REPLACE FUNCTION public.increment_template_usage(template_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.agent_prompt_templates 
  SET usage_count = COALESCE(usage_count, 0) + 1 
  WHERE id = template_id;
END;
$$;