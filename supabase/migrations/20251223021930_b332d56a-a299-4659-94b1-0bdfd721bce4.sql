-- Add encrypted API key column to cr_user_usage for personal Gemini API keys
ALTER TABLE public.cr_user_usage 
ADD COLUMN IF NOT EXISTS gemini_api_key text;

-- Add comment for clarity
COMMENT ON COLUMN public.cr_user_usage.gemini_api_key IS 'User personal Gemini API key for blueprint generation';