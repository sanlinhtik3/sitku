-- Drop and recreate admin_search_users with better error handling and logging
CREATE OR REPLACE FUNCTION public.admin_search_users(search_query text, result_limit integer DEFAULT 10)
RETURNS TABLE(user_id uuid, full_name text, email text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  current_user_id uuid;
  is_admin boolean;
BEGIN
  -- Get current user ID
  current_user_id := auth.uid();
  
  -- Check if user is authenticated
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized: Not authenticated';
  END IF;
  
  -- Check admin role using direct query (bypass has_role for debugging)
  SELECT EXISTS (
    SELECT 1 FROM user_roles ur 
    WHERE ur.user_id = current_user_id AND ur.role = 'admin'
  ) INTO is_admin;
  
  IF NOT is_admin THEN
    RAISE EXCEPTION 'Unauthorized: Admin access required (user_id: %)', current_user_id;
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
$function$;