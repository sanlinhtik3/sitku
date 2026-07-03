-- Add foreign key constraints for proper relationships
ALTER TABLE public.admin_audit_logs
ADD CONSTRAINT admin_audit_logs_admin_user_id_fkey
FOREIGN KEY (admin_user_id) REFERENCES public.profiles(user_id) ON DELETE CASCADE;

ALTER TABLE public.user_sessions
ADD CONSTRAINT user_sessions_user_id_fkey
FOREIGN KEY (user_id) REFERENCES public.profiles(user_id) ON DELETE CASCADE;