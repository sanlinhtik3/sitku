-- Fix admin grant credits functionality
CREATE POLICY "Admins can insert credits for any user"
ON public.user_credits
FOR INSERT
TO public
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can update credits for any user"
ON public.user_credits
FOR UPDATE
TO public
USING (has_role(auth.uid(), 'admin'::app_role));

-- Allow system to insert notifications for automated processes
CREATE POLICY "System can insert notifications"
ON public.notifications
FOR INSERT
TO public
WITH CHECK (true);