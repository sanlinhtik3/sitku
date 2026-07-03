-- Add DELETE policy for workspace tasks so admins can delete tasks
CREATE POLICY "Admins can delete workspace tasks"
ON public.workspace_tasks FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM workspace_members
    WHERE workspace_members.workspace_id = workspace_tasks.workspace_id
      AND workspace_members.user_id = auth.uid()
      AND workspace_members.role IN ('owner', 'admin')
      AND workspace_members.status = 'accepted'
  )
);

-- Also add UPDATE policy for admins to edit tasks
CREATE POLICY "Admins can update workspace tasks"
ON public.workspace_tasks FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM workspace_members
    WHERE workspace_members.workspace_id = workspace_tasks.workspace_id
      AND workspace_members.user_id = auth.uid()
      AND workspace_members.role IN ('owner', 'admin')
      AND workspace_members.status = 'accepted'
  )
);