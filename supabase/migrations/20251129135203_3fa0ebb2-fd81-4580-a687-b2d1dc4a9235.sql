-- Add is_global column to ai_generated_content table
ALTER TABLE public.ai_generated_content 
ADD COLUMN IF NOT EXISTS is_global BOOLEAN DEFAULT FALSE;

-- Create index for performance on global content queries
CREATE INDEX IF NOT EXISTS idx_ai_content_global ON public.ai_generated_content(is_global) WHERE is_global = true;

-- Add RLS policy to allow users to view global content
CREATE POLICY "Users can view global content"
ON public.ai_generated_content
FOR SELECT
USING (is_global = true OR auth.uid() = user_id);

-- Allow admins to manage global content
CREATE POLICY "Admins can manage global content"
ON public.ai_generated_content
FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));