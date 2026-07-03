-- Create table for AI generated content
CREATE TABLE public.ai_generated_content (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  title text NOT NULL,
  content text NOT NULL,
  topic text,
  tone text,
  style text,
  language text DEFAULT 'burmese',
  is_template boolean DEFAULT false,
  tags text[],
  metadata jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.ai_generated_content ENABLE ROW LEVEL SECURITY;

-- Policy: Only admins can manage AI content
CREATE POLICY "Admins can manage AI content"
ON public.ai_generated_content
FOR ALL
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Add trigger for updated_at
CREATE TRIGGER update_ai_content_updated_at
  BEFORE UPDATE ON public.ai_generated_content
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at();