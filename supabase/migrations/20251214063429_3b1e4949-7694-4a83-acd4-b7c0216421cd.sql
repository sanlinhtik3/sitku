-- Create storage bucket for post thumbnails
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'post-thumbnails', 
  'post-thumbnails', 
  true, 
  2097152,  -- 2MB limit
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
ON CONFLICT (id) DO NOTHING;

-- Allow authenticated users to upload thumbnails
CREATE POLICY "Authenticated users can upload thumbnails"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'post-thumbnails');

-- Allow authenticated users to update their thumbnails
CREATE POLICY "Authenticated users can update thumbnails"
ON storage.objects
FOR UPDATE
TO authenticated
USING (bucket_id = 'post-thumbnails');

-- Allow authenticated users to delete thumbnails
CREATE POLICY "Authenticated users can delete thumbnails"
ON storage.objects
FOR DELETE
TO authenticated
USING (bucket_id = 'post-thumbnails');

-- Allow public to view thumbnails
CREATE POLICY "Public can view thumbnails"
ON storage.objects
FOR SELECT
TO public
USING (bucket_id = 'post-thumbnails');