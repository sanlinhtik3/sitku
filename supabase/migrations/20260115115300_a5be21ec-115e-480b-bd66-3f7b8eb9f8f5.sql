-- Create telegram_bot_subscriptions table
CREATE TABLE public.telegram_bot_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tier text NOT NULL DEFAULT 'free' CHECK (tier IN ('free', 'premium')),
  max_bots integer NOT NULL DEFAULT 1,
  expires_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  granted_by uuid REFERENCES auth.users(id),
  notes text,
  UNIQUE(user_id)
);

-- Enable RLS
ALTER TABLE public.telegram_bot_subscriptions ENABLE ROW LEVEL SECURITY;

-- RLS Policies for telegram_bot_subscriptions
CREATE POLICY "Users can view own subscription"
ON public.telegram_bot_subscriptions FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own subscription"
ON public.telegram_bot_subscriptions FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

-- Admin policies using user_roles table
CREATE POLICY "Admins can view all subscriptions"
ON public.telegram_bot_subscriptions FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles 
    WHERE user_roles.user_id = auth.uid() 
    AND user_roles.role = 'admin'
  )
);

CREATE POLICY "Admins can update any subscription"
ON public.telegram_bot_subscriptions FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles 
    WHERE user_roles.user_id = auth.uid() 
    AND user_roles.role = 'admin'
  )
);

CREATE POLICY "Admins can insert any subscription"
ON public.telegram_bot_subscriptions FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.user_roles 
    WHERE user_roles.user_id = auth.uid() 
    AND user_roles.role = 'admin'
  )
);

CREATE POLICY "Admins can delete any subscription"
ON public.telegram_bot_subscriptions FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles 
    WHERE user_roles.user_id = auth.uid() 
    AND user_roles.role = 'admin'
  )
);