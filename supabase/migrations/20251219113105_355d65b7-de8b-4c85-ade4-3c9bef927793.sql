-- Create course-thumbnails bucket with 5MB limit
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('course-thumbnails', 'course-thumbnails', true, 5242880)
ON CONFLICT (id) DO NOTHING;

-- RLS Policy for authenticated uploads
CREATE POLICY "Allow authenticated uploads to course-thumbnails"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'course-thumbnails');

-- RLS Policy for authenticated updates
CREATE POLICY "Allow authenticated updates to course-thumbnails"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'course-thumbnails');

-- RLS Policy for authenticated deletes
CREATE POLICY "Allow authenticated deletes to course-thumbnails"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'course-thumbnails');

-- Allow public read access
CREATE POLICY "Allow public read on course-thumbnails"
ON storage.objects FOR SELECT TO public
USING (bucket_id = 'course-thumbnails');