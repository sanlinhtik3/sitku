-- ════════════════════ BeeBot Finance Suite ════════════════════

-- ═══ user_budgets ═══
CREATE TABLE public.user_budgets (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  period TEXT NOT NULL DEFAULT 'monthly' CHECK (period IN ('weekly','monthly','yearly')),
  category_id UUID NULL REFERENCES public.transaction_categories(id) ON DELETE SET NULL,
  amount NUMERIC NOT NULL CHECK (amount >= 0),
  currency TEXT NOT NULL DEFAULT 'MMK',
  start_date DATE NOT NULL DEFAULT CURRENT_DATE,
  end_date DATE NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  alert_threshold_pct INTEGER NOT NULL DEFAULT 80 CHECK (alert_threshold_pct BETWEEN 1 AND 200),
  notes TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.user_budgets ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_user_budgets_user_active ON public.user_budgets(user_id, is_active);
CREATE INDEX idx_user_budgets_category ON public.user_budgets(category_id);

CREATE POLICY "user_budgets_select_own" ON public.user_budgets FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "user_budgets_insert_own" ON public.user_budgets FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "user_budgets_update_own" ON public.user_budgets FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "user_budgets_delete_own" ON public.user_budgets FOR DELETE USING (auth.uid() = user_id);

CREATE TRIGGER trg_user_budgets_updated_at
  BEFORE UPDATE ON public.user_budgets
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ═══ user_investments ═══
CREATE TABLE public.user_investments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  account_id UUID NULL REFERENCES public.financial_accounts(id) ON DELETE SET NULL,
  symbol TEXT NOT NULL,
  asset_type TEXT NOT NULL DEFAULT 'other' CHECK (asset_type IN ('crypto','stock','gold','fund','cash','real_estate','bond','other')),
  quantity NUMERIC NOT NULL CHECK (quantity >= 0),
  avg_cost_per_unit NUMERIC NOT NULL CHECK (avg_cost_per_unit >= 0),
  current_price NUMERIC NULL,
  currency TEXT NOT NULL DEFAULT 'USD',
  notes TEXT NULL,
  last_priced_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.user_investments ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_user_investments_user ON public.user_investments(user_id);
CREATE INDEX idx_user_investments_symbol ON public.user_investments(user_id, symbol);

CREATE POLICY "user_investments_select_own" ON public.user_investments FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "user_investments_insert_own" ON public.user_investments FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "user_investments_update_own" ON public.user_investments FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "user_investments_delete_own" ON public.user_investments FOR DELETE USING (auth.uid() = user_id);

CREATE TRIGGER trg_user_investments_updated_at
  BEFORE UPDATE ON public.user_investments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ═══ user_tax_profile ═══
CREATE TABLE public.user_tax_profile (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE,
  country_code TEXT NOT NULL DEFAULT 'MM',
  tax_year_start_month SMALLINT NOT NULL DEFAULT 4 CHECK (tax_year_start_month BETWEEN 1 AND 12),
  filing_status TEXT NOT NULL DEFAULT 'individual',
  custom_brackets JSONB NULL,
  allowances JSONB NOT NULL DEFAULT '{}'::jsonb,
  notes TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.user_tax_profile ENABLE ROW LEVEL SECURITY;

CREATE POLICY "user_tax_profile_select_own" ON public.user_tax_profile FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "user_tax_profile_insert_own" ON public.user_tax_profile FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "user_tax_profile_update_own" ON public.user_tax_profile FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "user_tax_profile_delete_own" ON public.user_tax_profile FOR DELETE USING (auth.uid() = user_id);

CREATE TRIGGER trg_user_tax_profile_updated_at
  BEFORE UPDATE ON public.user_tax_profile
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();