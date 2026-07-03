-- Create payment_methods table
CREATE TABLE public.payment_methods (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  display_order INTEGER DEFAULT 0,
  qr_code_url TEXT,
  account_number TEXT,
  account_name TEXT,
  instructions TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id)
);

-- Enable RLS
ALTER TABLE public.payment_methods ENABLE ROW LEVEL SECURITY;

-- RLS Policies for payment_methods
CREATE POLICY "Anyone can view active payment methods"
ON public.payment_methods
FOR SELECT
USING (is_active = true);

CREATE POLICY "Admins can manage payment methods"
ON public.payment_methods
FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role));

-- Add payment columns to enrollments table
ALTER TABLE public.enrollments 
ADD COLUMN payment_method_id UUID REFERENCES public.payment_methods(id),
ADD COLUMN payment_receipt_url TEXT,
ADD COLUMN payment_notes TEXT,
ADD COLUMN payment_submitted_at TIMESTAMP WITH TIME ZONE;

-- Create storage bucket for payment receipts
INSERT INTO storage.buckets (id, name, public)
VALUES ('payment-receipts', 'payment-receipts', false);

-- RLS: Users can upload their own receipts
CREATE POLICY "Users can upload own receipts"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'payment-receipts' 
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- RLS: Users can view their own receipts
CREATE POLICY "Users can view own receipts"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'payment-receipts' 
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- RLS: Admins can view all receipts
CREATE POLICY "Admins can view all receipts"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'payment-receipts'
  AND has_role(auth.uid(), 'admin'::app_role)
);

-- Create storage bucket for QR codes (public)
INSERT INTO storage.buckets (id, name, public)
VALUES ('payment-qr-codes', 'payment-qr-codes', true);

-- RLS: Admins can manage QR codes
CREATE POLICY "Admins can manage QR codes"
ON storage.objects FOR ALL
USING (
  bucket_id = 'payment-qr-codes'
  AND has_role(auth.uid(), 'admin'::app_role)
);

-- RLS: Everyone can view QR codes
CREATE POLICY "Anyone can view QR codes"
ON storage.objects FOR SELECT
USING (bucket_id = 'payment-qr-codes');

-- Update notify_admin_enrollment function to include payment info
CREATE OR REPLACE FUNCTION public.notify_admin_enrollment()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  admin_id UUID;
  course_title TEXT;
  user_name TEXT;
  has_payment BOOLEAN;
BEGIN
  SELECT title INTO course_title FROM public.courses WHERE id = NEW.course_id;
  SELECT full_name INTO user_name FROM public.profiles WHERE user_id = NEW.user_id;
  has_payment := NEW.payment_receipt_url IS NOT NULL;
  
  FOR admin_id IN 
    SELECT user_id FROM public.user_roles WHERE role = 'admin'
  LOOP
    INSERT INTO public.notifications (user_id, type, title, message, related_id)
    VALUES (
      admin_id,
      'enrollment_request',
      'New Enrollment ' || (CASE WHEN has_payment THEN 'with Payment' ELSE 'Request' END),
      COALESCE(user_name, 'A user') || ' has requested to enroll in "' || course_title || '"' ||
      (CASE WHEN has_payment THEN ' and submitted payment proof' ELSE '' END),
      NEW.id
    );
  END LOOP;
  
  RETURN NEW;
END;
$$;

-- Add trigger for updated_at on payment_methods
CREATE TRIGGER update_payment_methods_updated_at
BEFORE UPDATE ON public.payment_methods
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at();