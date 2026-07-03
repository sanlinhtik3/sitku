ALTER TABLE public.bot_settings ADD COLUMN IF NOT EXISTS bot_type text NOT NULL DEFAULT 'telegram_widget';

UPDATE public.bot_settings SET bot_type = 'neural_link' WHERE name = 'BeeBot Neural Link';