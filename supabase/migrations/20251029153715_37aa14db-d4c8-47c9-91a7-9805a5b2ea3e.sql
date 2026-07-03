-- Create coupons table
CREATE TABLE public.coupons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT UNIQUE NOT NULL,
  discount_percentage INTEGER NOT NULL CHECK (discount_percentage > 0 AND discount_percentage <= 100),
  max_uses INTEGER NOT NULL CHECK (max_uses > 0),
  current_uses INTEGER DEFAULT 0 CHECK (current_uses >= 0),
  valid_from TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  valid_until TIMESTAMP WITH TIME ZONE NOT NULL,
  is_active BOOLEAN DEFAULT true,
  created_by UUID,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Validation trigger for coupon dates
CREATE OR REPLACE FUNCTION validate_coupon_dates()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.valid_until <= NEW.valid_from THEN
    RAISE EXCEPTION 'valid_until must be after valid_from';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER check_coupon_dates
  BEFORE INSERT OR UPDATE ON public.coupons
  FOR EACH ROW
  EXECUTE FUNCTION validate_coupon_dates();

-- RLS Policies for coupons
ALTER TABLE public.coupons ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage coupons"
  ON public.coupons FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Users can view active coupons"
  ON public.coupons FOR SELECT
  USING (is_active = true AND valid_until > NOW());

-- Add new columns to enrollments table
ALTER TABLE public.enrollments
  ADD COLUMN IF NOT EXISTS coupon_id UUID REFERENCES public.coupons(id),
  ADD COLUMN IF NOT EXISTS discount_applied INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS final_price NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS access_duration_days INTEGER DEFAULT 30,
  ADD COLUMN IF NOT EXISTS access_expires_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS is_expired BOOLEAN DEFAULT false;

-- Function to calculate enrollment expiration on approval
CREATE OR REPLACE FUNCTION calculate_enrollment_expiration()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'approved' AND (OLD.status IS NULL OR OLD.status != 'approved') THEN
    NEW.access_expires_at := NOW() + (NEW.access_duration_days || ' days')::INTERVAL;
    NEW.is_expired := false;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_enrollment_expiration
  BEFORE INSERT OR UPDATE ON public.enrollments
  FOR EACH ROW
  EXECUTE FUNCTION calculate_enrollment_expiration();

-- Function to check and expire enrollments
CREATE OR REPLACE FUNCTION expire_old_enrollments()
RETURNS void AS $$
BEGIN
  UPDATE public.enrollments
  SET is_expired = true
  WHERE access_expires_at < NOW() 
    AND is_expired = false
    AND status = 'approved';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create coupon usage tracking table
CREATE TABLE public.coupon_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  coupon_id UUID REFERENCES public.coupons(id) ON DELETE CASCADE,
  user_id UUID,
  enrollment_id UUID REFERENCES public.enrollments(id) ON DELETE CASCADE,
  used_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(coupon_id, user_id, enrollment_id)
);

ALTER TABLE public.coupon_usage ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view all coupon usage"
  ON public.coupon_usage FOR SELECT
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Users can view own coupon usage"
  ON public.coupon_usage FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Authenticated users can insert coupon usage"
  ON public.coupon_usage FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Update enrollments RLS policy to prevent access to expired enrollments
DROP POLICY IF EXISTS "Users can view own enrollments" ON public.enrollments;

CREATE POLICY "Users can view own active enrollments"
  ON public.enrollments FOR SELECT
  USING (auth.uid() = user_id AND (is_expired = false OR status != 'approved'));