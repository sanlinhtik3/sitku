-- =============================================
-- CREATOR ROCKET DATABASE SCHEMA
-- =============================================

-- 1. CR_QUESTIONS TABLE - Dynamic questions with ordering
CREATE TABLE public.cr_questions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  question_text TEXT NOT NULL,
  question_type TEXT NOT NULL DEFAULT 'choice' CHECK (question_type IN ('text', 'choice', 'multiselect')),
  options JSONB DEFAULT '[]'::jsonb,
  order_index INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  metadata JSONB DEFAULT '{}'::jsonb,
  icon TEXT DEFAULT 'Brain',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- 2. CR_USER_USAGE TABLE - Track user attempts
CREATE TABLE public.cr_user_usage (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE,
  attempts_remaining INTEGER NOT NULL DEFAULT 3,
  total_attempts_used INTEGER NOT NULL DEFAULT 0,
  is_premium BOOLEAN NOT NULL DEFAULT false,
  last_attempt_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- 3. CR_RESPONSES TABLE - Store user answers and AI results
CREATE TABLE public.cr_responses (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  answers JSONB NOT NULL DEFAULT '[]'::jsonb,
  archetype TEXT,
  archetype_description TEXT,
  stats JSONB DEFAULT '{}'::jsonb,
  strategy TEXT,
  processing_status TEXT NOT NULL DEFAULT 'pending' CHECK (processing_status IN ('pending', 'processing', 'completed', 'failed')),
  completed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create indexes for performance
CREATE INDEX idx_cr_questions_order ON public.cr_questions(order_index) WHERE is_active = true;
CREATE INDEX idx_cr_user_usage_user ON public.cr_user_usage(user_id);
CREATE INDEX idx_cr_responses_user ON public.cr_responses(user_id);
CREATE INDEX idx_cr_responses_status ON public.cr_responses(processing_status);

-- =============================================
-- ENABLE RLS
-- =============================================
ALTER TABLE public.cr_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cr_user_usage ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cr_responses ENABLE ROW LEVEL SECURITY;

-- =============================================
-- RLS POLICIES FOR CR_QUESTIONS
-- =============================================
CREATE POLICY "Anyone can view active questions"
  ON public.cr_questions FOR SELECT
  USING (is_active = true);

CREATE POLICY "Admins can manage all questions"
  ON public.cr_questions FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- =============================================
-- RLS POLICIES FOR CR_USER_USAGE
-- =============================================
CREATE POLICY "Users can view own usage"
  ON public.cr_user_usage FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "System can insert usage"
  ON public.cr_user_usage FOR INSERT
  WITH CHECK (true);

CREATE POLICY "System can update usage"
  ON public.cr_user_usage FOR UPDATE
  USING (true);

CREATE POLICY "Admins can view all usage"
  ON public.cr_user_usage FOR SELECT
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can manage all usage"
  ON public.cr_user_usage FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- =============================================
-- RLS POLICIES FOR CR_RESPONSES
-- =============================================
CREATE POLICY "Users can view own responses"
  ON public.cr_responses FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own responses"
  ON public.cr_responses FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "System can update responses"
  ON public.cr_responses FOR UPDATE
  USING (true);

CREATE POLICY "Admins can view all responses"
  ON public.cr_responses FOR SELECT
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can manage all responses"
  ON public.cr_responses FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- =============================================
-- DATABASE FUNCTIONS
-- =============================================

-- Function to check if user can access Creator Rocket
CREATE OR REPLACE FUNCTION public.check_cr_access(p_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_usage RECORD;
BEGIN
  SELECT * INTO v_usage FROM public.cr_user_usage WHERE user_id = p_user_id;
  
  IF v_usage IS NULL THEN
    -- Initialize usage for new user
    INSERT INTO public.cr_user_usage (user_id, attempts_remaining)
    VALUES (p_user_id, 3)
    RETURNING * INTO v_usage;
  END IF;
  
  RETURN jsonb_build_object(
    'can_access', v_usage.attempts_remaining > 0 OR v_usage.is_premium,
    'attempts_remaining', v_usage.attempts_remaining,
    'total_attempts_used', v_usage.total_attempts_used,
    'is_premium', v_usage.is_premium
  );
END;
$$;

-- Function to deduct an attempt
CREATE OR REPLACE FUNCTION public.deduct_cr_attempt(p_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_usage RECORD;
BEGIN
  SELECT * INTO v_usage FROM public.cr_user_usage WHERE user_id = p_user_id FOR UPDATE;
  
  IF v_usage IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'User not found');
  END IF;
  
  -- Premium users don't lose attempts
  IF v_usage.is_premium THEN
    UPDATE public.cr_user_usage
    SET total_attempts_used = total_attempts_used + 1,
        last_attempt_at = NOW(),
        updated_at = NOW()
    WHERE user_id = p_user_id;
    
    RETURN jsonb_build_object('success', true, 'attempts_remaining', v_usage.attempts_remaining);
  END IF;
  
  IF v_usage.attempts_remaining <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'No attempts remaining');
  END IF;
  
  UPDATE public.cr_user_usage
  SET attempts_remaining = attempts_remaining - 1,
      total_attempts_used = total_attempts_used + 1,
      last_attempt_at = NOW(),
      updated_at = NOW()
  WHERE user_id = p_user_id
  RETURNING attempts_remaining INTO v_usage.attempts_remaining;
  
  RETURN jsonb_build_object('success', true, 'attempts_remaining', v_usage.attempts_remaining);
END;
$$;

-- Admin function to reset user attempts
CREATE OR REPLACE FUNCTION public.admin_reset_cr_attempts(p_target_user_id UUID, p_new_attempts INTEGER DEFAULT 3)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT has_role(auth.uid(), 'admin'::app_role) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthorized');
  END IF;
  
  UPDATE public.cr_user_usage
  SET attempts_remaining = p_new_attempts,
      updated_at = NOW()
  WHERE user_id = p_target_user_id;
  
  IF NOT FOUND THEN
    INSERT INTO public.cr_user_usage (user_id, attempts_remaining)
    VALUES (p_target_user_id, p_new_attempts);
  END IF;
  
  -- Log admin action
  PERFORM log_admin_action(
    'reset_cr_attempts',
    'cr_user_usage',
    p_target_user_id,
    jsonb_build_object('new_attempts', p_new_attempts)
  );
  
  RETURN jsonb_build_object('success', true, 'new_attempts', p_new_attempts);
END;
$$;

-- Admin function to toggle premium status
CREATE OR REPLACE FUNCTION public.admin_set_cr_premium(p_target_user_id UUID, p_is_premium BOOLEAN)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT has_role(auth.uid(), 'admin'::app_role) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthorized');
  END IF;
  
  UPDATE public.cr_user_usage
  SET is_premium = p_is_premium,
      updated_at = NOW()
  WHERE user_id = p_target_user_id;
  
  IF NOT FOUND THEN
    INSERT INTO public.cr_user_usage (user_id, is_premium)
    VALUES (p_target_user_id, p_is_premium);
  END IF;
  
  RETURN jsonb_build_object('success', true, 'is_premium', p_is_premium);
END;
$$;

-- Trigger to initialize CR usage for new users
CREATE OR REPLACE FUNCTION public.initialize_cr_user_usage()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.cr_user_usage (user_id, attempts_remaining)
  VALUES (NEW.user_id, 3)
  ON CONFLICT (user_id) DO NOTHING;
  
  RETURN NEW;
END;
$$;

-- Create trigger on profiles table
CREATE TRIGGER on_profile_created_init_cr_usage
  AFTER INSERT ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.initialize_cr_user_usage();

-- Update timestamp triggers
CREATE TRIGGER update_cr_questions_updated_at
  BEFORE UPDATE ON public.cr_questions
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at();

CREATE TRIGGER update_cr_user_usage_updated_at
  BEFORE UPDATE ON public.cr_user_usage
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at();

CREATE TRIGGER update_cr_responses_updated_at
  BEFORE UPDATE ON public.cr_responses
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at();

-- =============================================
-- SEED DEFAULT QUESTIONS
-- =============================================
INSERT INTO public.cr_questions (question_text, question_type, options, order_index, icon) VALUES
('What type of content do you enjoy creating the most?', 'choice', '["Educational tutorials", "Entertainment & comedy", "Lifestyle & vlogs", "Reviews & opinions", "Storytelling & documentaries"]'::jsonb, 1, 'Camera'),
('How would you describe your current content creation style?', 'choice', '["Highly polished & professional", "Raw & authentic", "Experimental & creative", "Informative & structured", "Casual & conversational"]'::jsonb, 2, 'Mic'),
('What are your biggest challenges as a creator?', 'multiselect', '["Finding time to create", "Coming up with ideas", "Growing my audience", "Staying consistent", "Technical skills", "Monetization"]'::jsonb, 3, 'Zap'),
('How often do you currently post content?', 'choice', '["Daily", "2-3 times per week", "Weekly", "Bi-weekly", "Monthly or less"]'::jsonb, 4, 'Calendar'),
('What platforms do you primarily create for?', 'multiselect', '["YouTube", "TikTok", "Instagram", "Facebook", "Twitter/X", "LinkedIn", "Podcast", "Blog"]'::jsonb, 5, 'Globe'),
('What is your primary goal as a content creator?', 'choice', '["Build a personal brand", "Generate income", "Share knowledge", "Build a community", "Express creativity", "Promote a business"]'::jsonb, 6, 'Target'),
('How do you prefer to plan your content?', 'choice', '["Detailed content calendar", "Weekly planning sessions", "Spontaneous & in-the-moment", "Batch creation", "I struggle with planning"]'::jsonb, 7, 'Brain'),
('Describe your ideal content creation workflow in a few words:', 'text', '[]'::jsonb, 8, 'Sparkles');