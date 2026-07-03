-- Create workspaces table for team/project organization
CREATE TABLE public.workspaces (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  creator_id UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  is_active BOOLEAN DEFAULT true,
  total_points INTEGER DEFAULT 0,
  CONSTRAINT workspaces_name_check CHECK (char_length(name) >= 3 AND char_length(name) <= 100)
);

-- Create workspace_members table for team membership
CREATE TABLE public.workspace_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('owner', 'member')),
  invited_by UUID,
  joined_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  personal_score INTEGER DEFAULT 0,
  UNIQUE(workspace_id, user_id)
);

-- Create workspace_tasks table for task management
CREATE TABLE public.workspace_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  points INTEGER NOT NULL DEFAULT 10,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_review', 'completed')),
  assignee_id UUID,
  created_by UUID NOT NULL,
  due_date TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  completed_at TIMESTAMP WITH TIME ZONE,
  CONSTRAINT workspace_tasks_points_check CHECK (points > 0 AND points <= 1000)
);

-- Create task_completions table for performance tracking
CREATE TABLE public.task_completions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES public.workspace_tasks(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  completed_by UUID NOT NULL,
  points_earned INTEGER NOT NULL,
  completed_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  week_number INTEGER NOT NULL,
  year INTEGER NOT NULL
);

-- Enable RLS
ALTER TABLE public.workspaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workspace_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workspace_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.task_completions ENABLE ROW LEVEL SECURITY;

-- RLS Policies for workspaces
CREATE POLICY "Admins can manage all workspaces"
ON public.workspaces FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Creators can create workspaces"
ON public.workspaces FOR INSERT
WITH CHECK (auth.uid() = creator_id AND has_role(auth.uid(), 'creator'::app_role));

CREATE POLICY "Workspace owners can update their workspaces"
ON public.workspaces FOR UPDATE
USING (EXISTS (
  SELECT 1 FROM public.workspace_members
  WHERE workspace_id = workspaces.id
    AND user_id = auth.uid()
    AND role = 'owner'
));

CREATE POLICY "Workspace members can view their workspaces"
ON public.workspaces FOR SELECT
USING (EXISTS (
  SELECT 1 FROM public.workspace_members
  WHERE workspace_id = workspaces.id
    AND user_id = auth.uid()
));

-- RLS Policies for workspace_members
CREATE POLICY "Admins can manage all memberships"
ON public.workspace_members FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Workspace owners can manage members"
ON public.workspace_members FOR ALL
USING (EXISTS (
  SELECT 1 FROM public.workspace_members wm
  WHERE wm.workspace_id = workspace_members.workspace_id
    AND wm.user_id = auth.uid()
    AND wm.role = 'owner'
));

CREATE POLICY "Members can view workspace members"
ON public.workspace_members FOR SELECT
USING (EXISTS (
  SELECT 1 FROM public.workspace_members wm
  WHERE wm.workspace_id = workspace_members.workspace_id
    AND wm.user_id = auth.uid()
));

-- RLS Policies for workspace_tasks
CREATE POLICY "Admins can manage all tasks"
ON public.workspace_tasks FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Workspace owners can manage all tasks"
ON public.workspace_tasks FOR ALL
USING (EXISTS (
  SELECT 1 FROM public.workspace_members
  WHERE workspace_id = workspace_tasks.workspace_id
    AND user_id = auth.uid()
    AND role = 'owner'
));

CREATE POLICY "Members can view workspace tasks"
ON public.workspace_tasks FOR SELECT
USING (EXISTS (
  SELECT 1 FROM public.workspace_members
  WHERE workspace_id = workspace_tasks.workspace_id
    AND user_id = auth.uid()
));

CREATE POLICY "Members can create tasks"
ON public.workspace_tasks FOR INSERT
WITH CHECK (
  auth.uid() = created_by AND
  EXISTS (
    SELECT 1 FROM public.workspace_members
    WHERE workspace_id = workspace_tasks.workspace_id
      AND user_id = auth.uid()
  )
);

CREATE POLICY "Members can update their assigned tasks"
ON public.workspace_tasks FOR UPDATE
USING (
  auth.uid() = assignee_id OR
  EXISTS (
    SELECT 1 FROM public.workspace_members
    WHERE workspace_id = workspace_tasks.workspace_id
      AND user_id = auth.uid()
      AND role = 'owner'
  )
);

-- RLS Policies for task_completions
CREATE POLICY "Admins can view all completions"
ON public.task_completions FOR SELECT
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Workspace members can view completions"
ON public.task_completions FOR SELECT
USING (EXISTS (
  SELECT 1 FROM public.workspace_members
  WHERE workspace_id = task_completions.workspace_id
    AND user_id = auth.uid()
));

CREATE POLICY "System can insert completions"
ON public.task_completions FOR INSERT
WITH CHECK (auth.uid() = completed_by);

-- Function to handle task completion
CREATE OR REPLACE FUNCTION public.complete_workspace_task(p_task_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_task RECORD;
  v_week_number INTEGER;
  v_year INTEGER;
BEGIN
  -- Get task details
  SELECT * INTO v_task FROM public.workspace_tasks WHERE id = p_task_id;
  
  IF v_task IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Task not found');
  END IF;
  
  IF v_task.status = 'completed' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Task already completed');
  END IF;
  
  -- Calculate week number
  v_week_number := EXTRACT(WEEK FROM NOW());
  v_year := EXTRACT(YEAR FROM NOW());
  
  -- Update task status
  UPDATE public.workspace_tasks
  SET status = 'completed',
      completed_at = NOW(),
      updated_at = NOW()
  WHERE id = p_task_id;
  
  -- Log completion
  INSERT INTO public.task_completions (
    task_id, workspace_id, completed_by, points_earned, week_number, year
  ) VALUES (
    p_task_id, v_task.workspace_id, auth.uid(), v_task.points, v_week_number, v_year
  );
  
  -- Update member score
  UPDATE public.workspace_members
  SET personal_score = personal_score + v_task.points
  WHERE workspace_id = v_task.workspace_id
    AND user_id = auth.uid();
  
  -- Update workspace total
  UPDATE public.workspaces
  SET total_points = total_points + v_task.points,
      updated_at = NOW()
  WHERE id = v_task.workspace_id;
  
  RETURN jsonb_build_object(
    'success', true,
    'points_earned', v_task.points
  );
END;
$$;

-- Trigger to update workspace updated_at
CREATE OR REPLACE FUNCTION public.update_workspace_timestamp()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE TRIGGER workspace_updated_at
BEFORE UPDATE ON public.workspaces
FOR EACH ROW
EXECUTE FUNCTION public.update_workspace_timestamp();

CREATE TRIGGER workspace_tasks_updated_at
BEFORE UPDATE ON public.workspace_tasks
FOR EACH ROW
EXECUTE FUNCTION public.update_workspace_timestamp();

-- Enable realtime for all tables
ALTER PUBLICATION supabase_realtime ADD TABLE public.workspaces;
ALTER PUBLICATION supabase_realtime ADD TABLE public.workspace_members;
ALTER PUBLICATION supabase_realtime ADD TABLE public.workspace_tasks;
ALTER PUBLICATION supabase_realtime ADD TABLE public.task_completions;