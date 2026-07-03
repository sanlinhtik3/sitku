-- Create campaigns table for Binance KOL promotions
CREATE TABLE public.campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text,
  thumbnail_url text,
  campaign_url text NOT NULL,
  is_active boolean DEFAULT true,
  expires_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  created_by uuid REFERENCES auth.users(id),
  display_order integer DEFAULT 0
);

-- Enable RLS
ALTER TABLE public.campaigns ENABLE ROW LEVEL SECURITY;

-- Public can view active campaigns (not expired)
CREATE POLICY "Anyone can view active campaigns" 
ON public.campaigns FOR SELECT 
USING (is_active = true AND (expires_at IS NULL OR expires_at > now()));

-- Admins can manage all campaigns (using user_roles table)
CREATE POLICY "Admins can manage campaigns" 
ON public.campaigns FOR ALL 
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles 
    WHERE user_roles.user_id = auth.uid() 
    AND user_roles.role = 'admin'
  )
);

-- Create updated_at trigger
CREATE TRIGGER update_campaigns_updated_at
BEFORE UPDATE ON public.campaigns
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();