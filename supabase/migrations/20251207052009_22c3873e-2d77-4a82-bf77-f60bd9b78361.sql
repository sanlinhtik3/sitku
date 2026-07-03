-- Drop the problematic recursive policy
DROP POLICY IF EXISTS "Members can view workspace members" ON public.workspace_members;

-- Create a security definer function to check workspace membership (avoids recursion)
CREATE OR REPLACE FUNCTION public.is_workspace_member(p_user_id uuid, p_workspace_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM workspace_members
    WHERE user_id = p_user_id
    AND workspace_id = p_workspace_id
    AND status = 'accepted'
  )
$$;

-- Create non-recursive SELECT policy using the security definer function
CREATE POLICY "Members can view workspace members"
ON public.workspace_members FOR SELECT
USING (
  -- User can see their own membership row
  user_id = auth.uid()
  OR
  -- User can see members of workspaces they belong to (via security definer function)
  public.is_workspace_member(auth.uid(), workspace_id)
  OR
  -- App admins can see everything
  has_role(auth.uid(), 'admin'::app_role)
);