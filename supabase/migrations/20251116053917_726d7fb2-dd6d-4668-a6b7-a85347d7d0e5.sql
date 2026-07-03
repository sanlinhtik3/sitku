-- Add usage tracking and quality scoring to ai_generated_content
ALTER TABLE public.ai_generated_content
ADD COLUMN IF NOT EXISTS usage_count integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS quality_score integer DEFAULT 50,
ADD COLUMN IF NOT EXISTS last_used_at timestamp with time zone,
ADD COLUMN IF NOT EXISTS relevance_score numeric DEFAULT 0;

-- Add index for faster queries
CREATE INDEX IF NOT EXISTS idx_ai_content_quality ON public.ai_generated_content(quality_score DESC);
CREATE INDEX IF NOT EXISTS idx_ai_content_usage ON public.ai_generated_content(usage_count DESC);
CREATE INDEX IF NOT EXISTS idx_ai_content_category ON public.ai_generated_content(category);
CREATE INDEX IF NOT EXISTS idx_ai_content_tags ON public.ai_generated_content USING GIN(tags);

-- Create function to increment usage count
CREATE OR REPLACE FUNCTION public.increment_content_usage(content_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  UPDATE public.ai_generated_content
  SET usage_count = usage_count + 1,
      last_used_at = NOW()
  WHERE id = content_id;
END;
$$;