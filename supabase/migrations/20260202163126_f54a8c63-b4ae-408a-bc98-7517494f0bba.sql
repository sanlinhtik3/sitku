-- Drop the old version of check_and_increment_usage with 3 parameters
DROP FUNCTION IF EXISTS public.check_and_increment_usage(uuid, text, text);