-- Add workspace limit columns to credit_plans table
ALTER TABLE public.credit_plans 
ADD COLUMN IF NOT EXISTS max_workspaces integer DEFAULT 1,
ADD COLUMN IF NOT EXISTS max_members_per_workspace integer DEFAULT 0;

-- Create function to get user's current plan limits
CREATE OR REPLACE FUNCTION public.get_user_plan_limits(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_limits jsonb;
  v_plan RECORD;
BEGIN
  -- Get the user's most recent approved credit order's plan
  SELECT cp.* INTO v_plan
  FROM public.credit_orders co
  JOIN public.credit_plans cp ON co.plan_id = cp.id
  WHERE co.user_id = p_user_id
    AND co.status = 'completed'
  ORDER BY co.approved_at DESC
  LIMIT 1;
  
  -- If no plan found, return free tier limits
  IF v_plan IS NULL THEN
    RETURN jsonb_build_object(
      'max_workspaces', 1,
      'max_members_per_workspace', 0,
      'plan_name', 'Free'
    );
  END IF;
  
  RETURN jsonb_build_object(
    'max_workspaces', COALESCE(v_plan.max_workspaces, 1),
    'max_members_per_workspace', COALESCE(v_plan.max_members_per_workspace, 0),
    'plan_name', v_plan.name
  );
END;
$$;

-- Create function to check if user can create workspace
CREATE OR REPLACE FUNCTION public.can_create_workspace(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_limits jsonb;
  v_current_count integer;
  v_max_workspaces integer;
BEGIN
  v_limits := get_user_plan_limits(p_user_id);
  v_max_workspaces := (v_limits->>'max_workspaces')::integer;
  
  -- Count user's current workspaces (as owner)
  SELECT COUNT(*) INTO v_current_count
  FROM public.workspaces
  WHERE owner_id = p_user_id;
  
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

-- Create function to check if workspace can add member
CREATE OR REPLACE FUNCTION public.can_add_workspace_member(p_workspace_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_owner_id uuid;
  v_limits jsonb;
  v_current_count integer;
  v_max_members integer;
BEGIN
  -- Get workspace owner
  SELECT owner_id INTO v_owner_id
  FROM public.workspaces
  WHERE id = p_workspace_id;
  
  IF v_owner_id IS NULL THEN
    RETURN jsonb_build_object('allowed', false, 'error', 'Workspace not found');
  END IF;
  
  v_limits := get_user_plan_limits(v_owner_id);
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

-- Update existing credit plans with workspace limits
-- First, let's update any existing plans (if they exist)
UPDATE public.credit_plans SET max_workspaces = 1, max_members_per_workspace = 0 WHERE name ILIKE '%free%' OR name ILIKE '%starter%' OR name ILIKE '%basic%';
UPDATE public.credit_plans SET max_workspaces = 3, max_members_per_workspace = 5 WHERE name ILIKE '%pro%';
UPDATE public.credit_plans SET max_workspaces = 3, max_members_per_workspace = 10 WHERE name ILIKE '%creator%';
UPDATE public.credit_plans SET max_workspaces = -1, max_members_per_workspace = -1 WHERE name ILIKE '%business%' OR name ILIKE '%enterprise%' OR name ILIKE '%unlimited%';