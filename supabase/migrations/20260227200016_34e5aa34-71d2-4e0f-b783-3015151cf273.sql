CREATE OR REPLACE FUNCTION admin_bulk_grant_iu(
  grant_amount INTEGER,
  admin_user_id UUID
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  affected_count INTEGER;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM user_roles WHERE user_id = admin_user_id AND role = 'admin') THEN
    RAISE EXCEPTION 'Admin access required';
  END IF;

  UPDATE user_credits
  SET balance = balance + grant_amount,
      total_earned = total_earned + grant_amount,
      updated_at = NOW()
  WHERE true;

  GET DIAGNOSTICS affected_count = ROW_COUNT;

  RETURN json_build_object(
    'success', true,
    'updated_count', affected_count,
    'grant_amount', grant_amount
  );
END;
$$;