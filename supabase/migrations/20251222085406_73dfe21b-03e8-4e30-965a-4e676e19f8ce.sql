-- =====================================================
-- CREATOR ROCKET PREMIUM INTEGRATION
-- Phase 1: Database Schema & Security
-- =====================================================

-- Step 1: Add subscription columns to cr_user_usage
ALTER TABLE public.cr_user_usage 
ADD COLUMN IF NOT EXISTS subscription_tier text DEFAULT 'free' 
  CHECK (subscription_tier IN ('free', 'monthly', 'yearly', 'lifetime'));

ALTER TABLE public.cr_user_usage 
ADD COLUMN IF NOT EXISTS premium_access_until timestamptz;

ALTER TABLE public.cr_user_usage 
ADD COLUMN IF NOT EXISTS granted_by uuid REFERENCES auth.users(id);

ALTER TABLE public.cr_user_usage 
ADD COLUMN IF NOT EXISTS granted_at timestamptz;

-- Index for quick tier lookups
CREATE INDEX IF NOT EXISTS idx_cr_user_usage_tier ON public.cr_user_usage(subscription_tier);
CREATE INDEX IF NOT EXISTS idx_cr_user_usage_premium_until ON public.cr_user_usage(premium_access_until);

-- Step 2: Create blueprint components table (defines the 16 components)
CREATE TABLE IF NOT EXISTS public.cr_blueprint_components (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pillar text NOT NULL CHECK (pillar IN ('identity_core', 'content_engine', 'growth_velocity', 'monetization_fuel')),
  component_key text UNIQUE NOT NULL,
  component_name text NOT NULL,
  component_name_mm text,
  icon text NOT NULL DEFAULT '📌',
  description text,
  is_premium boolean DEFAULT true,
  order_index integer DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

-- Enable RLS on blueprint components
ALTER TABLE public.cr_blueprint_components ENABLE ROW LEVEL SECURITY;

-- Anyone can view blueprint components (for showing locked structure)
CREATE POLICY "Anyone can view blueprint components"
ON public.cr_blueprint_components FOR SELECT
USING (true);

-- Only admins can manage components
CREATE POLICY "Admins can manage blueprint components"
ON public.cr_blueprint_components FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Step 3: Insert the 16 blueprint components
INSERT INTO public.cr_blueprint_components (pillar, component_key, component_name, component_name_mm, icon, is_premium, order_index) VALUES
-- Identity Core (5)
('identity_core', 'ikigai', 'Your Ikigai Map', 'သင့် Ikigai မြေပုံ', '🎯', true, 1),
('identity_core', 'positioning', 'Market Positioning', 'စျေးကွက်တွင် နေရာယူခြင်း', '📍', true, 2),
('identity_core', 'voice', 'Unique Voice Blueprint', 'ထူးခြားသော အသံ ဗျူဟာ', '🎤', true, 3),
('identity_core', 'visuals', 'Visual Identity Guide', 'Visual Identity လမ်းညွှန်', '🎨', true, 4),
('identity_core', 'tech_stack', 'Tech Stack Recommendations', 'Tech Stack အကြံပြုချက်များ', '⚙️', true, 5),
-- Content Engine (5)
('content_engine', 'master_prompt', 'Master Prompt Library', 'Master Prompt စာကြည့်တိုက်', '🧠', true, 6),
('content_engine', 'content_ideas', '50 Content Ideas', 'Content Ideas ၅၀ ခု', '💡', true, 7),
('content_engine', 'hooks', 'Viral Hook Templates', 'Viral Hook Templates', '🪝', true, 8),
('content_engine', 'templates', 'Content Templates', 'Content Templates', '📝', true, 9),
('content_engine', 'system', 'Content System Setup', 'Content System Setup', '🔄', true, 10),
-- Growth Velocity (4)
('growth_velocity', 'roadmap', '90-Day Growth Roadmap', '၉၀ ရက် ကြီးထွားမှု Roadmap', '🗺️', true, 11),
('growth_velocity', 'launch_sequence', 'Launch Sequence', 'Launch Sequence', '🚀', true, 12),
('growth_velocity', 'collab_db', 'Collaboration Database', 'Collaboration Database', '🤝', true, 13),
('growth_velocity', 'crisis_mgmt', 'Crisis Management Plan', 'Crisis Management Plan', '🛡️', true, 14),
-- Monetization Fuel (2)
('monetization_fuel', 'blueprint', 'Monetization Blueprint', 'ငွေရှာနည်း ဗျူဟာ', '💰', true, 15),
('monetization_fuel', 'superfan_funnel', 'Superfan Funnel', 'Superfan Funnel', '❤️', true, 16)
ON CONFLICT (component_key) DO NOTHING;

-- Step 4: Create premium responses table (stores the actual premium content separately)
CREATE TABLE IF NOT EXISTS public.cr_premium_responses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  response_id uuid NOT NULL REFERENCES public.cr_responses(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  component_key text NOT NULL REFERENCES public.cr_blueprint_components(component_key),
  content jsonb NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  
  UNIQUE(response_id, component_key)
);

-- Enable RLS on premium responses
ALTER TABLE public.cr_premium_responses ENABLE ROW LEVEL SECURITY;

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_cr_premium_responses_user ON public.cr_premium_responses(user_id);
CREATE INDEX IF NOT EXISTS idx_cr_premium_responses_response ON public.cr_premium_responses(response_id);

-- Step 5: RLS Policies for premium responses (CRITICAL SECURITY)

-- Users can ONLY view their own premium content IF they have active subscription
CREATE POLICY "Users can view own premium content with active subscription"
ON public.cr_premium_responses FOR SELECT
USING (
  auth.uid() = user_id
  AND EXISTS (
    SELECT 1 FROM public.cr_user_usage
    WHERE user_id = auth.uid()
    AND (
      is_premium = true
      OR (
        subscription_tier IN ('monthly', 'yearly', 'lifetime')
        AND (
          premium_access_until IS NULL -- lifetime never expires
          OR premium_access_until > NOW()
        )
      )
    )
  )
);

-- System can insert premium responses (for edge function)
CREATE POLICY "System can insert premium responses"
ON public.cr_premium_responses FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- Admins can view all premium content (for support)
CREATE POLICY "Admins can view all premium content"
ON public.cr_premium_responses FOR SELECT
USING (has_role(auth.uid(), 'admin'::app_role));

-- Admins can manage all premium content
CREATE POLICY "Admins can manage premium content"
ON public.cr_premium_responses FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Step 6: Admin function to grant premium access
CREATE OR REPLACE FUNCTION public.admin_grant_premium_access(
  p_target_user_id uuid,
  p_tier text,
  p_duration_months integer DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_expires_at timestamptz;
BEGIN
  -- Verify caller is admin
  IF NOT has_role(auth.uid(), 'admin'::app_role) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthorized');
  END IF;
  
  -- Validate tier
  IF p_tier NOT IN ('free', 'monthly', 'yearly', 'lifetime') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid tier');
  END IF;
  
  -- Calculate expiration
  IF p_tier = 'lifetime' THEN
    v_expires_at := NULL;
  ELSIF p_tier = 'free' THEN
    v_expires_at := NULL;
  ELSIF p_duration_months IS NOT NULL THEN
    v_expires_at := NOW() + (p_duration_months || ' months')::interval;
  ELSIF p_tier = 'yearly' THEN
    v_expires_at := NOW() + INTERVAL '1 year';
  ELSE
    v_expires_at := NOW() + INTERVAL '1 month';
  END IF;
  
  -- Update or insert user usage
  INSERT INTO public.cr_user_usage (user_id, subscription_tier, is_premium, premium_access_until, granted_by, granted_at)
  VALUES (p_target_user_id, p_tier, p_tier != 'free', v_expires_at, auth.uid(), NOW())
  ON CONFLICT (user_id) DO UPDATE SET
    subscription_tier = p_tier,
    is_premium = p_tier != 'free',
    premium_access_until = v_expires_at,
    granted_by = auth.uid(),
    granted_at = NOW(),
    updated_at = NOW();
  
  -- Log admin action
  PERFORM log_admin_action(
    'grant_premium_access',
    'cr_user_usage',
    p_target_user_id,
    jsonb_build_object(
      'tier', p_tier,
      'duration_months', p_duration_months,
      'expires_at', v_expires_at
    )
  );
  
  RETURN jsonb_build_object(
    'success', true,
    'tier', p_tier,
    'expires_at', v_expires_at
  );
END;
$$;

-- Step 7: Function to check if user has premium blueprint access
CREATE OR REPLACE FUNCTION public.check_premium_blueprint_access(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_usage RECORD;
  v_has_access boolean := false;
  v_days_remaining integer := 0;
BEGIN
  SELECT * INTO v_usage FROM public.cr_user_usage WHERE user_id = p_user_id;
  
  IF v_usage IS NULL THEN
    RETURN jsonb_build_object(
      'has_access', false,
      'tier', 'free',
      'days_remaining', 0,
      'expires_at', null
    );
  END IF;
  
  -- Check access
  v_has_access := v_usage.is_premium OR (
    v_usage.subscription_tier IN ('monthly', 'yearly', 'lifetime')
    AND (
      v_usage.premium_access_until IS NULL
      OR v_usage.premium_access_until > NOW()
    )
  );
  
  -- Calculate days remaining
  IF v_usage.premium_access_until IS NOT NULL THEN
    v_days_remaining := GREATEST(0, EXTRACT(DAY FROM v_usage.premium_access_until - NOW())::integer);
  ELSIF v_usage.subscription_tier = 'lifetime' OR v_usage.is_premium THEN
    v_days_remaining := -1; -- Unlimited
  END IF;
  
  RETURN jsonb_build_object(
    'has_access', v_has_access,
    'tier', v_usage.subscription_tier,
    'is_premium', v_usage.is_premium,
    'days_remaining', v_days_remaining,
    'expires_at', v_usage.premium_access_until,
    'granted_at', v_usage.granted_at
  );
END;
$$;