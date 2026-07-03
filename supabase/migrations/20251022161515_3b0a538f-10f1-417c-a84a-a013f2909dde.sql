-- Fix the generate_slug function to set search_path
CREATE OR REPLACE FUNCTION generate_slug(text_input TEXT)
RETURNS TEXT 
LANGUAGE plpgsql 
IMMUTABLE 
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN lower(regexp_replace(regexp_replace(text_input, '[^a-zA-Z0-9\s-]', '', 'g'), '\s+', '-', 'g'));
END;
$$;