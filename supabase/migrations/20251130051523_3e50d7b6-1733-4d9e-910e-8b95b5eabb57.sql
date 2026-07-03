-- Update all existing user-generated content to be globally indexed
UPDATE public.ai_generated_content 
SET is_global = true 
WHERE is_global = false OR is_global IS NULL;

-- Set default value for is_global to true for all future inserts
ALTER TABLE public.ai_generated_content 
ALTER COLUMN is_global SET DEFAULT true;

-- Add comment explaining the automated indexing
COMMENT ON COLUMN public.ai_generated_content.is_global IS 'Automatically set to true on save - all user content is indexed globally for AI training';