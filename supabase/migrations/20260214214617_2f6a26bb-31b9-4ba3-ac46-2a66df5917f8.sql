CREATE POLICY "Admins can update all heartbeats"
  ON public.agent_heartbeats
  FOR UPDATE
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));