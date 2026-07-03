-- Create storage policies for payment receipts bucket
-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Users can upload payment receipts" ON storage.objects;
DROP POLICY IF EXISTS "Users can view their payment receipts" ON storage.objects;
DROP POLICY IF EXISTS "Public can view payment receipts" ON storage.objects;

-- Allow authenticated users to upload receipts to their own folder
CREATE POLICY "Users can upload payment receipts"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'payment-receipts' AND
  auth.uid()::text = (string_to_array(name, '/'))[1]
);

-- Allow users to view their own receipts
CREATE POLICY "Users can view their payment receipts"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'payment-receipts' AND
  (auth.uid()::text = (string_to_array(name, '/'))[1] OR
   EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'admin'))
);

-- Allow public access since bucket is public
CREATE POLICY "Public can view payment receipts"
ON storage.objects
FOR SELECT
TO public
USING (bucket_id = 'payment-receipts');