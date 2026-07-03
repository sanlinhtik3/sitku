-- Create creator_permissions table
CREATE TABLE IF NOT EXISTS public.creator_permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  can_create_courses BOOLEAN NOT NULL DEFAULT false,
  max_courses INTEGER DEFAULT 10,
  is_suspended BOOLEAN NOT NULL DEFAULT false,
  suspension_reason TEXT,
  suspended_by UUID REFERENCES auth.users(id),
  suspended_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.creator_permissions ENABLE ROW LEVEL SECURITY;

-- RLS Policies for creator_permissions
CREATE POLICY "Creators can view their own permissions"
  ON public.creator_permissions
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all creator permissions"
  ON public.creator_permissions
  FOR SELECT
  TO authenticated
  USING (has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can manage creator permissions"
  ON public.creator_permissions
  FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'admin'))
  WITH CHECK (has_role(auth.uid(), 'admin'));

-- Trigger to create default permissions when creator role is assigned
CREATE OR REPLACE FUNCTION public.handle_new_creator()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only create permissions for creator role
  IF NEW.role = 'creator' THEN
    INSERT INTO public.creator_permissions (user_id, can_create_courses, max_courses)
    VALUES (NEW.user_id, false, 10)
    ON CONFLICT (user_id) DO NOTHING;
  END IF;
  
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_new_creator_role
  AFTER INSERT ON public.user_roles
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_creator();

-- Add updated_at trigger
CREATE TRIGGER update_creator_permissions_updated_at
  BEFORE UPDATE ON public.creator_permissions
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at();

-- Update courses table to track creator and approval
ALTER TABLE public.courses 
  ADD COLUMN IF NOT EXISTS approval_status TEXT DEFAULT 'pending' CHECK (approval_status IN ('pending', 'approved', 'rejected'));

ALTER TABLE public.courses
  ADD COLUMN IF NOT EXISTS approved_by UUID REFERENCES auth.users(id);

ALTER TABLE public.courses
  ADD COLUMN IF NOT EXISTS approved_at TIMESTAMP WITH TIME ZONE;

ALTER TABLE public.courses
  ADD COLUMN IF NOT EXISTS rejection_reason TEXT;

-- Update lessons table to support premium/free per lesson
ALTER TABLE public.lessons
  ADD COLUMN IF NOT EXISTS is_premium BOOLEAN DEFAULT false;

-- Update RLS policies for courses to respect creator permissions
DROP POLICY IF EXISTS "Admins can manage courses" ON public.courses;

CREATE POLICY "Admins can manage all courses"
  ON public.courses
  FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'admin'))
  WITH CHECK (has_role(auth.uid(), 'admin'));

CREATE POLICY "Creators can view their own courses"
  ON public.courses
  FOR SELECT
  TO authenticated
  USING (
    has_role(auth.uid(), 'creator') AND created_by = auth.uid()
  );

CREATE POLICY "Creators can create courses if permitted"
  ON public.courses
  FOR INSERT
  TO authenticated
  WITH CHECK (
    has_role(auth.uid(), 'creator') 
    AND created_by = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.creator_permissions
      WHERE user_id = auth.uid()
        AND can_create_courses = true
        AND is_suspended = false
    )
  );

CREATE POLICY "Creators can update their own pending courses"
  ON public.courses
  FOR UPDATE
  TO authenticated
  USING (
    has_role(auth.uid(), 'creator')
    AND created_by = auth.uid()
    AND approval_status = 'pending'
  );

CREATE POLICY "Creators can delete their own pending courses"
  ON public.courses
  FOR DELETE
  TO authenticated
  USING (
    has_role(auth.uid(), 'creator')
    AND created_by = auth.uid()
    AND approval_status = 'pending'
  );

-- Public can view approved courses
CREATE POLICY "Anyone can view approved courses"
  ON public.courses
  FOR SELECT
  TO authenticated
  USING (approval_status = 'approved');