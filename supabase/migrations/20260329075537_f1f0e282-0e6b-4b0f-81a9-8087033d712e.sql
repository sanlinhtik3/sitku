
-- Add bot_settings_id to broadcast_channels for deterministic bot binding
ALTER TABLE public.broadcast_channels
  ADD COLUMN IF NOT EXISTS bot_settings_id uuid REFERENCES public.bot_settings(id) ON DELETE SET NULL;

-- Unique constraint: one channel per user (no duplicate rows)
ALTER TABLE public.broadcast_channels
  DROP CONSTRAINT IF EXISTS broadcast_channels_user_channel_unique;
ALTER TABLE public.broadcast_channels
  ADD CONSTRAINT broadcast_channels_user_channel_unique UNIQUE (user_id, channel_id);

-- Index for fast lookup
CREATE INDEX IF NOT EXISTS idx_broadcast_channels_user_bot
  ON public.broadcast_channels (user_id, bot_settings_id);

-- Backfill: for users with exactly one tokened bot, bind all their channels
WITH single_bot_users AS (
  SELECT user_id, MIN(id::text)::uuid as bot_id
  FROM public.bot_settings
  WHERE telegram_bot_token IS NOT NULL
  GROUP BY user_id
  HAVING COUNT(*) = 1
)
UPDATE public.broadcast_channels bc
SET bot_settings_id = sbu.bot_id
FROM single_bot_users sbu
WHERE bc.user_id = sbu.user_id
  AND bc.bot_settings_id IS NULL;
