-- Enable realtime for auth_settings table
ALTER TABLE public.auth_settings REPLICA IDENTITY FULL;

-- Add table to realtime publication
ALTER PUBLICATION supabase_realtime ADD TABLE public.auth_settings;