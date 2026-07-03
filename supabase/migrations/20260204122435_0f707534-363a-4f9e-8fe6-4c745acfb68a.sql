-- Add response feedback columns to agent_chat_messages
ALTER TABLE agent_chat_messages 
ADD COLUMN IF NOT EXISTS response_rating TEXT CHECK (response_rating IN ('helpful', 'not_helpful', 'neutral')),
ADD COLUMN IF NOT EXISTS feedback_text TEXT,
ADD COLUMN IF NOT EXISTS feedback_at TIMESTAMPTZ;

-- Create index for feedback analysis
CREATE INDEX IF NOT EXISTS idx_chat_messages_rating ON agent_chat_messages(response_rating) 
WHERE response_rating IS NOT NULL;

-- Create aggregated feedback insights table for Super Agent analysis
CREATE TABLE IF NOT EXISTS agent_response_feedback_insights (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  time_period TEXT NOT NULL, -- 'daily', 'weekly', 'monthly'
  period_start TIMESTAMPTZ NOT NULL,
  helpful_count INTEGER DEFAULT 0,
  not_helpful_count INTEGER DEFAULT 0,
  total_rated INTEGER DEFAULT 0,
  satisfaction_rate DECIMAL(5,2),
  common_issues JSONB DEFAULT '[]',
  improvement_suggestions JSONB DEFAULT '[]',
  analyzed_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS on the insights table
ALTER TABLE agent_response_feedback_insights ENABLE ROW LEVEL SECURITY;

-- Admins can read insights
CREATE POLICY "Admins can read feedback insights" 
ON agent_response_feedback_insights 
FOR SELECT 
USING (EXISTS (
  SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'admin'
));

-- Function to rate a message (RPC)
CREATE OR REPLACE FUNCTION rate_agent_message(
  p_message_id UUID,
  p_user_id UUID,
  p_rating TEXT,
  p_feedback_text TEXT DEFAULT NULL
) RETURNS JSONB AS $$
DECLARE
  v_result JSONB;
BEGIN
  -- Validate rating
  IF p_rating NOT IN ('helpful', 'not_helpful', 'neutral') THEN
    RETURN jsonb_build_object('error', 'Invalid rating. Must be helpful, not_helpful, or neutral');
  END IF;

  -- Verify user owns this message session
  IF NOT EXISTS (
    SELECT 1 FROM agent_chat_messages 
    WHERE id = p_message_id 
    AND user_id = p_user_id 
    AND role = 'assistant'
  ) THEN
    RETURN jsonb_build_object('error', 'Message not found or not ratable');
  END IF;
  
  -- Update rating
  UPDATE agent_chat_messages 
  SET 
    response_rating = p_rating,
    feedback_text = p_feedback_text,
    feedback_at = NOW()
  WHERE id = p_message_id;
  
  RETURN jsonb_build_object('success', true, 'rating', p_rating, 'message_id', p_message_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;