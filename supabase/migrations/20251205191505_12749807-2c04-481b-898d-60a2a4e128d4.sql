-- Add email and invite_code columns to profiles
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS email text UNIQUE,
ADD COLUMN IF NOT EXISTS invite_code text UNIQUE;

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_profiles_email ON public.profiles(email);
CREATE INDEX IF NOT EXISTS idx_profiles_invite_code ON public.profiles(invite_code);

-- Generate invite codes for existing users
UPDATE public.profiles 
SET invite_code = UPPER(SUBSTRING(MD5(user_id::text || NOW()::text) FROM 1 FOR 8))
WHERE invite_code IS NULL;

-- Update handle_new_user function to sync email and generate invite code
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = 'public'
AS $$
BEGIN
  INSERT INTO public.profiles (user_id, full_name, email, invite_code)
  VALUES (
    NEW.id, 
    NEW.raw_user_meta_data->>'full_name',
    NEW.email,
    UPPER(SUBSTRING(MD5(NEW.id::text || NOW()::text) FROM 1 FOR 8))
  );
  
  -- Default role is learner
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'learner');
  
  RETURN NEW;
END;
$$;