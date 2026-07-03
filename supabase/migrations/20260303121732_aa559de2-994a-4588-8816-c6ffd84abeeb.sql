CREATE POLICY "Admins can view all ai usage"
ON public.agent_ai_usage
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role));