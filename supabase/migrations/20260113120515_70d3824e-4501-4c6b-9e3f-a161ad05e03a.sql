
-- =====================================================
-- FlowState: Income & Expense Tracker Database Schema
-- =====================================================

-- 1. Financial Accounts (User's bank accounts, wallets, etc.)
CREATE TABLE public.financial_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  account_name TEXT NOT NULL,
  account_type TEXT NOT NULL DEFAULT 'cash',
  currency TEXT NOT NULL DEFAULT 'MMK',
  current_balance DECIMAL(15,2) DEFAULT 0,
  icon TEXT DEFAULT 'Wallet',
  color TEXT DEFAULT '#3B82F6',
  is_default BOOLEAN DEFAULT false,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Transaction Categories
CREATE TABLE public.transaction_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID,
  name TEXT NOT NULL,
  name_my TEXT,
  icon TEXT NOT NULL DEFAULT 'Tag',
  color TEXT NOT NULL DEFAULT '#6B7280',
  type TEXT NOT NULL,
  is_system BOOLEAN DEFAULT false,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 3. User Transactions
CREATE TABLE public.user_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  account_id UUID NOT NULL REFERENCES public.financial_accounts(id) ON DELETE CASCADE,
  category_id UUID REFERENCES public.transaction_categories(id) ON DELETE SET NULL,
  type TEXT NOT NULL,
  amount DECIMAL(15,2) NOT NULL,
  currency TEXT NOT NULL DEFAULT 'MMK',
  description TEXT,
  notes TEXT,
  transaction_date DATE NOT NULL DEFAULT CURRENT_DATE,
  is_recurring BOOLEAN DEFAULT false,
  recurring_id UUID,
  tags TEXT[],
  attachment_url TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 4. User Subscriptions
CREATE TABLE public.user_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  account_id UUID REFERENCES public.financial_accounts(id) ON DELETE SET NULL,
  category_id UUID REFERENCES public.transaction_categories(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  amount DECIMAL(15,2) NOT NULL,
  currency TEXT NOT NULL DEFAULT 'MMK',
  billing_cycle TEXT NOT NULL DEFAULT 'monthly',
  next_billing_date DATE NOT NULL,
  icon TEXT DEFAULT 'CreditCard',
  color TEXT,
  is_active BOOLEAN DEFAULT true,
  reminder_enabled BOOLEAN DEFAULT true,
  reminder_days_before INTEGER DEFAULT 3,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 5. Currency Exchange Rates
CREATE TABLE public.currency_exchange_rates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  base_currency TEXT NOT NULL,
  target_currency TEXT NOT NULL,
  rate DECIMAL(15,6) NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(base_currency, target_currency)
);

-- 6. FlowState Settings (per user)
CREATE TABLE public.flowstate_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE,
  primary_currency TEXT DEFAULT 'MMK',
  display_currencies TEXT[] DEFAULT ARRAY['MMK', 'USD'],
  monthly_budget DECIMAL(15,2),
  show_balance_on_dashboard BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- =====================================================
-- Enable RLS on all tables
-- =====================================================

ALTER TABLE public.financial_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transaction_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.currency_exchange_rates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.flowstate_settings ENABLE ROW LEVEL SECURITY;

-- =====================================================
-- RLS Policies for financial_accounts
-- =====================================================

CREATE POLICY "Users can view own accounts"
  ON public.financial_accounts FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own accounts"
  ON public.financial_accounts FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own accounts"
  ON public.financial_accounts FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own accounts"
  ON public.financial_accounts FOR DELETE
  USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all accounts"
  ON public.financial_accounts FOR SELECT
  USING (has_role(auth.uid(), 'admin'::app_role));

-- =====================================================
-- RLS Policies for transaction_categories
-- =====================================================

CREATE POLICY "Users can view system categories"
  ON public.transaction_categories FOR SELECT
  USING (is_system = true);

CREATE POLICY "Users can view own categories"
  ON public.transaction_categories FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own categories"
  ON public.transaction_categories FOR INSERT
  WITH CHECK (auth.uid() = user_id AND is_system = false);

CREATE POLICY "Users can update own categories"
  ON public.transaction_categories FOR UPDATE
  USING (auth.uid() = user_id AND is_system = false);

CREATE POLICY "Users can delete own categories"
  ON public.transaction_categories FOR DELETE
  USING (auth.uid() = user_id AND is_system = false);

CREATE POLICY "Admins can manage all categories"
  ON public.transaction_categories FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role));

-- =====================================================
-- RLS Policies for user_transactions
-- =====================================================

CREATE POLICY "Users can view own transactions"
  ON public.user_transactions FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own transactions"
  ON public.user_transactions FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own transactions"
  ON public.user_transactions FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own transactions"
  ON public.user_transactions FOR DELETE
  USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all transactions"
  ON public.user_transactions FOR SELECT
  USING (has_role(auth.uid(), 'admin'::app_role));

-- =====================================================
-- RLS Policies for user_subscriptions
-- =====================================================

CREATE POLICY "Users can view own subscriptions"
  ON public.user_subscriptions FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own subscriptions"
  ON public.user_subscriptions FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own subscriptions"
  ON public.user_subscriptions FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own subscriptions"
  ON public.user_subscriptions FOR DELETE
  USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all subscriptions"
  ON public.user_subscriptions FOR SELECT
  USING (has_role(auth.uid(), 'admin'::app_role));

-- =====================================================
-- RLS Policies for currency_exchange_rates
-- =====================================================

