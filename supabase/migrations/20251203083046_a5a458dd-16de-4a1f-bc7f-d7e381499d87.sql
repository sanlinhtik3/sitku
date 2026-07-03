-- Drop existing problematic RLS policies for workspace_members
DROP POLICY IF EXISTS "Admins can manage all memberships" ON public.workspace_members;
DROP POLICY IF EXISTS "Members can view workspace members" ON public.workspace_members;
DROP POLICY IF EXISTS "Workspace owners can manage members" ON public.workspace_members;
DROP POLICY IF EXISTS "Admins can manage memberships" ON public.workspace_members;
DROP POLICY IF EXISTS "Users can view own memberships" ON public.workspace_members;
DROP POLICY IF EXISTS "Users can insert memberships" ON public.workspace_members;
DROP POLICY IF EXISTS "Users can update own membership" ON public.workspace_members;
DROP POLICY IF EXISTS "Owners can delete workspace members" ON public.workspace_members;

-- Drop existing problematic RLS policies for workspaces
DROP POLICY IF EXISTS "Admins can manage all workspaces" ON public.workspaces;
DROP POLICY IF EXISTS "Users can view workspaces they own or are members of" ON public.workspaces;
DROP POLICY IF EXISTS "Users can create workspaces" ON public.workspaces;
DROP POLICY IF EXISTS "Owners can update their workspaces" ON public.workspaces;
DROP POLICY IF EXISTS "Owners can delete their workspaces" ON public.workspaces;
DROP POLICY IF EXISTS "Users can view owned workspaces" ON public.workspaces;
DROP POLICY IF EXISTS "Admins can view all workspaces" ON public.workspaces;
DROP POLICY IF EXISTS "Owners can update workspaces" ON public.workspaces;
DROP POLICY IF EXISTS "Owners can delete workspaces" ON public.workspaces;

-- Create simple, non-recursive policies for workspace_members
-- Users can see their own membership records (flat, no joins)
CREATE POLICY "Users can view own memberships"
ON public.workspace_members
FOR SELECT
USING (user_id = auth.uid());

-- Admins can view all memberships
CREATE POLICY "Admins can view all memberships"
ON public.workspace_members
FOR SELECT
USING (has_role(auth.uid(), 'admin'::app_role));

-- Users can insert memberships (for inviting)
CREATE POLICY "Users can insert memberships"
ON public.workspace_members
FOR INSERT
WITH CHECK (invited_by = auth.uid());

-- Users can update their own membership
CREATE POLICY "Users can update own membership"
ON public.workspace_members
FOR UPDATE
USING (user_id = auth.uid());

-- Users can delete their own membership or memberships they invited
CREATE POLICY "Users can delete memberships"
ON public.workspace_members
FOR DELETE
USING (user_id = auth.uid() OR invited_by = auth.uid());

-- Admins can manage all memberships
CREATE POLICY "Admins can manage memberships"
ON public.workspace_members
FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role));

-- Create simple, non-recursive policies for workspaces
-- Users can view workspaces they created
CREATE POLICY "Users can view own workspaces"
ON public.workspaces
FOR SELECT
USING (creator_id = auth.uid());

-- Admins can view all workspaces
CREATE POLICY "Admins can view all workspaces"
ON public.workspaces
FOR SELECT
USING (has_role(auth.uid(), 'admin'::app_role));

-- Users can create workspaces
CREATE POLICY "Users can create workspaces"
ON public.workspaces
FOR INSERT
WITH CHECK (creator_id = auth.uid());

-- Creators can update their workspaces
CREATE POLICY "Creators can update workspaces"
ON public.workspaces
FOR UPDATE
USING (creator_id = auth.uid());

-- Creators can delete their workspaces
CREATE POLICY "Creators can delete workspaces"
ON public.workspaces
FOR DELETE
USING (creator_id = auth.uid());

-- Admins can manage all workspaces
CREATE POLICY "Admins can manage all workspaces"
ON public.workspaces
FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role));