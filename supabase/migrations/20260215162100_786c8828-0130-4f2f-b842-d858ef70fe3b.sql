
ALTER TABLE user_agent_settings 
  ADD COLUMN IF NOT EXISTS timezone TEXT DEFAULT 'Asia/Yangon',
  ADD COLUMN IF NOT EXISTS preferred_morning_hour INTEGER DEFAULT 7,
  ADD COLUMN IF NOT EXISTS preferred_review_day INTEGER DEFAULT 0;
