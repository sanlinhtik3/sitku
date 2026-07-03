-- Step 1: Drop the policy that depends on the function
DROP POLICY IF EXISTS "Members can view workspace members" ON public.workspace_members;

-- Step 2: Drop and recreate the function with plpgsql to ensure SECURITY DEFINER bypasses RLS
DROP FUNCTION IF EXISTS public.is_workspace_member(uuid, uuid);

CREATE OR REPLACE FUNCTION public.is_workspace_member(p_user_id uuid, p_workspace_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.workspace_members
    WHERE user_id = p_user_id
    AND workspace_id = p_workspace_id
    AND status = 'accepted'
  );
END;
$$;

-- Step 3: Recreate the SELECT policy using the security definer function
CREATE POLICY "Members can view workspace members"
ON public.workspace_members FOR SELECT
USING (
  user_id = auth.uid()
  OR public.is_workspace_member(auth.uid(), workspace_id)
  OR has_role(auth.uid(), 'admin'::app_role)
);