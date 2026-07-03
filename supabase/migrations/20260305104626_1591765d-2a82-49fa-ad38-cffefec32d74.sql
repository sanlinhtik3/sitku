
-- ============================================================
-- SECURITY HARDENING: Fix overly permissive RLS policies
-- ============================================================

-- 1. CRITICAL: credit_transactions - anyone can insert credit records
DROP POLICY IF EXISTS "System can insert transactions" ON public.credit_transactions;
CREATE POLICY "System can insert transactions" ON public.credit_transactions
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- 2. CRITICAL: user_credits - anyone can update ANY user's credits
DROP POLICY IF EXISTS "System can update points" ON public.user_credits;
CREATE POLICY "System can update points" ON public.user_credits
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- 3. referral_codes UPDATE
DROP POLICY IF EXISTS "System can update referral codes" ON public.referral_codes;
CREATE POLICY "System can update referral codes" ON public.referral_codes
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- 4. referral_codes INSERT
DROP POLICY IF EXISTS "System can insert referral codes" ON public.referral_codes;
CREATE POLICY "System can insert referral codes" ON public.referral_codes
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- 5. cr_user_usage INSERT
DROP POLICY IF EXISTS "System can insert usage" ON public.cr_user_usage;
CREATE POLICY "System can insert usage" ON public.cr_user_usage
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- 6. cr_user_usage UPDATE
DROP POLICY IF EXISTS "System can update usage" ON public.cr_user_usage;
CREATE POLICY "System can update usage" ON public.cr_user_usage
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- 7. user_statistics INSERT
DROP POLICY IF EXISTS "System can insert statistics" ON public.user_statistics;
CREATE POLICY "System can insert statistics" ON public.user_statistics
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- 8. user_statistics UPDATE
DROP POLICY IF EXISTS "System can update statistics" ON public.user_statistics;
CREATE POLICY "System can update statistics" ON public.user_statistics
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- 9. notifications INSERT
DROP POLICY IF EXISTS "System can insert notifications" ON public.notifications;
CREATE POLICY "System can insert notifications" ON public.notifications
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- 10. certificates INSERT
DROP POLICY IF EXISTS "System can insert certificates" ON public.certificates;
CREATE POLICY "System can insert certificates" ON public.certificates
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- 11. user_achievements INSERT
DROP POLICY IF EXISTS "System can insert achievements" ON public.user_achievements;
CREATE POLICY "System can insert achievements" ON public.user_achievements
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- 12. referrals INSERT
DROP POLICY IF EXISTS "System can insert referrals" ON public.referrals;
CREATE POLICY "System can insert referrals" ON public.referrals
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = referred_user_id);

-- 13. agent_autonomous_actions INSERT
DROP POLICY IF EXISTS "System can insert autonomous actions" ON public.agent_autonomous_actions;
CREATE POLICY "System can insert autonomous actions" ON public.agent_autonomous_actions
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- 14. agent_proactive_suggestions INSERT
DROP POLICY IF EXISTS "System can insert suggestions" ON public.agent_proactive_suggestions;
CREATE POLICY "System can insert suggestions" ON public.agent_proactive_suggestions
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- 15. expiry_notifications - no user_id, restrict to admin only
DROP POLICY IF EXISTS "System can insert notifications" ON public.expiry_notifications;
CREATE POLICY "System can insert notifications" ON public.expiry_notifications
  FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
