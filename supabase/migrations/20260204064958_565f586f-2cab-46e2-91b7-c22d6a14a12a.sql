-- ===================================
-- User Feedback System Tables
-- ===================================

-- Main feedback table
CREATE TABLE public.user_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  feedback_type TEXT NOT NULL CHECK (feedback_type IN ('bug', 'feature_request', 'error', 'feedback', 'complaint', 'praise')),
  severity TEXT DEFAULT 'medium' CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  page_url TEXT,
  browser_info JSONB,
  error_details JSONB,
  attachments JSONB,
  ai_analysis JSONB,
  ai_suggested_fix JSONB,
  ai_confidence NUMERIC(3,2),
  ai_processed_at TIMESTAMPTZ,
  status TEXT DEFAULT 'open' CHECK (status IN ('open', 'in_review', 'ai_processing', 'awaiting_admin', 'resolved', 'wont_fix', 'duplicate')),
  resolution_notes TEXT,
  resolved_at TIMESTAMPTZ,
  resolved_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Admin-BeeBot discussion threads
CREATE TABLE public.feedback_discussions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  feedback_id UUID NOT NULL REFERENCES public.user_feedback(id) ON DELETE CASCADE,
  author_type TEXT NOT NULL CHECK (author_type IN ('admin', 'beebot', 'system')),
  author_id UUID,
  content TEXT NOT NULL,
  attachments JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- AI-generated insights from feedback patterns
CREATE TABLE public.feedback_insights (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  insight_type TEXT NOT NULL CHECK (insight_type IN ('pattern', 'trend', 'recommendation', 'alert')),
  category TEXT,
  insight_data JSONB NOT NULL,
  affected_feedbacks UUID[],
  priority TEXT DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'critical')),
  is_actioned BOOLEAN DEFAULT FALSE,
  actioned_by UUID REFERENCES auth.users(id),
  actioned_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for better query performance
CREATE INDEX idx_user_feedback_user_id ON public.user_feedback(user_id);
CREATE INDEX idx_user_feedback_status ON public.user_feedback(status);
CREATE INDEX idx_user_feedback_type ON public.user_feedback(feedback_type);
CREATE INDEX idx_user_feedback_severity ON public.user_feedback(severity);
CREATE INDEX idx_user_feedback_created_at ON public.user_feedback(created_at DESC);
CREATE INDEX idx_feedback_discussions_feedback_id ON public.feedback_discussions(feedback_id);
CREATE INDEX idx_feedback_insights_type ON public.feedback_insights(insight_type);
CREATE INDEX idx_feedback_insights_priority ON public.feedback_insights(priority);

-- Enable RLS
ALTER TABLE public.user_feedback ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.feedback_discussions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.feedback_insights ENABLE ROW LEVEL SECURITY;

-- RLS Policies for user_feedback
CREATE POLICY "Users can view own feedback" ON public.user_feedback
  FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE POLICY "Users can create feedback" ON public.user_feedback
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

CREATE POLICY "Admins full access feedback" ON public.user_feedback
  FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- RLS Policies for feedback_discussions
CREATE POLICY "Users can view discussions on own feedback" ON public.feedback_discussions
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM public.user_feedback WHERE id = feedback_id AND user_id = auth.uid())
  );

CREATE POLICY "Admins full access discussions" ON public.feedback_discussions
  FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- RLS Policies for feedback_insights
CREATE POLICY "Admins full access insights" ON public.feedback_insights
  FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- Enable realtime for feedback tables
ALTER PUBLICATION supabase_realtime ADD TABLE public.user_feedback;
ALTER PUBLICATION supabase_realtime ADD TABLE public.feedback_discussions;

-- Update trigger for user_feedback
CREATE TRIGGER update_user_feedback_updated_at
  BEFORE UPDATE ON public.user_feedback
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();