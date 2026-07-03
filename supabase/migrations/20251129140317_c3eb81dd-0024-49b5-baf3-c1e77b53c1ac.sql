-- Add columns for hybrid search tracking
ALTER TABLE ai_generated_content 
ADD COLUMN IF NOT EXISTS source_type TEXT DEFAULT 'internal',
ADD COLUMN IF NOT EXISTS web_search_used BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS search_metadata JSONB DEFAULT NULL;

-- Add index for source_type filtering
CREATE INDEX IF NOT EXISTS idx_ai_content_source_type ON ai_generated_content(source_type);

-- Add comment for documentation
COMMENT ON COLUMN ai_generated_content.source_type IS 'Tracks content source: internal, web, or hybrid';
COMMENT ON COLUMN ai_generated_content.web_search_used IS 'Whether web search was triggered during generation';
COMMENT ON COLUMN ai_generated_content.search_metadata IS 'Stores search queries and sources used';