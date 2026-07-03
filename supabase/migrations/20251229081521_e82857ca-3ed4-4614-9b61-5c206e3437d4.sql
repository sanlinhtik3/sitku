-- Add new columns to ai_user_settings for per-user control
ALTER TABLE public.ai_user_settings 
ADD COLUMN IF NOT EXISTS allow_gateway_access boolean DEFAULT true,
ADD COLUMN IF NOT EXISTS is_premium boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS total_generations integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS last_generation_at timestamp with time zone,
ADD COLUMN IF NOT EXISTS granted_by uuid,
ADD COLUMN IF NOT EXISTS granted_at timestamp with time zone,
ADD COLUMN IF NOT EXISTS notes text;

-- Create RPC function for admin to toggle user gateway access
CREATE OR REPLACE FUNCTION public.admin_toggle_ai_user_gateway(
  p_target_user_id uuid,
  p_allow_gateway boolean
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Check if caller is admin
  IF NOT has_role(auth.uid(), 'admin'::app_role) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthorized');
  END IF;
  
  -- Upsert the user settings
  INSERT INTO public.ai_user_settings (user_id, allow_gateway_access, updated_at)
  VALUES (p_target_user_id, p_allow_gateway, NOW())
  ON CONFLICT (user_id)
  DO UPDATE SET 
    allow_gateway_access = p_allow_gateway,
    updated_at = NOW();
  
  -- Log admin action
  PERFORM log_admin_action(
    'toggle_ai_gateway',
    'ai_user_settings',
    p_target_user_id,
    jsonb_build_object('allow_gateway', p_allow_gateway)
  );
  
  RETURN jsonb_build_object('success', true, 'allow_gateway', p_allow_gateway);
END;
$$;

-- Create RPC function for admin to toggle user premium status
CREATE OR REPLACE FUNCTION public.admin_toggle_ai_user_premium(
  p_target_user_id uuid,
  p_is_premium boolean
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Check if caller is admin
  IF NOT has_role(auth.uid(), 'admin'::app_role) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthorized');
  END IF;
  
  -- Upsert the user settings
  INSERT INTO public.ai_user_settings (user_id, is_premium, granted_by, granted_at, updated_at)
  VALUES (p_target_user_id, p_is_premium, auth.uid(), CASE WHEN p_is_premium THEN NOW() ELSE NULL END, NOW())
  ON CONFLICT (user_id)
  DO UPDATE SET 
    is_premium = p_is_premium,
    granted_by = CASE WHEN p_is_premium THEN auth.uid() ELSE NULL END,
    granted_at = CASE WHEN p_is_premium THEN NOW() ELSE NULL END,
    updated_at = NOW();
  
  -- Log admin action
  PERFORM log_admin_action(
    'toggle_ai_premium',
    'ai_user_settings',
    p_target_user_id,
    jsonb_build_object('is_premium', p_is_premium)
  );
  
  RETURN jsonb_build_object('success', true, 'is_premium', p_is_premium);
END;
$$;

-- Create RPC function for admin to clear user API key
CREATE OR REPLACE FUNCTION public.admin_clear_ai_user_key(
  p_target_user_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Check if caller is admin
  IF NOT has_role(auth.uid(), 'admin'::app_role) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthorized');
  END IF;
  
  -- Clear the API key
  UPDATE public.ai_user_settings
  SET gemini_api_key = NULL, updated_at = NOW()
  WHERE user_id = p_target_user_id;
  
  -- Log admin action
  PERFORM log_admin_action(
    'clear_ai_api_key',
    'ai_user_settings',
    p_target_user_id,
    NULL
  );
  
  RETURN jsonb_build_object('success', true);
END;
$$;