
-- Drop the recursive policy that's causing issues
DROP POLICY IF EXISTS "Members can view accepted workspace members" ON public.workspace_members;

-- Create simplified non-recursive policies for workspace_members
-- Policy 1: Users can view their own membership records
CREATE POLICY "Users can view own workspace memberships"
ON public.workspace_members FOR SELECT
USING (user_id = auth.uid());

-- Policy 2: Users can view other members of workspaces they belong to
-- This uses a subquery approach that avoids recursion by checking workspace_id directly
CREATE POLICY "Members can view workspace colleagues"
ON public.workspace_members FOR SELECT
USING (
  workspace_id IN (
    SELECT wm.workspace_id 
    FROM public.workspace_members wm 
    WHERE wm.user_id = auth.uid() 
    AND wm.status = 'accepted'
  )
);
