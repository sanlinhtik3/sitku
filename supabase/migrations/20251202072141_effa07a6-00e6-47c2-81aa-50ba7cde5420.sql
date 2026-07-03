-- Add category column to workspace_tasks for flexible tagging
ALTER TABLE public.workspace_tasks ADD COLUMN IF NOT EXISTS category text DEFAULT 'general';

-- Create function to auto-create default workspace on user signup
CREATE OR REPLACE FUNCTION public.create_default_workspace()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_name TEXT;
  v_workspace_id UUID;
BEGIN
  -- Get user's name from profile
  SELECT full_name INTO v_user_name FROM public.profiles WHERE user_id = NEW.user_id;
  
  -- Create default workspace
  INSERT INTO public.workspaces (name, owner_id, description)
  VALUES (
    COALESCE(v_user_name, 'My') || '''s Creative Studio',
    NEW.user_id,
    'Your personal productivity workspace'
  )
  RETURNING id INTO v_workspace_id;
  
  -- Add user as owner member
  INSERT INTO public.workspace_members (workspace_id, user_id, role, invited_by)
  VALUES (v_workspace_id, NEW.user_id, 'owner', NEW.user_id);
  
  RETURN NEW;
END;
$$;

-- Create trigger on profiles table (fires after profile is created for new user)
DROP TRIGGER IF EXISTS on_profile_created_create_workspace ON public.profiles;
CREATE TRIGGER on_profile_created_create_workspace
  AFTER INSERT ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.create_default_workspace();