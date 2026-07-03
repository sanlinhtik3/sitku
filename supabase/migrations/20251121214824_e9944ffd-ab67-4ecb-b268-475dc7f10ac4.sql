-- Create referral settings table
CREATE TABLE IF NOT EXISTS public.referral_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  is_enabled BOOLEAN NOT NULL DEFAULT true,
  referrer_credits INTEGER NOT NULL DEFAULT 5,
  referee_credits INTEGER NOT NULL DEFAULT 5,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_by UUID REFERENCES public.profiles(user_id)
);

-- Insert default settings
INSERT INTO public.referral_settings (is_enabled, referrer_credits, referee_credits)
VALUES (true, 5, 5);

-- Create referral codes table
CREATE TABLE IF NOT EXISTS public.referral_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(user_id) ON DELETE CASCADE,
  code TEXT NOT NULL UNIQUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  total_referrals INTEGER DEFAULT 0,
  total_credits_earned INTEGER DEFAULT 0
);

-- Create referrals table to track who referred whom
CREATE TABLE IF NOT EXISTS public.referrals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_user_id UUID NOT NULL REFERENCES public.profiles(user_id) ON DELETE CASCADE,
  referred_user_id UUID NOT NULL REFERENCES public.profiles(user_id) ON DELETE CASCADE,
  referral_code TEXT NOT NULL,
  credits_awarded INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  status TEXT NOT NULL DEFAULT 'completed',
  UNIQUE(referred_user_id)
);

-- Enable RLS
ALTER TABLE public.referral_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.referral_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.referrals ENABLE ROW LEVEL SECURITY;

-- RLS Policies for referral_settings
CREATE POLICY "Anyone can view referral settings"
  ON public.referral_settings FOR SELECT
  USING (true);

CREATE POLICY "Admins can manage referral settings"
  ON public.referral_settings FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role));

-- RLS Policies for referral_codes
CREATE POLICY "Users can view own referral code"
  ON public.referral_codes FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all referral codes"
  ON public.referral_codes FOR SELECT
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "System can insert referral codes"
  ON public.referral_codes FOR INSERT
  WITH CHECK (true);

CREATE POLICY "System can update referral codes"
  ON public.referral_codes FOR UPDATE
  USING (true);

-- RLS Policies for referrals
CREATE POLICY "Users can view own referrals"
  ON public.referrals FOR SELECT
  USING (auth.uid() = referrer_user_id OR auth.uid() = referred_user_id);

CREATE POLICY "Admins can view all referrals"
  ON public.referrals FOR SELECT
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "System can insert referrals"
  ON public.referrals FOR INSERT
  WITH CHECK (true);

-- Function to generate unique referral code
CREATE OR REPLACE FUNCTION public.generate_referral_code(p_user_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_code TEXT;
  v_exists BOOLEAN;
BEGIN
  LOOP
    -- Generate 8 character code
    v_code := upper(substring(md5(random()::text || p_user_id::text) from 1 for 8));
    
    -- Check if code exists
    SELECT EXISTS(SELECT 1 FROM public.referral_codes WHERE code = v_code) INTO v_exists;
    
    EXIT WHEN NOT v_exists;
  END LOOP;
  
  RETURN v_code;
END;
$$;

-- Function to create referral code for new user
CREATE OR REPLACE FUNCTION public.create_user_referral_code()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_code TEXT;
BEGIN
  -- Generate unique code
  v_code := public.generate_referral_code(NEW.user_id);
  
  -- Insert referral code
  INSERT INTO public.referral_codes (user_id, code)
  VALUES (NEW.user_id, v_code);
  
  RETURN NEW;
END;
$$;

-- Trigger to create referral code when profile is created
CREATE TRIGGER on_profile_created_create_referral_code
  AFTER INSERT ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.create_user_referral_code();

-- Function to process referral on signup
CREATE OR REPLACE FUNCTION public.process_referral_signup(
  p_referred_user_id UUID,
  p_referral_code TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_referrer_user_id UUID;
  v_settings RECORD;
  v_referrer_balance INTEGER;
  v_referee_balance INTEGER;
BEGIN
  -- Check if referral system is enabled
  SELECT * INTO v_settings FROM public.referral_settings LIMIT 1;
  
  IF NOT v_settings.is_enabled THEN
    RETURN jsonb_build_object('success', false, 'error', 'referral_disabled');
  END IF;
  
  -- Get referrer user_id from code
  SELECT user_id INTO v_referrer_user_id
  FROM public.referral_codes
  WHERE code = p_referral_code;
  
  IF v_referrer_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_code');
  END IF;
  
  -- Check if user already used a referral
  IF EXISTS(SELECT 1 FROM public.referrals WHERE referred_user_id = p_referred_user_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'already_referred');
  END IF;
  
  -- Award credits to referrer
  UPDATE public.user_credits
  SET balance = balance + v_settings.referrer_credits,
      total_earned = total_earned + v_settings.referrer_credits,
      updated_at = NOW()
  WHERE user_id = v_referrer_user_id
  RETURNING balance INTO v_referrer_balance;
  
  -- Award credits to referee
  UPDATE public.user_credits
  SET balance = balance + v_settings.referee_credits,
      total_earned = total_earned + v_settings.referee_credits,
      updated_at = NOW()
  WHERE user_id = p_referred_user_id
  RETURNING balance INTO v_referee_balance;
  
  -- Create transaction records
  INSERT INTO public.credit_transactions (user_id, credits, transaction_type, reference_type, balance_after, description)
  VALUES (v_referrer_user_id, v_settings.referrer_credits, 'referral', 'referral_reward', v_referrer_balance, 'Referral reward - friend signed up');
  
  INSERT INTO public.credit_transactions (user_id, credits, transaction_type, reference_type, balance_after, description)
  VALUES (p_referred_user_id, v_settings.referee_credits, 'referral', 'referral_signup', v_referee_balance, 'Referral bonus - signed up with referral code');
  
  -- Update referral code stats
  UPDATE public.referral_codes
  SET total_referrals = total_referrals + 1,
      total_credits_earned = total_credits_earned + v_settings.referrer_credits
  WHERE user_id = v_referrer_user_id;
  
  -- Record referral
  INSERT INTO public.referrals (referrer_user_id, referred_user_id, referral_code, credits_awarded)
  VALUES (v_referrer_user_id, p_referred_user_id, p_referral_code, v_settings.referrer_credits + v_settings.referee_credits);
  
  RETURN jsonb_build_object(
    'success', true,
    'referrer_credits', v_settings.referrer_credits,
    'referee_credits', v_settings.referee_credits
  );
END;
$$;