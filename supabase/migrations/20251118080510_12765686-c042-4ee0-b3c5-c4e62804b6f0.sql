-- Drop the existing check constraint
ALTER TABLE credit_transactions 
DROP CONSTRAINT IF EXISTS point_transactions_transaction_type_check;

-- Add new check constraint that includes 'testing'
ALTER TABLE credit_transactions 
ADD CONSTRAINT point_transactions_transaction_type_check 
CHECK (transaction_type = ANY (ARRAY['trial'::text, 'purchase'::text, 'usage'::text, 'refund'::text, 'admin_adjustment'::text, 'testing'::text]));