-- Create admin user search function with SECURITY DEFINER
-- This allows admins to search all users while bypassing RLS
CREATE OR REPLACE FUNCTION admin_search_users(search_query text, result_limit int DEFAULT 10)
RETURNS TABLE (
  user_id uuid,
  full_name text,
  email text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Validate admin access using existing has_role function
  IF NOT has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Unauthorized: Admin access required';
  END IF;
  
  -- Return search results - bypass RLS with SECURITY DEFINER
  RETURN QUERY
  SELECT p.user_id, p.full_name, p.email
  FROM profiles p
  WHERE 
    (search_query IS NULL OR search_query = '' OR
     p.full_name ILIKE '%' || search_query || '%' OR 
     p.email ILIKE '%' || search_query || '%')
  ORDER BY p.full_name NULLS LAST
  LIMIT result_limit;
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION admin_search_users TO authenticated;

-- Add comment for documentation
COMMENT ON FUNCTION admin_search_users IS 'Secure admin-only function to search users by name or email. Validates admin role before returning results.';