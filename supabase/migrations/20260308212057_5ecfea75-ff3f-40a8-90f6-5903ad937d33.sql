CREATE POLICY "Users can view own heartbeat logs"
  ON public.agent_heartbeat_logs
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());