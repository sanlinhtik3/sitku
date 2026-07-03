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
  -- Admin check
  IF NOT EXISTS (SELECT 1 FROM user_roles WHERE user_id = admin_user_id AND role = 'admin') THEN
    RETURN json_build_object('success', false, 'error', 'Admin access required');
  END IF;

  -- Update iu_bonus (WHERE user_id IS NOT NULL bypasses PostgREST safety check)
  UPDATE user_credits
  SET iu_bonus = COALESCE(iu_bonus, 0) + grant_amount,
      updated_at = NOW()
  WHERE user_id IS NOT NULL;

  GET DIAGNOSTICS affected_count = ROW_COUNT;

  -- Create notifications
  INSERT INTO notifications (user_id, type, title, message)
  SELECT uc.user_id, 'bonus_iu', 'Bonus IU Received!',
         'System က သင့်ကို IU ' || grant_amount || ' ခု bonus ပေးလိုက်ပါပြီ။'
  FROM user_credits uc WHERE uc.user_id IS NOT NULL;

  -- Audit trail (balance_after uses current iu_bonus which already includes the grant)
  INSERT INTO credit_transactions (user_id, credits, transaction_type, description, balance_after)
  SELECT uc.user_id, grant_amount, 'bonus_iu',
         'System bonus grant: +' || grant_amount || ' IU',
         COALESCE(uc.iu_bonus, 0)::integer
  FROM user_credits uc WHERE uc.user_id IS NOT NULL;

  RETURN json_build_object(
    'success', true,
    'updated_count', affected_count,
    'grant_amount', grant_amount
  );
EXCEPTION WHEN OTHERS THEN
  RETURN json_build_object('success', false, 'error', SQLERRM);
END;
$$;