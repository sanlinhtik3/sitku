-- Add slug columns to courses and lessons
ALTER TABLE courses ADD COLUMN IF NOT EXISTS slug TEXT UNIQUE;
ALTER TABLE lessons ADD COLUMN IF NOT EXISTS slug TEXT;

-- Create a function to generate slugs
CREATE OR REPLACE FUNCTION generate_slug(text_input TEXT)
RETURNS TEXT AS $$
BEGIN
  RETURN lower(regexp_replace(regexp_replace(text_input, '[^a-zA-Z0-9\s-]', '', 'g'), '\s+', '-', 'g'));
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Populate existing course slugs
UPDATE courses 
SET slug = generate_slug(title) || '-' || substring(id::text from 1 for 8)
WHERE slug IS NULL;

-- Populate existing lesson slugs
UPDATE lessons 
SET slug = generate_slug(title) || '-' || substring(id::text from 1 for 8)
WHERE slug IS NULL;

-- Make slug NOT NULL after populating
ALTER TABLE courses ALTER COLUMN slug SET NOT NULL;
ALTER TABLE lessons ALTER COLUMN slug SET NOT NULL;

-- Add index for better performance
CREATE INDEX IF NOT EXISTS idx_courses_slug ON courses(slug);
CREATE INDEX IF NOT EXISTS idx_lessons_slug ON lessons(course_id, slug);