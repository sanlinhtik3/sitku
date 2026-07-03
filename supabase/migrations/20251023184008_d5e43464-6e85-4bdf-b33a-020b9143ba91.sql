-- Add policy to allow admins to update any profile
CREATE POLICY "Admins can update any profile" ON profiles
  FOR UPDATE
  USING (has_role(auth.uid(), 'admin'));