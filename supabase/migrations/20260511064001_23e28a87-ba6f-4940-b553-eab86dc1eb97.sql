CREATE TABLE public.agentic_expenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  channel_id uuid REFERENCES public.agentic_channels(id) ON DELETE SET NULL,
  occurred_at date NOT NULL DEFAULT (now() AT TIME ZONE 'Asia/Yangon')::date,
  category text NOT NULL,
  amount numeric(14,2) NOT NULL CHECK (amount >= 0),
  currency text NOT NULL DEFAULT 'MMK',
  description text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_agentic_exp_user_date ON public.agentic_expenses(user_id, occurred_at DESC);
ALTER TABLE public.agentic_expenses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "agentic_exp_owner" ON public.agentic_expenses
  FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP TRIGGER IF EXISTS trg_agentic_exp_touch ON public.agentic_expenses;
CREATE TRIGGER trg_agentic_exp_touch BEFORE UPDATE ON public.agentic_expenses
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();