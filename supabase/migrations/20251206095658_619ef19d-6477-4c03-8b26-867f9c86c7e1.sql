
-- Add archive columns to workspaces
ALTER TABLE public.workspaces
ADD COLUMN archived_at TIMESTAMP WITH TIME ZONE DEFAULT NULL,
ADD COLUMN archived_by UUID DEFAULT NULL;

-- Create workspace activity logs table
CREATE TABLE public.workspace_activity_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  action TEXT NOT NULL,
  target_user_id UUID DEFAULT NULL,
  details JSONB DEFAULT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create index for efficient queries
CREATE INDEX idx_workspace_activity_workspace ON public.workspace_activity_logs(workspace_id, created_at DESC);
CREATE INDEX idx_workspaces_archived ON public.workspaces(archived_at) WHERE archived_at IS NOT NULL;

-- Enable RLS
ALTER TABLE public.workspace_activity_logs ENABLE ROW LEVEL SECURITY;

-- RLS policies for activity logs
CREATE POLICY "Workspace admins can view activity logs"
ON public.workspace_activity_logs FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.workspace_members
    WHERE workspace_members.workspace_id = workspace_activity_logs.workspace_id
    AND workspace_members.user_id = auth.uid()
    AND workspace_members.role IN ('owner', 'admin')
    AND workspace_members.status = 'accepted'
  )
  OR has_role(auth.uid(), 'admin'::app_role)
);

CREATE POLICY "System can insert activity logs"
ON public.workspace_activity_logs FOR INSERT
WITH CHECK (true);

-- Create workspace ownership transfers table
CREATE TABLE public.workspace_transfers (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  from_user_id UUID NOT NULL,
  to_user_id UUID NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined', 'cancelled')),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  responded_at TIMESTAMP WITH TIME ZONE DEFAULT NULL,
  UNIQUE(workspace_id, status) -- Only one pending transfer per workspace
);

CREATE INDEX idx_workspace_transfers_pending ON public.workspace_transfers(to_user_id, status) WHERE status = 'pending';

-- Enable RLS
ALTER TABLE public.workspace_transfers ENABLE ROW LEVEL SECURITY;

-- RLS policies for transfers
CREATE POLICY "Users can view transfers involving them"
ON public.workspace_transfers FOR SELECT
USING (
  from_user_id = auth.uid() OR to_user_id = auth.uid()
  OR has_role(auth.uid(), 'admin'::app_role)
);

CREATE POLICY "Owners can create transfers"
ON public.workspace_transfers FOR INSERT
WITH CHECK (from_user_id = auth.uid());

CREATE POLICY "Users can update their transfers"
ON public.workspace_transfers FOR UPDATE
USING (from_user_id = auth.uid() OR to_user_id = auth.uid());

