-- Drop the old conflicting/restrictive SELECT policies
DROP POLICY IF EXISTS "Users can view own memberships" ON public.workspace_members;
DROP POLICY IF EXISTS "Users can view workspace members" ON public.workspace_members;

-- Create a single comprehensive SELECT policy
CREATE POLICY "Members can view workspace members"
ON public.workspace_members FOR SELECT
USING (
  -- User is a member of the same workspace (accepted status)
  workspace_id IN (
    SELECT wm.workspace_id 
    FROM workspace_members wm 
    WHERE wm.user_id = auth.uid() 
    AND wm.status = 'accepted'
  )
  OR
  -- User is the one being queried (can see their own membership)
  user_id = auth.uid()
  OR
  -- Admins can see everything
  has_role(auth.uid(), 'admin'::app_role)
);