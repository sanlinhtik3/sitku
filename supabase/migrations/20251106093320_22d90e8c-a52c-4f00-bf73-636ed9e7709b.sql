-- Add 'creator' to app_role enum if not exists
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_enum e ON t.oid = e.enumtypid WHERE t.typname = 'app_role' AND e.enumlabel = 'creator') THEN
    ALTER TYPE app_role ADD VALUE 'creator';
  END IF;
END $$;

-- Create creator_applications table
CREATE TABLE IF NOT EXISTS public.creator_applications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  bio TEXT,
  portfolio_url TEXT,
  youtube_url TEXT,
  tiktok_url TEXT,
  facebook_url TEXT,
  telegram_url TEXT,
  instagram_url TEXT,
  twitter_url TEXT,
  website_url TEXT,
  other_links TEXT,
  admin_notes TEXT,
  reviewed_by UUID REFERENCES auth.users(id),
  reviewed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE(user_id)
);

-- Enable RLS
ALTER TABLE public.creator_applications ENABLE ROW LEVEL SECURITY;

-- RLS Policies for creator_applications
CREATE POLICY "Users can insert their own application"
  ON public.creator_applications
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can view their own application"
  ON public.creator_applications
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all applications"
  ON public.creator_applications
  FOR SELECT
  TO authenticated
  USING (has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update all applications"
  ON public.creator_applications
  FOR UPDATE
  TO authenticated
  USING (has_role(auth.uid(), 'admin'));

-- Create trigger to assign creator role on approval
CREATE OR REPLACE FUNCTION public.handle_creator_application_approval()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- If application is approved and was previously pending or rejected
  IF NEW.status = 'approved' AND (OLD.status IS NULL OR OLD.status != 'approved') THEN
    -- Insert creator role if not exists
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.user_id, 'creator')
    ON CONFLICT (user_id, role) DO NOTHING;
    
    -- Set reviewed timestamp
    NEW.reviewed_at := NOW();
  END IF;
  
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_creator_application_approval
  BEFORE UPDATE ON public.creator_applications
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_creator_application_approval();

-- Add updated_at trigger
CREATE TRIGGER update_creator_applications_updated_at
  BEFORE UPDATE ON public.creator_applications
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at();