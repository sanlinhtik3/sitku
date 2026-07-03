-- Add columns for public sharing feature
ALTER TABLE cr_responses ADD COLUMN IF NOT EXISTS share_uid text UNIQUE;
ALTER TABLE cr_responses ADD COLUMN IF NOT EXISTS is_public boolean DEFAULT false;
ALTER TABLE cr_responses ADD COLUMN IF NOT EXISTS shared_at timestamptz;

-- Create index for faster share lookups
CREATE INDEX IF NOT EXISTS idx_cr_responses_share_uid ON cr_responses(share_uid) WHERE share_uid IS NOT NULL;

-- RLS Policy for public access to shared responses
CREATE POLICY "Anyone can view public responses" 
ON cr_responses 
FOR SELECT 
USING (is_public = true AND share_uid IS NOT NULL);