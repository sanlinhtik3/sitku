-- Enable realtime for user_credits table
ALTER TABLE public.user_credits REPLICA IDENTITY FULL;

-- Add user_credits to realtime publication
ALTER PUBLICATION supabase_realtime ADD TABLE public.user_credits;