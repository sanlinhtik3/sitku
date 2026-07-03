CREATE POLICY "Admins can view all heartbeats"
  ON public.agent_heartbeats
  FOR SELECT
  USING (has_role(auth.uid(), 'admin'::app_role));