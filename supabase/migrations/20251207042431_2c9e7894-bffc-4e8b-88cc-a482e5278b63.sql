
-- Drop the potentially recursive policies
DROP POLICY IF EXISTS "Members can view workspace colleagues" ON public.workspace_members;
DROP POLICY IF EXISTS "Users can view own workspace memberships" ON public.workspace_members;

-- Create a security definer function to check workspace membership
CREATE OR REPLACE FUNCTION public.get_user_workspace_ids(p_user_id UUID)
RETURNS SETOF UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT workspace_id
  FROM public.workspace_members
  WHERE user_id = p_user_id
  AND status = 'accepted';
$$;

-- Create non-recursive policies using the function
-- Policy: Users can view members of their workspaces (including their own records and pending invites to them)
CREATE POLICY "Users can view workspace members"
ON public.workspace_members FOR SELECT
USING (
  user_id = auth.uid()
  OR workspace_id IN (SELECT public.get_user_workspace_ids(auth.uid()))
  OR has_role(auth.uid(), 'admin'::app_role)
);
