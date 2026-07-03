-- Drop overly permissive UPDATE policy
DROP POLICY IF EXISTS "System can update responses" ON public.cr_responses;

-- Create secure policy - users can only update their own responses
CREATE POLICY "Users can update own responses"
  ON public.cr_responses FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);