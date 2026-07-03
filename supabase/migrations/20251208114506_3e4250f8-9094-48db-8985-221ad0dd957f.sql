-- Make payment-receipts bucket private
UPDATE storage.buckets 
SET public = false 
WHERE name = 'payment-receipts';

-- Remove the public viewing policy that allows unauthenticated access
DROP POLICY IF EXISTS "Public can view payment receipts" ON storage.objects;