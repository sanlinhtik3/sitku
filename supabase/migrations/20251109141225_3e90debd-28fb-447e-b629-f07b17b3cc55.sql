-- Create theme_settings table for global theme management
CREATE TABLE IF NOT EXISTS public.theme_settings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  theme_name TEXT NOT NULL DEFAULT 'binance',
  primary_color TEXT NOT NULL DEFAULT '48 97% 60%',
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_by UUID REFERENCES auth.users(id)
);

-- Enable RLS
ALTER TABLE public.theme_settings ENABLE ROW LEVEL SECURITY;

-- Anyone can view theme settings (public read)
CREATE POLICY "Anyone can view theme settings"
ON public.theme_settings
FOR SELECT
USING (true);

-- Only admins can update theme settings
CREATE POLICY "Admins can update theme settings"
ON public.theme_settings
FOR UPDATE
USING (has_role(auth.uid(), 'admin'::app_role));

-- Only admins can insert theme settings
CREATE POLICY "Admins can insert theme settings"
ON public.theme_settings
FOR INSERT
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Insert default theme
INSERT INTO public.theme_settings (theme_name, primary_color)
VALUES ('binance', '48 97% 60%');