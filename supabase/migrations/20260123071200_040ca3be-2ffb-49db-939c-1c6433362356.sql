-- Drop and recreate the check constraint to include "generating" status
ALTER TABLE srt_translations 
DROP CONSTRAINT IF EXISTS srt_translations_status_check;

ALTER TABLE srt_translations 
ADD CONSTRAINT srt_translations_status_check 
CHECK (status = ANY (ARRAY[
  'pending'::text, 
  'processing'::text, 
  'extracting'::text, 
  'transcribing'::text, 
  'translating'::text, 
  'generating'::text,
  'completed'::text, 
  'failed'::text
]));