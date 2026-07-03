-- Fix search_path for new functions using CREATE OR REPLACE
CREATE OR REPLACE FUNCTION validate_coupon_dates()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.valid_until <= NEW.valid_from THEN
    RAISE EXCEPTION 'valid_until must be after valid_from';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public;

CREATE OR REPLACE FUNCTION calculate_enrollment_expiration()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'approved' AND (OLD.status IS NULL OR OLD.status != 'approved') THEN
    NEW.access_expires_at := NOW() + (NEW.access_duration_days || ' days')::INTERVAL;
    NEW.is_expired := false;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public;

CREATE OR REPLACE FUNCTION expire_old_enrollments()
RETURNS void AS $$
BEGIN
  UPDATE public.enrollments
  SET is_expired = true
  WHERE access_expires_at < NOW() 
    AND is_expired = false
    AND status = 'approved';
END;
$$ LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public;