CREATE POLICY "Anyone can view exchange rates"
  ON public.currency_exchange_rates FOR SELECT
  USING (true);

CREATE POLICY "Admins can manage exchange rates"
  ON public.currency_exchange_rates FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role));

-- =====================================================
-- RLS Policies for flowstate_settings
-- =====================================================

CREATE POLICY "Users can view own settings"
  ON public.flowstate_settings FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own settings"
  ON public.flowstate_settings FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own settings"
  ON public.flowstate_settings FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all settings"
  ON public.flowstate_settings FOR SELECT
  USING (has_role(auth.uid(), 'admin'::app_role));

-- =====================================================
-- Seed Default System Categories
-- =====================================================

INSERT INTO public.transaction_categories (name, name_my, icon, color, type, is_system, user_id) VALUES
-- Income Categories
('Salary', 'လစာ', 'Briefcase', '#22C55E', 'income', true, NULL),
('Freelance', 'လွတ်လပ်အလုပ်', 'Laptop', '#10B981', 'income', true, NULL),
('Investment', 'ရင်းနှီးမြှုပ်နှံမှု', 'TrendingUp', '#059669', 'income', true, NULL),
('Gift', 'လက်ဆောင်', 'Gift', '#34D399', 'income', true, NULL),
('Other Income', 'အခြားဝင်ငွေ', 'Plus', '#6EE7B7', 'income', true, NULL),
-- Expense Categories
('Food & Dining', 'အစားအသောက်', 'Utensils', '#F472B6', 'expense', true, NULL),
('Transport', 'သယ်ယူပို့ဆောင်ရေး', 'Car', '#F59E0B', 'expense', true, NULL),
('Shopping', 'စျေးဝယ်', 'ShoppingBag', '#A855F7', 'expense', true, NULL),
('Entertainment', 'ဖျော်ဖြေရေး', 'Film', '#06B6D4', 'expense', true, NULL),
('Utilities', 'အသုံးအဆောင်ခ', 'Zap', '#F97316', 'expense', true, NULL),
('Tech & Software', 'နည်းပညာ', 'Monitor', '#22C55E', 'expense', true, NULL),
('Health', 'ကျန်းမာရေး', 'Heart', '#EC4899', 'expense', true, NULL),
('Education', 'ပညာရေး', 'GraduationCap', '#8B5CF6', 'expense', true, NULL),
('Clothing', 'အဝတ်အထည်', 'Shirt', '#F43F5E', 'expense', true, NULL),
('Housing', 'အိမ်ခန်းခ', 'Home', '#0EA5E9', 'expense', true, NULL),
('Other Expense', 'အခြားအသုံးစရိတ်', 'MoreHorizontal', '#6B7280', 'expense', true, NULL);

-- =====================================================
-- Seed Default Exchange Rates
-- =====================================================

INSERT INTO public.currency_exchange_rates (base_currency, target_currency, rate) VALUES
('USD', 'MMK', 2100.00),
('USD', 'THB', 35.50),
('MMK', 'USD', 0.000476),
('MMK', 'THB', 0.0169),
('THB', 'USD', 0.0282),
('THB', 'MMK', 59.15);

-- =====================================================
-- Add FlowState Feature Flag
-- =====================================================

INSERT INTO public.feature_flags (
  feature_key, 
  feature_name, 
  feature_name_my, 
  description,
  description_my,
  icon, 
  category, 
  status, 
  is_enabled,
  show_in_nav
) VALUES (
  'flowstate', 
  'FlowState Tracker', 
  'FlowState ငွေစာရင်း',
  'Track your income, expenses, and subscriptions with beautiful visualizations',
  'သင့်ဝင်ငွေ၊ ကုန်ကျစရိတ်နှင့် subscription များကို လှပသော visualization များဖြင့် ခြေရာခံပါ',
  'Wallet', 
  'monetization', 
  'active', 
  true,
  true
);

-- =====================================================
-- Create updated_at trigger function if not exists
-- =====================================================

CREATE OR REPLACE FUNCTION public.update_flowstate_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- =====================================================
-- Add triggers for updated_at
-- =====================================================

CREATE TRIGGER update_financial_accounts_updated_at
  BEFORE UPDATE ON public.financial_accounts
  FOR EACH ROW EXECUTE FUNCTION public.update_flowstate_updated_at();

CREATE TRIGGER update_user_transactions_updated_at
  BEFORE UPDATE ON public.user_transactions
  FOR EACH ROW EXECUTE FUNCTION public.update_flowstate_updated_at();

CREATE TRIGGER update_user_subscriptions_updated_at
  BEFORE UPDATE ON public.user_subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.update_flowstate_updated_at();

CREATE TRIGGER update_flowstate_settings_updated_at
  BEFORE UPDATE ON public.flowstate_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_flowstate_updated_at();

-- =====================================================
-- Create indexes for performance
-- =====================================================

CREATE INDEX idx_financial_accounts_user_id ON public.financial_accounts(user_id);
CREATE INDEX idx_user_transactions_user_id ON public.user_transactions(user_id);
CREATE INDEX idx_user_transactions_date ON public.user_transactions(transaction_date);
CREATE INDEX idx_user_transactions_type ON public.user_transactions(type);
CREATE INDEX idx_user_subscriptions_user_id ON public.user_subscriptions(user_id);
CREATE INDEX idx_transaction_categories_type ON public.transaction_categories(type);
CREATE INDEX idx_transaction_categories_is_system ON public.transaction_categories(is_system);
