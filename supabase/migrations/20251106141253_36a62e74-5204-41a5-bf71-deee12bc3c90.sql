-- Create achievements table
CREATE TABLE IF NOT EXISTS public.achievements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  icon TEXT NOT NULL,
  requirement_type TEXT NOT NULL CHECK (requirement_type IN ('first_lesson', 'course_completion', 'learning_streak', 'multiple_courses')),
  requirement_value INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Create user_achievements table
CREATE TABLE IF NOT EXISTS public.user_achievements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  achievement_id UUID NOT NULL REFERENCES public.achievements(id) ON DELETE CASCADE,
  earned_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE(user_id, achievement_id)
);

-- Create certificates table
CREATE TABLE IF NOT EXISTS public.certificates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  course_id UUID NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  issued_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  certificate_data JSONB NOT NULL,
  UNIQUE(user_id, course_id)
);

-- Create expiry_notifications table
CREATE TABLE IF NOT EXISTS public.expiry_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  enrollment_id UUID NOT NULL REFERENCES public.enrollments(id) ON DELETE CASCADE,
  days_before INTEGER NOT NULL CHECK (days_before IN (7, 3, 1)),
  sent_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE(enrollment_id, days_before)
);

-- Enable RLS
ALTER TABLE public.achievements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_achievements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.certificates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expiry_notifications ENABLE ROW LEVEL SECURITY;

-- RLS Policies for achievements
CREATE POLICY "Anyone can view achievements"
  ON public.achievements FOR SELECT
  USING (true);

CREATE POLICY "Admins can manage achievements"
  ON public.achievements FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role));

-- RLS Policies for user_achievements
CREATE POLICY "Users can view their own achievements"
  ON public.user_achievements FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all achievements"
  ON public.user_achievements FOR SELECT
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "System can insert achievements"
  ON public.user_achievements FOR INSERT
  WITH CHECK (true);

-- RLS Policies for certificates
CREATE POLICY "Users can view their own certificates"
  ON public.certificates FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all certificates"
  ON public.certificates FOR SELECT
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "System can insert certificates"
  ON public.certificates FOR INSERT
  WITH CHECK (true);

-- RLS Policies for expiry_notifications
CREATE POLICY "Admins can view all notifications"
  ON public.expiry_notifications FOR SELECT
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "System can insert notifications"
  ON public.expiry_notifications FOR INSERT
  WITH CHECK (true);

-- Insert default achievements
INSERT INTO public.achievements (name, description, icon, requirement_type, requirement_value) VALUES
  ('First Step', 'Complete your first lesson', '🎯', 'first_lesson', 1),
  ('Course Master', 'Complete your first course', '🏆', 'course_completion', 1),
  ('Dedicated Learner', 'Maintain a 7-day learning streak', '🔥', 'learning_streak', 7),
  ('Knowledge Seeker', 'Complete 3 courses', '📚', 'multiple_courses', 3),
  ('Expert', 'Complete 10 courses', '⭐', 'multiple_courses', 10)
ON CONFLICT DO NOTHING;

-- Function to check and award achievements
CREATE OR REPLACE FUNCTION public.check_and_award_achievements()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  first_lesson_achievement_id UUID;
  course_completion_achievement_id UUID;
  completed_courses_count INTEGER;
BEGIN
  -- Award first lesson achievement
  IF NEW.completed = true AND OLD.completed = false THEN
    SELECT id INTO first_lesson_achievement_id
    FROM public.achievements
    WHERE requirement_type = 'first_lesson' LIMIT 1;
    
    IF first_lesson_achievement_id IS NOT NULL THEN
      INSERT INTO public.user_achievements (user_id, achievement_id)
      VALUES (NEW.user_id, first_lesson_achievement_id)
      ON CONFLICT (user_id, achievement_id) DO NOTHING;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Trigger for achievement checks
CREATE TRIGGER check_achievements_on_progress
  AFTER UPDATE ON public.user_lesson_progress
  FOR EACH ROW
  EXECUTE FUNCTION public.check_and_award_achievements();

-- Function to check course completion and award achievement + generate certificate
CREATE OR REPLACE FUNCTION public.check_course_completion()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  total_lessons INTEGER;
  completed_lessons INTEGER;
  course_completion_achievement_id UUID;
  completed_courses_count INTEGER;
  course_info RECORD;
BEGIN
  IF NEW.completed = true THEN
    -- Get total and completed lessons for the course
    SELECT COUNT(*) INTO total_lessons
    FROM public.lessons
    WHERE course_id = (SELECT course_id FROM public.lessons WHERE id = NEW.lesson_id)
      AND is_published = true;
    
    SELECT COUNT(*) INTO completed_lessons
    FROM public.user_lesson_progress ulp
    JOIN public.lessons l ON ulp.lesson_id = l.id
    WHERE ulp.user_id = NEW.user_id
      AND l.course_id = (SELECT course_id FROM public.lessons WHERE id = NEW.lesson_id)
      AND ulp.completed = true
      AND l.is_published = true;
    
    -- If course is 100% complete
    IF completed_lessons = total_lessons AND total_lessons > 0 THEN
      -- Award course completion achievement
      SELECT id INTO course_completion_achievement_id
      FROM public.achievements
      WHERE requirement_type = 'course_completion' AND requirement_value = 1;
      
      IF course_completion_achievement_id IS NOT NULL THEN
        INSERT INTO public.user_achievements (user_id, achievement_id)
        VALUES (NEW.user_id, course_completion_achievement_id)
        ON CONFLICT (user_id, achievement_id) DO NOTHING;
      END IF;
      
      -- Get course info and generate certificate
      SELECT c.id, c.title, c.instructor_name INTO course_info
      FROM public.lessons l
      JOIN public.courses c ON l.course_id = c.id
      WHERE l.id = NEW.lesson_id;
      
      -- Insert certificate record
      INSERT INTO public.certificates (user_id, course_id, certificate_data)
      VALUES (
        NEW.user_id,
        course_info.id,
        jsonb_build_object(
          'course_title', course_info.title,
          'instructor_name', course_info.instructor_name,
          'completion_date', NOW(),
          'total_lessons', total_lessons
        )
      )
      ON CONFLICT (user_id, course_id) DO NOTHING;
      
      -- Check for multiple course achievements
      SELECT COUNT(DISTINCT course_id) INTO completed_courses_count
      FROM public.certificates
      WHERE user_id = NEW.user_id;
      
      -- Award multiple course achievements
      FOR course_completion_achievement_id IN 
        SELECT id FROM public.achievements 
        WHERE requirement_type = 'multiple_courses' 
          AND requirement_value <= completed_courses_count
      LOOP
        INSERT INTO public.user_achievements (user_id, achievement_id)
        VALUES (NEW.user_id, course_completion_achievement_id)
        ON CONFLICT (user_id, achievement_id) DO NOTHING;
      END LOOP;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Trigger for course completion checks
CREATE TRIGGER check_course_completion_trigger
  AFTER INSERT OR UPDATE ON public.user_lesson_progress
  FOR EACH ROW
  EXECUTE FUNCTION public.check_course_completion();