-- Add difficulty column to courses table
ALTER TABLE public.courses 
ADD COLUMN difficulty TEXT 
CHECK (difficulty IN ('beginner', 'intermediate', 'advanced'))
DEFAULT 'beginner';

-- Update existing courses with default difficulty
UPDATE public.courses SET difficulty = 'beginner' WHERE difficulty IS NULL;

-- Add total duration for courses (optional but helpful)
ALTER TABLE public.courses 
ADD COLUMN total_duration_minutes INTEGER;