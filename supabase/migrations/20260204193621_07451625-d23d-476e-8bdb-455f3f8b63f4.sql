-- Drop the 2-parameter version to avoid function overloading confusion
-- Keep only the 3-parameter version which handles all cases with defaults
DROP FUNCTION IF EXISTS public.check_and_increment_usage(uuid, text);