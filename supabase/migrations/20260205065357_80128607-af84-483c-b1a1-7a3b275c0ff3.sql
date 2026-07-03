-- Fix Payment Methods Delete: ON DELETE SET NULL for all FK constraints

-- 1. pro_subscriptions FK
ALTER TABLE pro_subscriptions 
  DROP CONSTRAINT IF EXISTS pro_subscriptions_payment_method_id_fkey;
  
ALTER TABLE pro_subscriptions
  ADD CONSTRAINT pro_subscriptions_payment_method_id_fkey
  FOREIGN KEY (payment_method_id) 
  REFERENCES payment_methods(id) 
  ON DELETE SET NULL;

-- 2. enrollments FK  
ALTER TABLE enrollments
  DROP CONSTRAINT IF EXISTS enrollments_payment_method_id_fkey;

ALTER TABLE enrollments
  ADD CONSTRAINT enrollments_payment_method_id_fkey
  FOREIGN KEY (payment_method_id)
  REFERENCES payment_methods(id)
  ON DELETE SET NULL;

-- 3. credit_orders FK (note: original constraint name was point_orders_payment_method_id_fkey)
ALTER TABLE credit_orders
  DROP CONSTRAINT IF EXISTS point_orders_payment_method_id_fkey;

ALTER TABLE credit_orders
  DROP CONSTRAINT IF EXISTS credit_orders_payment_method_id_fkey;

ALTER TABLE credit_orders
  ADD CONSTRAINT credit_orders_payment_method_id_fkey
  FOREIGN KEY (payment_method_id)
  REFERENCES payment_methods(id)
  ON DELETE SET NULL;