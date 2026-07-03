-- Allow workspace members to view profiles of other members in their shared workspaces
CREATE POLICY "Workspace members can view other members profiles"
ON public.profiles
FOR SELECT
USING (
  user_id = auth.uid()
  OR EXISTS (
    SELECT 1 FROM workspace_members wm1
    JOIN workspace_members wm2 ON wm1.workspace_id = wm2.workspace_id
    WHERE wm1.user_id = auth.uid()
    AND wm2.user_id = profiles.user_id
    AND wm1.status = 'accepted'
    AND wm2.status = 'accepted'
  )
  OR has_role(auth.uid(), 'admin'::app_role)
);