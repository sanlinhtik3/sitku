-- Disable auto-workspace creation on user signup
-- New users will start with 0 workspaces and create manually when needed
DROP TRIGGER IF EXISTS on_profile_created_create_workspace ON public.profiles;