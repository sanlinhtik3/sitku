-- AgentConsultant CFO uses USDT as its only operating currency.
ALTER TABLE public.agentic_revenue
  ALTER COLUMN currency SET DEFAULT 'USDT';

ALTER TABLE public.agentic_expenses
  ALTER COLUMN currency SET DEFAULT 'USDT';

ALTER TABLE public.agentic_user_settings
  ALTER COLUMN default_currency SET DEFAULT 'USDT';

UPDATE public.agentic_user_settings
SET default_currency = 'USDT'
WHERE default_currency IS DISTINCT FROM 'USDT';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'agentic_revenue_currency_usdt_only'
  ) THEN
    ALTER TABLE public.agentic_revenue
      ADD CONSTRAINT agentic_revenue_currency_usdt_only
      CHECK (currency = 'USDT') NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'agentic_expenses_currency_usdt_only'
  ) THEN
    ALTER TABLE public.agentic_expenses
      ADD CONSTRAINT agentic_expenses_currency_usdt_only
      CHECK (currency = 'USDT') NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'agentic_settings_currency_usdt_only'
  ) THEN
    ALTER TABLE public.agentic_user_settings
      ADD CONSTRAINT agentic_settings_currency_usdt_only
      CHECK (default_currency = 'USDT') NOT VALID;
  END IF;
END $$;
