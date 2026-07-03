-- ═══════════════════════════════════════════════════════════════════════════
-- PHASE 1: ZoeCrypto "Apex" Intelligence Orchestration System
-- Dual-Core AI Architecture: Gemini 3 + Claude 4.6
-- ═══════════════════════════════════════════════════════════════════════════

-- 1.1 Enhance ai_model_settings with dual API keys
ALTER TABLE public.ai_model_settings 
ADD COLUMN IF NOT EXISTS google_system_api_key TEXT,
ADD COLUMN IF NOT EXISTS anthropic_system_api_key TEXT,
ADD COLUMN IF NOT EXISTS default_gemini_model TEXT DEFAULT 'gemini-3-flash-preview',
ADD COLUMN IF NOT EXISTS default_claude_model TEXT DEFAULT 'claude-4-5-sonnet';

-- Migrate existing system_api_key to google_system_api_key
UPDATE public.ai_model_settings 
SET google_system_api_key = system_api_key
WHERE system_api_key IS NOT NULL AND google_system_api_key IS NULL;

COMMENT ON COLUMN ai_model_settings.google_system_api_key IS 
'Admin Gemini API key (Google AI Studio). For Explorer and Analyst tiers.';

COMMENT ON COLUMN ai_model_settings.anthropic_system_api_key IS 
'Admin Claude API key (Anthropic Console). For Alpha tier - Claude 4.6 Opus access.';

