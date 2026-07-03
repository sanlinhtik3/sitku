-- Add status and responded_at columns to workspace_members
ALTER TABLE public.workspace_members 
ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'accepted',
ADD COLUMN IF NOT EXISTS responded_at timestamp with time zone;

-- Add CHECK constraint for valid status values
ALTER TABLE public.workspace_members 
DROP CONSTRAINT IF EXISTS workspace_members_status_check;

ALTER TABLE public.workspace_members 
ADD CONSTRAINT workspace_members_status_check 
CHECK (status IN ('pending', 'accepted', 'declined'));

-- Add CHECK constraint for valid role values (owner, admin, member)
ALTER TABLE public.workspace_members 
DROP CONSTRAINT IF EXISTS workspace_members_role_check;

ALTER TABLE public.workspace_members 
ADD CONSTRAINT workspace_members_role_check 
CHECK (role IN ('owner', 'admin', 'member'));

-- Create index for performance on status queries
CREATE INDEX IF NOT EXISTS idx_workspace_members_status 
ON public.workspace_members(workspace_id, status);

CREATE INDEX IF NOT EXISTS idx_workspace_members_user_status 
ON public.workspace_members(user_id, status);

-- Create permission check function
CREATE OR REPLACE FUNCTION public.get_workspace_permission(p_workspace_id uuid, p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_role text;
  v_status text;
  v_is_creator boolean;
BEGIN
  -- Get member's role and status
  SELECT role, status INTO v_role, v_status
  FROM public.workspace_members
  WHERE workspace_id = p_workspace_id AND user_id = p_user_id;
  
  -- Check if user is workspace creator
  SELECT creator_id = p_user_id INTO v_is_creator
  FROM public.workspaces
  WHERE id = p_workspace_id;
  
  -- If not a member or not accepted, return no permissions
  IF v_role IS NULL OR v_status != 'accepted' THEN
    RETURN jsonb_build_object(
      'isMember', false,
      'role', null,
      'canViewWorkspace', false,
      'canManageTasks', false,
      'canInviteMembers', false,
      'canRemoveMembers', false,
      'canChangeRoles', false,
      'canEditSettings', false,
      'canDeleteWorkspace', false,
      'canLeave', false
    );
  END IF;
  
  RETURN jsonb_build_object(
    'isMember', true,
    'role', v_role,
    'canViewWorkspace', true,
    'canManageTasks', v_role IN ('owner', 'admin'),
    'canInviteMembers', v_role IN ('owner', 'admin'),
    'canRemoveMembers', v_role IN ('owner', 'admin'),
    'canChangeRoles', v_role = 'owner',
    'canEditSettings', v_role IN ('owner', 'admin'),
    'canDeleteWorkspace', v_role = 'owner' AND v_is_creator,
    'canLeave', v_role != 'owner'
  );
END;
$$;

-- Create function to handle invitation response
CREATE OR REPLACE FUNCTION public.respond_to_workspace_invitation(
  p_workspace_id uuid,
  p_accept boolean
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_member RECORD;
  v_workspace RECORD;
BEGIN
  -- Get the pending invitation
  SELECT * INTO v_member
  FROM public.workspace_members
  WHERE workspace_id = p_workspace_id 
    AND user_id = auth.uid()
    AND status = 'pending';
  
  IF v_member IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'No pending invitation found');
  END IF;
  
  -- Get workspace info
  SELECT * INTO v_workspace
  FROM public.workspaces
  WHERE id = p_workspace_id;
  
  IF p_accept THEN
    -- Accept invitation
    UPDATE public.workspace_members
    SET status = 'accepted', responded_at = NOW()
    WHERE id = v_member.id;
    
    -- Notify the inviter
    INSERT INTO public.notifications (user_id, type, title, message, related_id)
    VALUES (
      v_member.invited_by,
      'workspace_invitation_accepted',
      'Invitation Accepted',
      'Your invitation to "' || v_workspace.name || '" was accepted',
      p_workspace_id
    );
    
    RETURN jsonb_build_object('success', true, 'action', 'accepted');
  ELSE
    -- Decline invitation - remove the member record
    DELETE FROM public.workspace_members WHERE id = v_member.id;
    
    -- Notify the inviter
    INSERT INTO public.notifications (user_id, type, title, message, related_id)
    VALUES (
      v_member.invited_by,
      'workspace_invitation_declined',
      'Invitation Declined',
      'Your invitation to "' || v_workspace.name || '" was declined',
      p_workspace_id
    );
    
    RETURN jsonb_build_object('success', true, 'action', 'declined');
  END IF;
END;
$$;

-- Create function for leaving workspace
CREATE OR REPLACE FUNCTION public.leave_workspace(p_workspace_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_member RECORD;
  v_workspace RECORD;
BEGIN
  -- Get member info
  SELECT * INTO v_member
  FROM public.workspace_members
  WHERE workspace_id = p_workspace_id AND user_id = auth.uid();
  
  IF v_member IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not a member');
  END IF;
  
  IF v_member.role = 'owner' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Owner cannot leave workspace');
  END IF;
  
  -- Get workspace info
  SELECT * INTO v_workspace FROM public.workspaces WHERE id = p_workspace_id;
  
  -- Remove member
  DELETE FROM public.workspace_members WHERE id = v_member.id;
  
  -- Notify workspace owner
  INSERT INTO public.notifications (user_id, type, title, message, related_id)
  SELECT wm.user_id, 'member_left', 'Member Left Workspace',
    (SELECT full_name FROM profiles WHERE user_id = auth.uid()) || ' left "' || v_workspace.name || '"',
    p_workspace_id
  FROM public.workspace_members wm
  WHERE wm.workspace_id = p_workspace_id AND wm.role = 'owner';
  
  RETURN jsonb_build_object('success', true);
END;
$$;

-- Create function for changing member role
CREATE OR REPLACE FUNCTION public.change_member_role(
  p_workspace_id uuid,
  p_target_user_id uuid,
  p_new_role text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_caller_role text;
  v_target_member RECORD;
  v_workspace RECORD;
BEGIN
  -- Validate new role
  IF p_new_role NOT IN ('admin', 'member') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid role');
  END IF;
  
  -- Get caller's role
  SELECT role INTO v_caller_role
  FROM public.workspace_members
  WHERE workspace_id = p_workspace_id AND user_id = auth.uid() AND status = 'accepted';
  
  -- Only owner can change roles
  IF v_caller_role != 'owner' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Only owner can change roles');
  END IF;
  
  -- Get target member
  SELECT * INTO v_target_member
  FROM public.workspace_members
  WHERE workspace_id = p_workspace_id AND user_id = p_target_user_id;
  
  IF v_target_member IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Member not found');
  END IF;
  
  -- Cannot change owner's role
  IF v_target_member.role = 'owner' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Cannot change owner role');
  END IF;
  
  -- Update role
  UPDATE public.workspace_members
  SET role = p_new_role
  WHERE id = v_target_member.id;
  
  -- Get workspace info
  SELECT * INTO v_workspace FROM public.workspaces WHERE id = p_workspace_id;
  
  -- Notify the member
  INSERT INTO public.notifications (user_id, type, title, message, related_id)
  VALUES (
    p_target_user_id,
    'role_changed',
    'Role Changed',
    'Your role in "' || v_workspace.name || '" has been changed to ' || p_new_role,
    p_workspace_id
  );
  
  RETURN jsonb_build_object('success', true, 'new_role', p_new_role);
END;
$$;

-- Create function for removing member
CREATE OR REPLACE FUNCTION public.remove_workspace_member(
  p_workspace_id uuid,
  p_target_user_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_caller_role text;
  v_target_member RECORD;
  v_workspace RECORD;
BEGIN
  -- Get caller's role
  SELECT role INTO v_caller_role
  FROM public.workspace_members
  WHERE workspace_id = p_workspace_id AND user_id = auth.uid() AND status = 'accepted';
  
  -- Only owner and admin can remove members
  IF v_caller_role NOT IN ('owner', 'admin') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Insufficient permissions');
  END IF;
  
  -- Get target member
  SELECT * INTO v_target_member
  FROM public.workspace_members
  WHERE workspace_id = p_workspace_id AND user_id = p_target_user_id;
  
  IF v_target_member IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Member not found');
  END IF;
  
  -- Cannot remove owner
  IF v_target_member.role = 'owner' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Cannot remove owner');
  END IF;
  
  -- Admin cannot remove other admins
  IF v_caller_role = 'admin' AND v_target_member.role = 'admin' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Admin cannot remove other admins');
  END IF;
  
  -- Get workspace info
  SELECT * INTO v_workspace FROM public.workspaces WHERE id = p_workspace_id;
  
  -- Remove member
  DELETE FROM public.workspace_members WHERE id = v_target_member.id;
  
  -- Notify the removed member
  INSERT INTO public.notifications (user_id, type, title, message, related_id)
  VALUES (
    p_target_user_id,
    'removed_from_workspace',
    'Removed from Workspace',
    'You have been removed from "' || v_workspace.name || '"',
    p_workspace_id
  );
  
  RETURN jsonb_build_object('success', true);
END;
$$;

-- Update RLS policies for workspace_members to filter by accepted status
DROP POLICY IF EXISTS "Members can view accepted workspace members" ON public.workspace_members;

CREATE POLICY "Members can view accepted workspace members"
ON public.workspace_members
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.workspace_members wm
    WHERE wm.workspace_id = workspace_members.workspace_id
    AND wm.user_id = auth.uid()
    AND wm.status = 'accepted'
  )
  OR user_id = auth.uid()  -- Can always see own membership (including pending)
  OR has_role(auth.uid(), 'admin'::app_role)
);