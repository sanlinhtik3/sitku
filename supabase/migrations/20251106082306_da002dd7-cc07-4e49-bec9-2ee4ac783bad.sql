-- Create user preferences table
CREATE TABLE public.user_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Notification preferences
  email_notifications BOOLEAN DEFAULT true,
  push_notifications BOOLEAN DEFAULT true,
  enrollment_notifications BOOLEAN DEFAULT true,
  course_updates BOOLEAN DEFAULT true,
  
  -- Theme preferences
  theme TEXT DEFAULT 'system' CHECK (theme IN ('light', 'dark', 'system')),
  
  -- Language preference
  language TEXT DEFAULT 'en' CHECK (language IN ('en', 'es', 'fr', 'de', 'pt', 'ar')),
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.user_preferences ENABLE ROW LEVEL SECURITY;

-- Users can view and update their own preferences
CREATE POLICY "Users can view own preferences"
ON public.user_preferences
FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own preferences"
ON public.user_preferences
FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own preferences"
ON public.user_preferences
FOR UPDATE
USING (auth.uid() = user_id);

-- Admins can view all preferences
CREATE POLICY "Admins can view all preferences"
ON public.user_preferences
FOR SELECT
USING (has_role(auth.uid(), 'admin'::app_role));

-- Create trigger for updated_at
CREATE TRIGGER update_user_preferences_updated_at
BEFORE UPDATE ON public.user_preferences
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at();

-- Function to get course progress for a user
CREATE OR REPLACE FUNCTION public.get_user_course_progress(p_user_id UUID)
RETURNS TABLE (
  course_id UUID,
  course_title TEXT,
  course_thumbnail TEXT,
  total_lessons INTEGER,
  completed_lessons INTEGER,
  progress_percentage NUMERIC
) 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    c.id AS course_id,
    c.title AS course_title,
    c.thumbnail_url AS course_thumbnail,
    COUNT(l.id)::INTEGER AS total_lessons,
    COUNT(ulp.id) FILTER (WHERE ulp.completed = true)::INTEGER AS completed_lessons,
    ROUND((COUNT(ulp.id) FILTER (WHERE ulp.completed = true)::NUMERIC / NULLIF(COUNT(l.id), 0) * 100), 2) AS progress_percentage
  FROM public.courses c
  INNER JOIN public.enrollments e ON e.course_id = c.id
  LEFT JOIN public.lessons l ON l.course_id = c.id AND l.is_published = true
  LEFT JOIN public.user_lesson_progress ulp ON ulp.lesson_id = l.id AND ulp.user_id = p_user_id
  WHERE e.user_id = p_user_id 
    AND e.status = 'approved'
  GROUP BY c.id, c.title, c.thumbnail_url
  ORDER BY c.title;
END;
$$;