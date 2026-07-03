-- Add foreign key relationship between ai_generated_content and profiles
ALTER TABLE public.ai_generated_content
ADD CONSTRAINT ai_generated_content_user_id_fkey
FOREIGN KEY (user_id)
REFERENCES public.profiles(user_id)
ON DELETE CASCADE;