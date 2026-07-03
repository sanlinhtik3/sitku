-- Update constraint to include learning_streak
ALTER TABLE public.achievements DROP CONSTRAINT IF EXISTS achievements_requirement_type_check;

ALTER TABLE public.achievements ADD CONSTRAINT achievements_requirement_type_check 
  CHECK (requirement_type IN ('first_lesson', 'course_completion', 'multiple_courses', 'learning_streak'));

-- Create user_statistics table for leaderboard data
CREATE TABLE IF NOT EXISTS public.user_statistics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  completed_courses_count INTEGER DEFAULT 0,
  achievements_count INTEGER DEFAULT 0,
  current_streak INTEGER DEFAULT 0,
  longest_streak INTEGER DEFAULT 0,
  last_activity_date DATE,
  total_lessons_completed INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id)
);

-- Create learning_streaks table
CREATE TABLE IF NOT EXISTS public.learning_streaks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  streak_date DATE NOT NULL,
  activity_count INTEGER DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, streak_date)
);

-- Enable RLS
ALTER TABLE public.user_statistics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.learning_streaks ENABLE ROW LEVEL SECURITY;

-- RLS Policies for user_statistics
CREATE POLICY "Anyone can view user statistics"
  ON public.user_statistics FOR SELECT
  USING (true);

CREATE POLICY "System can insert statistics"
  ON public.user_statistics FOR INSERT
  WITH CHECK (true);

CREATE POLICY "System can update statistics"
  ON public.user_statistics FOR UPDATE
  USING (true);

-- RLS Policies for learning_streaks
CREATE POLICY "Users can view their own streaks"
  ON public.learning_streaks FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all streaks"
  ON public.learning_streaks FOR SELECT
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "System can insert streaks"
  ON public.learning_streaks FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Add streak achievements using learning_streak type
INSERT INTO public.achievements (name, description, icon, requirement_type, requirement_value)
VALUES 
  ('Week Warrior', 'Maintain a 7-day learning streak', '🔥', 'learning_streak', 7),
  ('Month Master', 'Maintain a 30-day learning streak', '🚀', 'learning_streak', 30),
  ('Century Champion', 'Maintain a 100-day learning streak', '👑', 'learning_streak', 100)
ON CONFLICT DO NOTHING;

-- Function to update user statistics
CREATE OR REPLACE FUNCTION public.update_user_statistics()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.user_statistics (
    user_id,
    completed_courses_count,
    achievements_count,
    total_lessons_completed
  )
  SELECT 
    NEW.user_id,
    (SELECT COUNT(DISTINCT course_id) FROM public.certificates WHERE user_id = NEW.user_id),
    (SELECT COUNT(*) FROM public.user_achievements WHERE user_id = NEW.user_id),
    (SELECT COUNT(*) FROM public.user_lesson_progress WHERE user_id = NEW.user_id AND completed = true)
  ON CONFLICT (user_id)
  DO UPDATE SET
    completed_courses_count = EXCLUDED.completed_courses_count,
    achievements_count = EXCLUDED.achievements_count,
    total_lessons_completed = EXCLUDED.total_lessons_completed,
    updated_at = now();
    
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Triggers for user statistics
DROP TRIGGER IF EXISTS update_stats_on_certificate ON public.certificates;
CREATE TRIGGER update_stats_on_certificate
  AFTER INSERT ON public.certificates
  FOR EACH ROW
  EXECUTE FUNCTION public.update_user_statistics();

DROP TRIGGER IF EXISTS update_stats_on_achievement ON public.user_achievements;
CREATE TRIGGER update_stats_on_achievement
  AFTER INSERT ON public.user_achievements
  FOR EACH ROW
  EXECUTE FUNCTION public.update_user_statistics();

DROP TRIGGER IF EXISTS update_stats_on_lesson_complete ON public.user_lesson_progress;
CREATE TRIGGER update_stats_on_lesson_complete
  AFTER UPDATE ON public.user_lesson_progress
  FOR EACH ROW
  WHEN (NEW.completed = true AND OLD.completed = false)
  EXECUTE FUNCTION public.update_user_statistics();

-- Function to check and award streak achievements
CREATE OR REPLACE FUNCTION public.check_streak_achievements()
RETURNS TRIGGER AS $$
DECLARE
  streak_achievement_id UUID;
BEGIN
  FOR streak_achievement_id IN 
    SELECT id FROM public.achievements 
    WHERE requirement_type = 'learning_streak' 
      AND requirement_value <= (
        SELECT current_streak FROM public.user_statistics WHERE user_id = NEW.user_id
      )
  LOOP
    INSERT INTO public.user_achievements (user_id, achievement_id)
    VALUES (NEW.user_id, streak_achievement_id)
    ON CONFLICT (user_id, achievement_id) DO NOTHING;
  END LOOP;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Trigger for streak achievements
DROP TRIGGER IF EXISTS award_streak_achievements ON public.user_statistics;
CREATE TRIGGER award_streak_achievements
  AFTER UPDATE ON public.user_statistics
  FOR EACH ROW
  WHEN (NEW.current_streak > OLD.current_streak)
  EXECUTE FUNCTION public.check_streak_achievements();