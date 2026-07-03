-- Add generation lock fields to prevent race conditions
ALTER TABLE public.cr_responses 
ADD COLUMN IF NOT EXISTS generation_lock_id UUID DEFAULT NULL,
ADD COLUMN IF NOT EXISTS generation_locked_at TIMESTAMPTZ DEFAULT NULL,
ADD COLUMN IF NOT EXISTS generation_lock_expires_at TIMESTAMPTZ DEFAULT NULL;

-- Create index for lock queries
CREATE INDEX IF NOT EXISTS idx_cr_responses_lock ON public.cr_responses(generation_lock_id, generation_lock_expires_at);

-- Function to acquire generation lock with automatic expiry
CREATE OR REPLACE FUNCTION public.acquire_generation_lock(
  p_response_id UUID,
  p_lock_id UUID,
  p_lock_duration_seconds INT DEFAULT 300
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_response RECORD;
BEGIN
  -- Try to acquire lock with SKIP LOCKED to prevent race conditions
  SELECT * INTO v_response
  FROM public.cr_responses
  WHERE id = p_response_id
  AND (
    generation_lock_id IS NULL 
    OR generation_lock_expires_at < NOW()
  )
  FOR UPDATE SKIP LOCKED;

  IF v_response IS NULL THEN
    -- Check if already locked by same lock_id (idempotency)
    SELECT * INTO v_response
    FROM public.cr_responses
    WHERE id = p_response_id
    AND generation_lock_id = p_lock_id;
    
    IF v_response IS NOT NULL THEN
      -- Same lock, extend it
      UPDATE public.cr_responses
      SET generation_lock_expires_at = NOW() + (p_lock_duration_seconds || ' seconds')::INTERVAL
      WHERE id = p_response_id;
      
      RETURN jsonb_build_object('success', true, 'action', 'extended');
    END IF;
    
    RETURN jsonb_build_object('success', false, 'error', 'locked_by_another_process');
  END IF;

  -- Acquire the lock
  UPDATE public.cr_responses
  SET 
    generation_lock_id = p_lock_id,
    generation_locked_at = NOW(),
    generation_lock_expires_at = NOW() + (p_lock_duration_seconds || ' seconds')::INTERVAL
  WHERE id = p_response_id;

  RETURN jsonb_build_object('success', true, 'action', 'acquired');
END;
$$;

-- Function to release generation lock
CREATE OR REPLACE FUNCTION public.release_generation_lock(
  p_response_id UUID,
  p_lock_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  UPDATE public.cr_responses
  SET 
    generation_lock_id = NULL,
    generation_locked_at = NULL,
    generation_lock_expires_at = NULL
  WHERE id = p_response_id
  AND generation_lock_id = p_lock_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'lock_not_owned');
  END IF;

  RETURN jsonb_build_object('success', true);
END;
$$;

-- Function to cleanup stale generations (processing status stuck for too long)
CREATE OR REPLACE FUNCTION public.cleanup_stale_generations()
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_count INT;
BEGIN
  -- Mark stuck processing responses as failed after 10 minutes
  UPDATE public.cr_responses
  SET 
    processing_status = 'failed',
    generation_lock_id = NULL,
    generation_locked_at = NULL,
    generation_lock_expires_at = NULL
  WHERE processing_status = 'processing'
  AND created_at < NOW() - INTERVAL '10 minutes';
  
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;