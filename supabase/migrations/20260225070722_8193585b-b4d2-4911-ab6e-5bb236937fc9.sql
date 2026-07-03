ALTER TABLE bot_settings ADD COLUMN IF NOT EXISTS group_bot_active boolean DEFAULT true;
ALTER TABLE bot_settings ADD COLUMN IF NOT EXISTS group_bot_allow_dm boolean DEFAULT false;