-- Add category column to ai_generated_content table for better organization
ALTER TABLE ai_generated_content 
ADD COLUMN IF NOT EXISTS category TEXT DEFAULT 'uncategorized';

-- Create index for faster category filtering
CREATE INDEX IF NOT EXISTS idx_ai_generated_content_category ON ai_generated_content(category);

-- Add comment for documentation
COMMENT ON COLUMN ai_generated_content.category IS 'Content category for organizing the library (e.g., blog, social, email, marketing)';