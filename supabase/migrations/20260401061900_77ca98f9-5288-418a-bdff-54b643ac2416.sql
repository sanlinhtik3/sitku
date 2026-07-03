
CREATE TABLE public.agent_eval_tests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category TEXT NOT NULL DEFAULT 'general',
  input_message TEXT NOT NULL,
  expected_tools TEXT[] DEFAULT '{}',
  quality_keywords TEXT[] DEFAULT '{}',
  min_quality_score FLOAT DEFAULT 0.7,
  complexity_tier TEXT DEFAULT 'moderate',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

ALTER TABLE public.agent_eval_tests ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.agent_eval_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  test_id UUID REFERENCES public.agent_eval_tests(id) ON DELETE CASCADE NOT NULL,
  model_used TEXT NOT NULL,
  reasoning_effort TEXT,
  passed BOOLEAN NOT NULL DEFAULT false,
  quality_score FLOAT,
  tools_called TEXT[] DEFAULT '{}',
  response_snippet TEXT,
  latency_ms INTEGER,
  tokens_used INTEGER,
  run_id UUID NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.agent_eval_results ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage eval tests" ON public.agent_eval_tests
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can manage eval results" ON public.agent_eval_results
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
