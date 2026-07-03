-- Update RLS policy to allow users to view all their enrollments for transaction history
DROP POLICY IF EXISTS "Users can view own active enrollments" ON enrollments;

CREATE POLICY "Users can view own enrollments and history" 
ON enrollments 
FOR SELECT 
USING (
  auth.uid() = user_id
);