-- Function to archive workspace
CREATE OR REPLACE FUNCTION public.archive_workspace(p_workspace_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_workspace RECORD;
BEGIN
  -- Get workspace and verify ownership
  SELECT * INTO v_workspace FROM public.workspaces WHERE id = p_workspace_id;
  
  IF v_workspace IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Workspace not found');
  END IF;
  
  IF v_workspace.creator_id != auth.uid() THEN
    RETURN jsonb_build_object('success', false, 'error', 'Only owner can archive');
  END IF;
  
  IF v_workspace.archived_at IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Already archived');
  END IF;
  
  -- Archive the workspace
  UPDATE public.workspaces
  SET archived_at = NOW(), archived_by = auth.uid(), is_active = false
  WHERE id = p_workspace_id;
  
  -- Log activity
  INSERT INTO public.workspace_activity_logs (workspace_id, user_id, action, details)
  VALUES (p_workspace_id, auth.uid(), 'workspace_archived', jsonb_build_object('workspace_name', v_workspace.name));
  
  RETURN jsonb_build_object('success', true);
END;
$$;

-- Function to restore workspace
CREATE OR REPLACE FUNCTION public.restore_workspace(p_workspace_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_workspace RECORD;
BEGIN
  SELECT * INTO v_workspace FROM public.workspaces WHERE id = p_workspace_id;
  
  IF v_workspace IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Workspace not found');
  END IF;
  
  IF v_workspace.creator_id != auth.uid() THEN
    RETURN jsonb_build_object('success', false, 'error', 'Only owner can restore');
  END IF;
  
  IF v_workspace.archived_at IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not archived');
  END IF;
  
  -- Restore the workspace
  UPDATE public.workspaces
  SET archived_at = NULL, archived_by = NULL, is_active = true
  WHERE id = p_workspace_id;
  
  -- Log activity
  INSERT INTO public.workspace_activity_logs (workspace_id, user_id, action, details)
  VALUES (p_workspace_id, auth.uid(), 'workspace_restored', jsonb_build_object('workspace_name', v_workspace.name));
  
  RETURN jsonb_build_object('success', true);
END;
$$;

-- Function to initiate ownership transfer
CREATE OR REPLACE FUNCTION public.initiate_ownership_transfer(p_workspace_id UUID, p_to_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_workspace RECORD;
  v_target_member RECORD;
  v_transfer_id UUID;
BEGIN
  -- Verify ownership
  SELECT * INTO v_workspace FROM public.workspaces WHERE id = p_workspace_id;
  
  IF v_workspace IS NULL OR v_workspace.creator_id != auth.uid() THEN
    RETURN jsonb_build_object('success', false, 'error', 'Only owner can transfer');
  END IF;
  
  -- Verify target is an admin member
  SELECT * INTO v_target_member
  FROM public.workspace_members
  WHERE workspace_id = p_workspace_id AND user_id = p_to_user_id AND status = 'accepted';
  
  IF v_target_member IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Target must be a member');
  END IF;
  
  IF v_target_member.role != 'admin' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Target must be an admin');
  END IF;
  
  -- Check for existing pending transfer
  IF EXISTS(SELECT 1 FROM public.workspace_transfers WHERE workspace_id = p_workspace_id AND status = 'pending') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Transfer already pending');
  END IF;
  
  -- Create transfer request
  INSERT INTO public.workspace_transfers (workspace_id, from_user_id, to_user_id)
  VALUES (p_workspace_id, auth.uid(), p_to_user_id)
  RETURNING id INTO v_transfer_id;
  
  -- Send notification to target user
  INSERT INTO public.notifications (user_id, type, title, message, related_id)
  VALUES (
    p_to_user_id,
    'ownership_transfer_request',
    'Ownership Transfer Request',
    'You have been offered ownership of "' || v_workspace.name || '"',
    v_transfer_id
  );
  
  -- Log activity
  INSERT INTO public.workspace_activity_logs (workspace_id, user_id, action, target_user_id, details)
  VALUES (p_workspace_id, auth.uid(), 'transfer_initiated', p_to_user_id, jsonb_build_object('transfer_id', v_transfer_id));
  
  RETURN jsonb_build_object('success', true, 'transfer_id', v_transfer_id);
END;
$$;

-- Function to respond to ownership transfer
CREATE OR REPLACE FUNCTION public.respond_to_ownership_transfer(p_transfer_id UUID, p_accept BOOLEAN)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_transfer RECORD;
  v_workspace RECORD;
BEGIN
  -- Get transfer
  SELECT * INTO v_transfer FROM public.workspace_transfers WHERE id = p_transfer_id AND status = 'pending';
  
  IF v_transfer IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Transfer not found or expired');
  END IF;
  
  IF v_transfer.to_user_id != auth.uid() THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authorized');
  END IF;
  
  SELECT * INTO v_workspace FROM public.workspaces WHERE id = v_transfer.workspace_id;
  
  IF p_accept THEN
    -- Update transfer status
    UPDATE public.workspace_transfers
    SET status = 'accepted', responded_at = NOW()
    WHERE id = p_transfer_id;
    
    -- Transfer ownership
    UPDATE public.workspaces
    SET creator_id = auth.uid()
    WHERE id = v_transfer.workspace_id;
    
    -- Update roles: new owner becomes owner, old owner becomes admin
    UPDATE public.workspace_members
    SET role = 'owner'
    WHERE workspace_id = v_transfer.workspace_id AND user_id = auth.uid();
    
    UPDATE public.workspace_members
    SET role = 'admin'
    WHERE workspace_id = v_transfer.workspace_id AND user_id = v_transfer.from_user_id;
    
    -- Notify old owner
    INSERT INTO public.notifications (user_id, type, title, message, related_id)
    VALUES (
      v_transfer.from_user_id,
      'ownership_transfer_accepted',
      'Ownership Transfer Accepted',
      'Your ownership transfer for "' || v_workspace.name || '" was accepted',
      v_transfer.workspace_id
    );
    
    -- Log activity
    INSERT INTO public.workspace_activity_logs (workspace_id, user_id, action, target_user_id, details)
    VALUES (v_transfer.workspace_id, auth.uid(), 'ownership_transferred', v_transfer.from_user_id, 
      jsonb_build_object('from_user_id', v_transfer.from_user_id, 'to_user_id', auth.uid()));
    
    RETURN jsonb_build_object('success', true, 'action', 'accepted');
  ELSE
    -- Decline transfer
    UPDATE public.workspace_transfers
    SET status = 'declined', responded_at = NOW()
    WHERE id = p_transfer_id;
    
    -- Notify old owner
    INSERT INTO public.notifications (user_id, type, title, message, related_id)
    VALUES (
      v_transfer.from_user_id,
      'ownership_transfer_declined',
      'Ownership Transfer Declined',
      'Your ownership transfer for "' || v_workspace.name || '" was declined',
      v_transfer.workspace_id
    );
    
    RETURN jsonb_build_object('success', true, 'action', 'declined');
  END IF;
END;
$$;

-- Function to cancel ownership transfer
CREATE OR REPLACE FUNCTION public.cancel_ownership_transfer(p_transfer_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_transfer RECORD;
BEGIN
  SELECT * INTO v_transfer FROM public.workspace_transfers WHERE id = p_transfer_id AND status = 'pending';
  
  IF v_transfer IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Transfer not found');
  END IF;
  
  IF v_transfer.from_user_id != auth.uid() THEN
    RETURN jsonb_build_object('success', false, 'error', 'Only initiator can cancel');
  END IF;
  
  UPDATE public.workspace_transfers
  SET status = 'cancelled', responded_at = NOW()
  WHERE id = p_transfer_id;
  
  RETURN jsonb_build_object('success', true);
END;
$$;

-- Function to log workspace activity (for use in other functions)
CREATE OR REPLACE FUNCTION public.log_workspace_activity(
  p_workspace_id UUID,
  p_action TEXT,
  p_target_user_id UUID DEFAULT NULL,
  p_details JSONB DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_log_id UUID;
BEGIN
  INSERT INTO public.workspace_activity_logs (workspace_id, user_id, action, target_user_id, details)
  VALUES (p_workspace_id, auth.uid(), p_action, p_target_user_id, p_details)
  RETURNING id INTO v_log_id;
  
  RETURN v_log_id;
END;
$$;
