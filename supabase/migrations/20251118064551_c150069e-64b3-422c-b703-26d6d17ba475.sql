-- Create user_points table
CREATE TABLE IF NOT EXISTS public.user_points (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  balance INTEGER NOT NULL DEFAULT 5,
  trial_points_used BOOLEAN NOT NULL DEFAULT false,
  total_earned INTEGER NOT NULL DEFAULT 0,
  total_spent INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Create point_plans table
CREATE TABLE IF NOT EXISTS public.point_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  points INTEGER NOT NULL,
  price NUMERIC NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  display_order INTEGER NOT NULL DEFAULT 0,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Create point_orders table
CREATE TABLE IF NOT EXISTS public.point_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  plan_id UUID NOT NULL REFERENCES public.point_plans(id) ON DELETE CASCADE,
  points_purchased INTEGER NOT NULL,
  amount_paid NUMERIC NOT NULL,
  payment_method_id UUID REFERENCES public.payment_methods(id),
  payment_receipt_url TEXT,
  payment_notes TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'rejected')),
  submitted_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  approved_at TIMESTAMP WITH TIME ZONE,
  rejected_at TIMESTAMP WITH TIME ZONE,
  approved_by UUID REFERENCES auth.users(id),
  rejection_reason TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Create point_transactions table
CREATE TABLE IF NOT EXISTS public.point_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  points INTEGER NOT NULL,
  transaction_type TEXT NOT NULL CHECK (transaction_type IN ('trial', 'purchase', 'usage', 'refund', 'admin_adjustment')),
  reference_id UUID,
  reference_type TEXT,
  description TEXT,
  balance_after INTEGER NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.user_points ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.point_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.point_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.point_transactions ENABLE ROW LEVEL SECURITY;

-- RLS Policies for user_points
CREATE POLICY "Users can view their own points"
  ON public.user_points FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all points"
  ON public.user_points FOR SELECT
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "System can insert points"
  ON public.user_points FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "System can update points"
  ON public.user_points FOR UPDATE
  USING (true);

-- RLS Policies for point_plans
CREATE POLICY "Anyone can view active plans"
  ON public.point_plans FOR SELECT
  USING (is_active = true OR has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can manage plans"
  ON public.point_plans FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role));

-- RLS Policies for point_orders
CREATE POLICY "Users can view their own orders"
  ON public.point_orders FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all orders"
  ON public.point_orders FOR SELECT
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Users can insert their own orders"
  ON public.point_orders FOR INSERT
  WITH CHECK (auth.uid() = user_id AND status = 'pending');

CREATE POLICY "Admins can update orders"
  ON public.point_orders FOR UPDATE
  USING (has_role(auth.uid(), 'admin'::app_role));

-- RLS Policies for point_transactions
CREATE POLICY "Users can view their own transactions"
  ON public.point_transactions FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all transactions"
  ON public.point_transactions FOR SELECT
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "System can insert transactions"
  ON public.point_transactions FOR INSERT
  WITH CHECK (true);

-- Function to initialize user points on signup
CREATE OR REPLACE FUNCTION public.initialize_user_points()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.user_points (user_id, balance, trial_points_used)
  VALUES (NEW.id, 5, true);
  
  INSERT INTO public.point_transactions (user_id, points, transaction_type, balance_after, description)
  VALUES (NEW.id, 5, 'trial', 5, 'Welcome bonus - 5 free trial points');
  
  RETURN NEW;
END;
$$;

-- Trigger to initialize points on user creation
CREATE TRIGGER on_user_created_initialize_points
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.initialize_user_points();

-- Function to deduct points for content generation
CREATE OR REPLACE FUNCTION public.deduct_generation_points(p_user_id UUID, p_content_id UUID DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_balance INTEGER;
  v_new_balance INTEGER;
BEGIN
  -- Get current balance with row lock
  SELECT balance INTO v_balance
  FROM public.user_points
  WHERE user_id = p_user_id
  FOR UPDATE;
  
  -- Check sufficient balance
  IF v_balance < 1 THEN
    RETURN jsonb_build_object('success', false, 'error', 'insufficient_points', 'balance', v_balance);
  END IF;
  
  -- Deduct point
  UPDATE public.user_points
  SET balance = balance - 1,
      total_spent = total_spent + 1,
      updated_at = NOW()
  WHERE user_id = p_user_id
  RETURNING balance INTO v_new_balance;
  
  -- Log transaction
  INSERT INTO public.point_transactions (user_id, points, transaction_type, reference_id, reference_type, balance_after, description)
  VALUES (p_user_id, -1, 'usage', p_content_id, 'content_generation', v_new_balance, 'AI content generation');
  
  RETURN jsonb_build_object('success', true, 'new_balance', v_new_balance);
END;
$$;

-- Function to process point order approval
CREATE OR REPLACE FUNCTION public.process_point_order_approval()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_new_balance INTEGER;
BEGIN
  -- Only process when status changes to 'completed'
  IF NEW.status = 'completed' AND OLD.status != 'completed' THEN
    -- Set approval timestamp
    NEW.approved_at := NOW();
    
    -- Add points to user balance
    UPDATE public.user_points
    SET balance = balance + NEW.points_purchased,
        total_earned = total_earned + NEW.points_purchased,
        updated_at = NOW()
    WHERE user_id = NEW.user_id
    RETURNING balance INTO v_new_balance;
    
    -- Log transaction
    INSERT INTO public.point_transactions (user_id, points, transaction_type, reference_id, reference_type, balance_after, description)
    VALUES (NEW.user_id, NEW.points_purchased, 'purchase', NEW.id, 'order', v_new_balance, 'Point purchase: ' || NEW.points_purchased || ' points');
    
    -- Create notification
    INSERT INTO public.notifications (user_id, type, title, message, related_id)
    VALUES (
      NEW.user_id,
      'points_purchase_approved',
      'Points Purchase Approved',
      'Your purchase of ' || NEW.points_purchased || ' points has been approved!',
      NEW.id
    );
  ELSIF NEW.status = 'rejected' AND OLD.status != 'rejected' THEN
    -- Set rejection timestamp
    NEW.rejected_at := NOW();
    
    -- Create notification
    INSERT INTO public.notifications (user_id, type, title, message, related_id)
    VALUES (
      NEW.user_id,
      'points_purchase_rejected',
      'Points Purchase Rejected',
      'Your point purchase has been rejected. Reason: ' || COALESCE(NEW.rejection_reason, 'Not specified'),
      NEW.id
    );
  END IF;
  
  RETURN NEW;
END;
$$;

-- Trigger for point order approval
CREATE TRIGGER on_point_order_status_change
  BEFORE UPDATE ON public.point_orders
  FOR EACH ROW
  WHEN (OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION public.process_point_order_approval();

-- Add updated_at trigger for all tables
CREATE TRIGGER update_user_points_updated_at
  BEFORE UPDATE ON public.user_points
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE TRIGGER update_point_plans_updated_at
  BEFORE UPDATE ON public.point_plans
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE TRIGGER update_point_orders_updated_at
  BEFORE UPDATE ON public.point_orders
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- Create default point plans
INSERT INTO public.point_plans (name, description, points, price, display_order) VALUES
  ('Pro Plan', 'Perfect for regular content creators', 1000, 29.99, 1),
  ('Creator Plan', 'Ideal for professional creators', 2000, 49.99, 2),
  ('Business Plan', 'Best value for power users', 5000, 99.99, 3)
ON CONFLICT DO NOTHING;