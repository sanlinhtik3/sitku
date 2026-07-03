
-- Create system_error_logs table for centralized error tracking
CREATE TABLE public.system_error_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  error_source TEXT NOT NULL,
  error_message TEXT NOT NULL,
  error_stack TEXT,
  severity TEXT NOT NULL DEFAULT 'error' CHECK (severity IN ('info', 'warning', 'error', 'critical')),
  user_id UUID,
  context JSONB DEFAULT '{}',
  resolved BOOLEAN NOT NULL DEFAULT false,
  resolved_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create doctor_reports table for AI diagnostic reports
CREATE TABLE public.doctor_reports (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  trigger_type TEXT NOT NULL DEFAULT 'scheduled' CHECK (trigger_type IN ('scheduled', 'manual', 'threshold')),
  error_count INTEGER NOT NULL DEFAULT 0,
  diagnosis JSONB NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'pending_review' CHECK (status IN ('pending_review', 'applied', 'dismissed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS on both tables
ALTER TABLE public.system_error_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.doctor_reports ENABLE ROW LEVEL SECURITY;

-- Admin-only read access for system_error_logs
CREATE POLICY "Admins can read error logs"
ON public.system_error_logs
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_roles.user_id = auth.uid()
    AND user_roles.role = 'admin'
  )
);

-- Admin-only full access for doctor_reports
CREATE POLICY "Admins can read doctor reports"
ON public.doctor_reports
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_roles.user_id = auth.uid()
    AND user_roles.role = 'admin'
  )
);

CREATE POLICY "Admins can update doctor reports"
ON public.doctor_reports
FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_roles.user_id = auth.uid()
    AND user_roles.role = 'admin'
  )
);

-- Indexes for performance
CREATE INDEX idx_system_error_logs_created_at ON public.system_error_logs (created_at DESC);
CREATE INDEX idx_system_error_logs_severity ON public.system_error_logs (severity);
CREATE INDEX idx_system_error_logs_resolved ON public.system_error_logs (resolved);
CREATE INDEX idx_system_error_logs_source ON public.system_error_logs (error_source);
CREATE INDEX idx_doctor_reports_created_at ON public.doctor_reports (created_at DESC);
CREATE INDEX idx_doctor_reports_status ON public.doctor_reports (status);

-- Enable realtime on system_error_logs
ALTER PUBLICATION supabase_realtime ADD TABLE public.system_error_logs;
