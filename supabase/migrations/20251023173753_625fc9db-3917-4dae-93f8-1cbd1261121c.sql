-- Add ban fields to profiles table
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_banned BOOLEAN DEFAULT FALSE;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS banned_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS banned_by UUID REFERENCES auth.users(id);

-- Create notifications table
CREATE TABLE IF NOT EXISTS public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  related_id UUID,
  is_read BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS on notifications
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- Users can view their own notifications
CREATE POLICY "Users can view own notifications" ON public.notifications
  FOR SELECT USING (auth.uid() = user_id);

-- Admins can create notifications
CREATE POLICY "Admins can create notifications" ON public.notifications
  FOR INSERT WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Users can update their own notifications (mark as read)
CREATE POLICY "Users can update own notifications" ON public.notifications
  FOR UPDATE USING (auth.uid() = user_id);

-- Admins can view all notifications
CREATE POLICY "Admins can view all notifications" ON public.notifications
  FOR SELECT USING (public.has_role(auth.uid(), 'admin'));

-- Create function to notify admin of new enrollment
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
BEGIN
  SELECT title INTO course_title FROM public.courses WHERE id = NEW.course_id;
  SELECT full_name INTO user_name FROM public.profiles WHERE user_id = NEW.user_id;
  
  FOR admin_id IN 
    SELECT user_id FROM public.user_roles WHERE role = 'admin'
  LOOP
    INSERT INTO public.notifications (user_id, type, title, message, related_id)
    VALUES (
      admin_id,
      'enrollment_request',
      'New Enrollment Request',
      COALESCE(user_name, 'A user') || ' has requested to enroll in "' || course_title || '"',
      NEW.id
    );
  END LOOP;
  
  RETURN NEW;
END;
$$;

-- Create trigger for enrollment notifications
DROP TRIGGER IF EXISTS on_enrollment_created ON public.enrollments;
CREATE TRIGGER on_enrollment_created
  AFTER INSERT ON public.enrollments
  FOR EACH ROW
  WHEN (NEW.status = 'pending')
  EXECUTE FUNCTION public.notify_admin_enrollment();

-- Create function to notify user of enrollment approval
CREATE OR REPLACE FUNCTION public.notify_user_enrollment_approved()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  course_title TEXT;
BEGIN
  IF NEW.status = 'approved' AND OLD.status != 'approved' THEN
    SELECT title INTO course_title FROM public.courses WHERE id = NEW.course_id;
    
    INSERT INTO public.notifications (user_id, type, title, message, related_id)
    VALUES (
      NEW.user_id,
      'enrollment_approved',
      'Enrollment Approved!',
      'Your enrollment in "' || course_title || '" has been approved. Learn now!',
      NEW.course_id
    );
  END IF;
  
  RETURN NEW;
END;
$$;

-- Create trigger for approval notifications
DROP TRIGGER IF EXISTS on_enrollment_approved ON public.enrollments;
CREATE TRIGGER on_enrollment_approved
  AFTER UPDATE ON public.enrollments
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_user_enrollment_approved();

-- Enable realtime for notifications
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;