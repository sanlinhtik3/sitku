-- Add lesson_type and section columns to lessons table
ALTER TABLE public.lessons 
  ADD COLUMN IF NOT EXISTS lesson_type TEXT DEFAULT 'video' CHECK (lesson_type IN ('video', 'quiz', 'homework')),
  ADD COLUMN IF NOT EXISTS section TEXT DEFAULT 'Introduction';

-- Create user_lesson_progress table for tracking completion
CREATE TABLE IF NOT EXISTS public.user_lesson_progress (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  lesson_id UUID NOT NULL REFERENCES public.lessons(id) ON DELETE CASCADE,
  completed BOOLEAN DEFAULT false,
  completed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE(user_id, lesson_id)
);

-- Enable RLS on user_lesson_progress
ALTER TABLE public.user_lesson_progress ENABLE ROW LEVEL SECURITY;

-- RLS Policies for user_lesson_progress
CREATE POLICY "Users can view own progress"
  ON public.user_lesson_progress
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own progress"
  ON public.user_lesson_progress
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own progress"
  ON public.user_lesson_progress
  FOR UPDATE
  USING (auth.uid() = user_id);

-- Admins can view all progress
CREATE POLICY "Admins can view all progress"
  ON public.user_lesson_progress
  FOR SELECT
  USING (has_role(auth.uid(), 'admin'::app_role));