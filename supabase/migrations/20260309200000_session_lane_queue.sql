-- Phase 1.3: Session Lane Queue (pg_advisory_lock)
-- Creates an advisory lock function for session-level serialization

CREATE OR REPLACE FUNCTION acquire_session_lock(session_uuid uuid, timeout_ms integer DEFAULT 2000)
RETURNS boolean
LANGUAGE plpgsql
AS $$
DECLARE
    lock_id bigint;
    start_time timestamptz;
    acquired boolean := false;
BEGIN
    -- Hash uuid to bigint for advisory lock
    lock_id := ('x' || substr(md5(session_uuid::text), 1, 16))::bit(64)::bigint;
    
    start_time := clock_timestamp();
    
    -- Try to acquire lock within timeout
    LOOP
        acquired := pg_try_advisory_lock(lock_id);
        IF acquired THEN
            RETURN true;
        END IF;
        
        -- Check timeout
        IF extract(epoch from (clock_timestamp() - start_time)) * 1000 >= timeout_ms THEN
            RETURN false;
        END IF;
        
        -- Wait 50ms before retrying
        PERFORM pg_sleep(0.05);
    END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION release_session_lock(session_uuid uuid)
RETURNS boolean
LANGUAGE plpgsql
AS $$
DECLARE
    lock_id bigint;
BEGIN
    lock_id := ('x' || substr(md5(session_uuid::text), 1, 16))::bit(64)::bigint;
    RETURN pg_advisory_unlock(lock_id);
END;
$$;
