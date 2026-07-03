UPDATE storage.buckets 
SET 
  allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf'],
  file_size_limit = 10485760
WHERE id = 'agent-chat-images';