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
  SET iu_bonus = iu_bonus + grant_amount,
      updated_at = NOW()
  WHERE true;

  GET DIAGNOSTICS affected_count = ROW_COUNT;

  INSERT INTO notifications (user_id, type, title, message)
  SELECT uc.user_id,
         'bonus_iu',
         'Bonus IU Received!',
         'System က သင့်ကို IU ' || grant_amount || ' ခု bonus ပေးလိုက်ပါပြီ။'
  FROM user_credits uc;

  INSERT INTO credit_transactions (user_id, credits, transaction_type, description, balance_after)
  SELECT uc.user_id,
         grant_amount,
         'bonus_iu',
         'System bonus grant: +' || grant_amount || ' IU',
         uc.iu_bonus + grant_amount
  FROM user_credits uc;

  RETURN json_build_object(
    'success', true,
    'updated_count', affected_count,
    'grant_amount', grant_amount
  );
END;
$$;