-- Create admin RPC function to manually sync a user's email
CREATE OR REPLACE FUNCTION public.admin_sync_user_email(target_user_id uuid, new_email text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Verify caller is admin
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Unauthorized: Not authenticated';
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'admin') THEN
    RAISE EXCEPTION 'Unauthorized: Admin access required';
  END IF;
  
  -- Update the profile with the new email
  UPDATE profiles 
  SET email = new_email, updated_at = now()
  WHERE user_id = target_user_id;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'User profile not found';
  END IF;
END;
$$;