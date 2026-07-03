-- Add access_duration_days and applicable_course_ids columns to coupons table
ALTER TABLE public.coupons
  ADD COLUMN access_duration_days INTEGER DEFAULT 30 CHECK (access_duration_days > 0),
  ADD COLUMN applicable_course_ids UUID[] DEFAULT NULL;

-- Add comment for clarity
COMMENT ON COLUMN public.coupons.access_duration_days IS 'Number of days users get course access when using this coupon';
COMMENT ON COLUMN public.coupons.applicable_course_ids IS 'Array of course IDs this coupon applies to. NULL means all courses';