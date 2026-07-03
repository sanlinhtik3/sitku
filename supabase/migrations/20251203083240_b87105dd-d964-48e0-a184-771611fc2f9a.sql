-- Update the can_create_workspace function to use creator_id
CREATE OR REPLACE FUNCTION public.can_create_workspace(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_limits jsonb;
  v_current_count integer;
  v_max_workspaces integer;
BEGIN
  v_limits := get_user_plan_limits(p_user_id);
  v_max_workspaces := (v_limits->>'max_workspaces')::integer;
  
  -- Count user's current workspaces (as creator)
  SELECT COUNT(*) INTO v_current_count
  FROM public.workspaces
  WHERE creator_id = p_user_id;
  
  -- -1 means unlimited
  IF v_max_workspaces = -1 THEN
    RETURN jsonb_build_object(
      'allowed', true,
      'current_count', v_current_count,
      'max_count', -1,
      'plan_name', v_limits->>'plan_name'
    );
  END IF;
  
  RETURN jsonb_build_object(
    'allowed', v_current_count < v_max_workspaces,
    'current_count', v_current_count,
    'max_count', v_max_workspaces,
    'plan_name', v_limits->>'plan_name'
  );
END;
$$;

-- Update the can_add_workspace_member function to use creator_id
CREATE OR REPLACE FUNCTION public.can_add_workspace_member(p_workspace_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_creator_id uuid;
  v_limits jsonb;
  v_current_count integer;
  v_max_members integer;
BEGIN
  -- Get workspace creator
  SELECT creator_id INTO v_creator_id
  FROM public.workspaces
  WHERE id = p_workspace_id;
  
  IF v_creator_id IS NULL THEN
    RETURN jsonb_build_object('allowed', false, 'error', 'Workspace not found');
  END IF;
  
  v_limits := get_user_plan_limits(v_creator_id);
  v_max_members := (v_limits->>'max_members_per_workspace')::integer;
  
  -- Count current members (excluding owner)
  SELECT COUNT(*) INTO v_current_count
  FROM public.workspace_members
  WHERE workspace_id = p_workspace_id
    AND role != 'owner';
  
  -- -1 means unlimited
  IF v_max_members = -1 THEN
    RETURN jsonb_build_object(
      'allowed', true,
      'current_count', v_current_count,
      'max_count', -1,
      'plan_name', v_limits->>'plan_name'
    );
  END IF;
  
  RETURN jsonb_build_object(
    'allowed', v_current_count < v_max_members,
    'current_count', v_current_count,
    'max_count', v_max_members,
    'plan_name', v_limits->>'plan_name'
  );
END;
$$;

-- Update the create_default_workspace function to use creator_id
CREATE OR REPLACE FUNCTION public.create_default_workspace()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_user_name TEXT;
  v_workspace_id UUID;
BEGIN
  -- Get user's name from profile
  SELECT full_name INTO v_user_name FROM public.profiles WHERE user_id = NEW.user_id;
  
  -- Create default workspace
  INSERT INTO public.workspaces (name, creator_id, description)
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