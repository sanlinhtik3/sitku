-- Drop triggers first
DROP TRIGGER IF EXISTS on_user_created_initialize_points ON auth.users;
DROP TRIGGER IF EXISTS on_point_order_status_change ON point_orders;

-- Rename tables from point to credit
ALTER TABLE user_points RENAME TO user_credits;
ALTER TABLE point_plans RENAME TO credit_plans;
ALTER TABLE point_orders RENAME TO credit_orders;
ALTER TABLE point_transactions RENAME TO credit_transactions;

-- Rename columns in user_credits
ALTER TABLE user_credits RENAME COLUMN trial_points_used TO trial_credits_used;

-- Rename columns in credit_plans
ALTER TABLE credit_plans RENAME COLUMN points TO credits;

-- Rename columns in credit_orders
ALTER TABLE credit_orders RENAME COLUMN points_purchased TO credits_purchased;

-- Rename column in credit_transactions table
ALTER TABLE credit_transactions RENAME COLUMN points TO credits;

-- Now drop old functions
DROP FUNCTION IF EXISTS deduct_generation_points(uuid, uuid);
DROP FUNCTION IF EXISTS initialize_user_points();
DROP FUNCTION IF EXISTS process_point_order_approval();

-- Create new function: deduct_generation_credits
CREATE OR REPLACE FUNCTION deduct_generation_credits(p_user_id uuid, p_content_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_balance INTEGER;
  v_new_balance INTEGER;
BEGIN
  SELECT balance INTO v_balance
  FROM public.user_credits
  WHERE user_id = p_user_id
  FOR UPDATE;
  
  IF v_balance < 1 THEN
    RETURN jsonb_build_object('success', false, 'error', 'insufficient_credits', 'balance', v_balance);
  END IF;
  
  UPDATE public.user_credits
  SET balance = balance - 1,
      total_spent = total_spent + 1,
      updated_at = NOW()
  WHERE user_id = p_user_id
  RETURNING balance INTO v_new_balance;
  
  INSERT INTO public.credit_transactions (user_id, credits, transaction_type, reference_id, reference_type, balance_after, description)
  VALUES (p_user_id, -1, 'usage', p_content_id, 'content_generation', v_new_balance, 'AI content generation');
  
  RETURN jsonb_build_object('success', true, 'new_balance', v_new_balance);
END;
$$;

-- Create new function: initialize_user_credits
CREATE OR REPLACE FUNCTION initialize_user_credits()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  INSERT INTO public.user_credits (user_id, balance, trial_credits_used)
  VALUES (NEW.id, 5, true);
  
  INSERT INTO public.credit_transactions (user_id, credits, transaction_type, balance_after, description)
  VALUES (NEW.id, 5, 'trial', 5, 'Welcome bonus - 5 free trial credits');
  
  RETURN NEW;
END;
$$;

-- Create new function: process_credit_order_approval
CREATE OR REPLACE FUNCTION process_credit_order_approval()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_new_balance INTEGER;
BEGIN
  IF NEW.status = 'completed' AND OLD.status != 'completed' THEN
    NEW.approved_at := NOW();
    
    UPDATE public.user_credits
    SET balance = balance + NEW.credits_purchased,
        total_earned = total_earned + NEW.credits_purchased,
        updated_at = NOW()
    WHERE user_id = NEW.user_id
    RETURNING balance INTO v_new_balance;
    
    INSERT INTO public.credit_transactions (user_id, credits, transaction_type, reference_id, reference_type, balance_after, description)
    VALUES (NEW.user_id, NEW.credits_purchased, 'purchase', NEW.id, 'order', v_new_balance, 'Credit purchase: ' || NEW.credits_purchased || ' credits');
    
    INSERT INTO public.notifications (user_id, type, title, message, related_id)
    VALUES (
      NEW.user_id,
      'credits_purchase_approved',
      'Credits Purchase Approved',
      'Your purchase of ' || NEW.credits_purchased || ' credits has been approved!',
      NEW.id
    );
  ELSIF NEW.status = 'rejected' AND OLD.status != 'rejected' THEN
    NEW.rejected_at := NOW();
    
    INSERT INTO public.notifications (user_id, type, title, message, related_id)
    VALUES (
      NEW.user_id,
      'credits_purchase_rejected',
      'Credits Purchase Rejected',
      'Your credit purchase has been rejected. Reason: ' || COALESCE(NEW.rejection_reason, 'Not specified'),
      NEW.id
    );
  END IF;
  
  RETURN NEW;
END;
$$;

-- Create new triggers
CREATE TRIGGER on_user_created_initialize_credits
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION initialize_user_credits();

CREATE TRIGGER on_credit_order_status_change
  BEFORE UPDATE ON credit_orders
  FOR EACH ROW
  EXECUTE FUNCTION process_credit_order_approval();