-- 1.2 Create tier_registry table
CREATE TABLE IF NOT EXISTS public.tier_registry (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tier_key TEXT UNIQUE NOT NULL,
  display_name TEXT NOT NULL,
  display_name_mm TEXT,
  icon_name TEXT,
  color_gradient TEXT,
  
  -- IU Limits
  daily_iu_limit INTEGER NOT NULL,
  iu_bonus_with_key INTEGER DEFAULT 0,
  
  -- Model Access (arrays for flexibility)
  allowed_gemini_models TEXT[] NOT NULL,
  allowed_claude_models TEXT[] DEFAULT ARRAY[]::TEXT[],
  default_model TEXT NOT NULL,
  max_context_window INTEGER DEFAULT 100000,
  
  -- Priority
  priority_level INTEGER DEFAULT 0,
  priority_label TEXT DEFAULT 'Standard',
  
  -- Pricing
  monthly_price_mmk INTEGER DEFAULT 0,
  
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Seed Apex Tiers
INSERT INTO tier_registry (tier_key, display_name, display_name_mm, icon_name, color_gradient,
  daily_iu_limit, iu_bonus_with_key, 
  allowed_gemini_models, allowed_claude_models, default_model,
  max_context_window, priority_level, priority_label, monthly_price_mmk) 
VALUES
-- Explorer (Free)
('explorer', 'Explorer', 'စူးစမ်းသူ', 'sparkles', 'from-slate-500 to-slate-400',
  10, 0,
  ARRAY['gemini-2.5-flash', 'gemini-2.5-flash-lite'], ARRAY[]::TEXT[], 'gemini-2.5-flash',
  50000, 0, 'Standard', 0),

-- Analyst (Pro)
('analyst', 'Analyst', 'ပိုင်းခြားသုံးသပ်သူ', 'brain', 'from-primary to-blue-500',
  200, 100,
  ARRAY['gemini-2.5-flash', 'gemini-2.5-pro', 'gemini-3-flash-preview'], 
  ARRAY['claude-4-5-sonnet'], 'gemini-3-flash-preview',
  100000, 1, 'High Priority', 9900),

-- Alpha (Pro+)
('alpha', 'Alpha', 'အယ်လ်ဖာ', 'crown', 'from-amber-500 to-orange-500',
  -1, 0,
  ARRAY['gemini-2.5-flash', 'gemini-2.5-pro', 'gemini-3-flash-preview', 'gemini-3-pro-preview'], 
  ARRAY['claude-4-5-sonnet', 'claude-4-6-opus'], 'claude-4-6-opus',
  200000, 2, 'Quantum Priority', 14900),

-- Sovereign (Admin)
('admin', 'Sovereign', 'အချုပ်အခြာ', 'shield', 'from-purple-600 to-violet-500',
  -1, 0,
  ARRAY['gemini-2.5-flash', 'gemini-2.5-pro', 'gemini-3-flash-preview', 'gemini-3-pro-preview'],
  ARRAY['claude-4-5-sonnet', 'claude-4-6-opus'], 'claude-4-6-opus',
  500000, 3, 'Dedicated Lane', 0)
ON CONFLICT (tier_key) DO NOTHING;

-- Enable RLS on tier_registry
ALTER TABLE public.tier_registry ENABLE ROW LEVEL SECURITY;

-- Policy: Anyone can read tiers (needed for UI)
CREATE POLICY "Anyone can read tier_registry"
ON public.tier_registry FOR SELECT
TO authenticated
USING (true);

-- Policy: Only admins can modify tiers
CREATE POLICY "Admins can manage tier_registry"
ON public.tier_registry FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::public.app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

-- 1.3 Create model_cost_matrix table
CREATE TABLE IF NOT EXISTS public.model_cost_matrix (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  model_id TEXT UNIQUE NOT NULL,
  model_display_name TEXT NOT NULL,
  model_display_name_mm TEXT,
  provider TEXT NOT NULL, -- 'google' or 'anthropic'
  
  -- IU Cost (per 1000 tokens)
  iu_per_1k_input DECIMAL(6,4) DEFAULT 0.01,
  iu_per_1k_output DECIMAL(6,4) DEFAULT 0.04,
  base_iu_per_request DECIMAL(4,2) DEFAULT 0.5,
  
  min_tier_level INTEGER DEFAULT 0,
  is_available BOOLEAN DEFAULT true,
  is_new BOOLEAN DEFAULT false,
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Seed Gemini Models
INSERT INTO model_cost_matrix (model_id, model_display_name, model_display_name_mm, provider, 
  iu_per_1k_input, iu_per_1k_output, base_iu_per_request, min_tier_level, is_new)
VALUES
('gemini-2.5-flash-lite', 'Gemini 2.5 Flash Lite', 'ဂျမ်နီ ၂.၅ Flash Lite', 'google', 0.005, 0.015, 0.25, 0, false),
('gemini-2.5-flash', 'Gemini 2.5 Flash', 'ဂျမ်နီ ၂.၅ Flash', 'google', 0.01, 0.04, 0.5, 0, false),
('gemini-2.5-pro', 'Gemini 2.5 Pro', 'ဂျမ်နီ ၂.၅ Pro', 'google', 0.05, 0.20, 1.0, 1, false),
('gemini-3-flash-preview', 'Gemini 3 Flash', 'ဂျမ်နီ ၃ Flash', 'google', 0.015, 0.06, 0.5, 1, true),
('gemini-3-pro-preview', 'Gemini 3 Pro', 'ဂျမ်နီ ၃ Pro', 'google', 0.08, 0.32, 1.5, 2, true),

-- Seed Claude Models (Higher costs for premium access)
('claude-4-5-sonnet', 'Claude 4.5 Sonnet', 'ခလော်ဒ် ၄.၅ Sonnet', 'anthropic', 0.12, 0.48, 2.0, 1, false),
('claude-4-6-opus', 'Claude 4.6 Opus', 'ခလော်ဒ် ၄.၆ Opus (The God Model)', 'anthropic', 0.30, 1.20, 10.0, 2, true)
ON CONFLICT (model_id) DO NOTHING;

-- Enable RLS on model_cost_matrix
ALTER TABLE public.model_cost_matrix ENABLE ROW LEVEL SECURITY;

-- Policy: Anyone can read model costs
CREATE POLICY "Anyone can read model_cost_matrix"
ON public.model_cost_matrix FOR SELECT
TO authenticated
USING (true);

-- Policy: Only admins can modify model costs
CREATE POLICY "Admins can manage model_cost_matrix"
ON public.model_cost_matrix FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::public.app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

-- 1.4 Enhance daily_usage with IU tracking
ALTER TABLE public.daily_usage 
ADD COLUMN IF NOT EXISTS iu_consumed DECIMAL(10,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS tokens_input INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS tokens_output INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS model_used TEXT,
ADD COLUMN IF NOT EXISTS provider_used TEXT;

CREATE INDEX IF NOT EXISTS idx_daily_usage_model ON public.daily_usage(model_used);
CREATE INDEX IF NOT EXISTS idx_daily_usage_provider ON public.daily_usage(provider_used);

-- 1.5 Enhance user_credits with IU fields
ALTER TABLE public.user_credits
ADD COLUMN IF NOT EXISTS iu_balance DECIMAL(10,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS iu_bonus DECIMAL(10,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS tier_key TEXT DEFAULT 'explorer',
ADD COLUMN IF NOT EXISTS preferred_model TEXT,
ADD COLUMN IF NOT EXISTS preferred_provider TEXT DEFAULT 'google';

-- Migrate existing balances (1 credit = 1 IU)
UPDATE public.user_credits 
SET iu_balance = COALESCE(balance, 0),
    iu_bonus = COALESCE(pro_bonus_credits, 0)
WHERE iu_balance = 0;

-- Set tier based on subscription
UPDATE public.user_credits uc
SET tier_key = CASE 
  WHEN EXISTS (SELECT 1 FROM user_roles WHERE user_id = uc.user_id AND role = 'admin') THEN 'admin'
  WHEN EXISTS (SELECT 1 FROM pro_subscriptions WHERE user_id = uc.user_id AND plan_type = 'pro_plus' AND status = 'active') THEN 'alpha'
  WHEN EXISTS (SELECT 1 FROM pro_subscriptions WHERE user_id = uc.user_id AND plan_type = 'pro' AND status = 'active') THEN 'analyst'
  ELSE 'explorer'
END
WHERE tier_key = 'explorer' OR tier_key IS NULL;

-- 1.6 Create iu_transactions table for audit trail
CREATE TABLE IF NOT EXISTS public.iu_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  iu_amount DECIMAL(10,2) NOT NULL,
  transaction_type TEXT NOT NULL, -- 'usage', 'purchase', 'subscription_bonus', 'refund', 'gift'
  source_pool TEXT, -- 'daily', 'bonus', 'balance'
  
  feature_key TEXT,
  model_used TEXT,
  provider_used TEXT,
  tokens_processed INTEGER,
  request_id UUID,
  
  description TEXT,
  balance_after DECIMAL(10,2),
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_iu_transactions_user ON public.iu_transactions(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_iu_transactions_type ON public.iu_transactions(transaction_type);

-- Enable RLS
ALTER TABLE public.iu_transactions ENABLE ROW LEVEL SECURITY;

-- Users can only see their own transactions
CREATE POLICY "Users can view own iu_transactions"
ON public.iu_transactions FOR SELECT
TO authenticated
USING (user_id = auth.uid());

-- System inserts via SECURITY DEFINER functions
CREATE POLICY "System can insert iu_transactions"
ON public.iu_transactions FOR INSERT
TO authenticated
WITH CHECK (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::public.app_role));

-- Admins can view all transactions
CREATE POLICY "Admins can view all iu_transactions"
ON public.iu_transactions FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::public.app_role));