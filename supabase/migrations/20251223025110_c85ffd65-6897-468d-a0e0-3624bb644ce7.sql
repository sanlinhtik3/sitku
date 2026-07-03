-- Add gemini_model and allow_gateway_fallback columns to cr_user_usage
ALTER TABLE cr_user_usage 
ADD COLUMN IF NOT EXISTS gemini_model text DEFAULT 'gemini-2.0-flash';

ALTER TABLE cr_user_usage 
ADD COLUMN IF NOT EXISTS allow_gateway_fallback boolean DEFAULT true;

COMMENT ON COLUMN cr_user_usage.gemini_model IS 'User preferred Gemini model for blueprint generation';
COMMENT ON COLUMN cr_user_usage.allow_gateway_fallback IS 'Admin control: Allow user to use Lovable Gateway AI when personal API fails/unavailable';