-- Create lesson_sections table for better organization
CREATE TABLE public.lesson_sections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id UUID NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  order_index INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.lesson_sections ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Admins can manage sections"
  ON public.lesson_sections FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Anyone can view sections"
  ON public.lesson_sections FOR SELECT
  USING (true);

-- Add section_id to lessons table
ALTER TABLE public.lessons 
  ADD COLUMN section_id UUID REFERENCES public.lesson_sections(id) ON DELETE SET NULL;

-- Create indexes for performance
CREATE INDEX idx_lessons_section_id ON public.lessons(section_id);
CREATE INDEX idx_lesson_sections_course_id ON public.lesson_sections(course_id);

-- Create trigger for updated_at
CREATE TRIGGER update_lesson_sections_updated_at
  BEFORE UPDATE ON public.lesson_sections
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at();

-- Migrate existing sections from text to table
INSERT INTO public.lesson_sections (course_id, title, order_index)
SELECT DISTINCT 
  course_id, 
  COALESCE(section, 'Introduction') as title,
  ROW_NUMBER() OVER (PARTITION BY course_id ORDER BY MIN(order_index)) - 1 as order_index
FROM public.lessons
GROUP BY course_id, section;

-- Link existing lessons to their sections
UPDATE public.lessons l
SET section_id = (
  SELECT ls.id 
  FROM public.lesson_sections ls 
  WHERE ls.course_id = l.course_id 
    AND ls.title = COALESCE(l.section, 'Introduction')
  LIMIT 1
);