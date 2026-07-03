-- Make payment-receipts bucket public so receipt images can be displayed
-- This allows getPublicUrl() to work correctly for viewing receipts
-- RLS policies still control who can upload/delete files
UPDATE storage.buckets
SET public = true
WHERE id = 'payment-receipts';