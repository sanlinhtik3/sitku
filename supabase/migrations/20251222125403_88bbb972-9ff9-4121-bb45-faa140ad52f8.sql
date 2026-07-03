-- Add unique constraint on cr_premium_responses for response_id + component_key
-- This allows upsert operations when regenerating blueprint content

ALTER TABLE public.cr_premium_responses 
ADD CONSTRAINT cr_premium_responses_response_component_unique 
UNIQUE (response_id, component_key);