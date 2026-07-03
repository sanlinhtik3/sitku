-- BUG-2 FIX: Allow any authenticated user to SELECT link codes by code value for verification
-- Drop the existing restrictive SELECT policy
DROP POLICY IF EXISTS "Users can view their own link codes" ON public.channel_link_codes;

-- Create a permissive SELECT policy that allows reading by code value (for verification flow)
CREATE POLICY "Authenticated users can verify link codes"
ON public.channel_link_codes
FOR SELECT
USING (auth.uid() IS NOT NULL);

-- Also allow any authenticated user to UPDATE (mark as used) link codes they verified
DROP POLICY IF EXISTS "Users can update their own link codes" ON public.channel_link_codes;

CREATE POLICY "Authenticated users can mark codes as used"
ON public.channel_link_codes
FOR UPDATE
USING (auth.uid() IS NOT NULL)
WITH CHECK (auth.uid() IS NOT NULL);