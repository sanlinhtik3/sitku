-- Add view_count to courses table
ALTER TABLE courses ADD COLUMN IF NOT EXISTS view_count integer DEFAULT 0;

-- Create post_views table for detailed tracking
CREATE TABLE IF NOT EXISTS post_views (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  user_id uuid REFERENCES profiles(user_id) ON DELETE SET NULL,
  viewed_at timestamp with time zone DEFAULT now(),
  session_id text
);

-- Create course_views table for detailed tracking
CREATE TABLE IF NOT EXISTS course_views (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id uuid NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  user_id uuid REFERENCES profiles(user_id) ON DELETE SET NULL,
  viewed_at timestamp with time zone DEFAULT now(),
  session_id text
);

-- Create post_engagements table
CREATE TABLE IF NOT EXISTS post_engagements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  user_id uuid REFERENCES profiles(user_id) ON DELETE SET NULL,
  engagement_type text NOT NULL,
  engaged_at timestamp with time zone DEFAULT now(),
  session_id text
);

-- Create course_engagements table
CREATE TABLE IF NOT EXISTS course_engagements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id uuid NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  user_id uuid REFERENCES profiles(user_id) ON DELETE SET NULL,
  engagement_type text NOT NULL,
  engaged_at timestamp with time zone DEFAULT now(),
  session_id text
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_post_views_post_id_viewed_at ON post_views(post_id, viewed_at DESC);
CREATE INDEX IF NOT EXISTS idx_course_views_course_id_viewed_at ON course_views(course_id, viewed_at DESC);
CREATE INDEX IF NOT EXISTS idx_post_engagements_post_id ON post_engagements(post_id, engaged_at DESC);
CREATE INDEX IF NOT EXISTS idx_course_engagements_course_id ON course_engagements(course_id, engaged_at DESC);

-- Enable RLS
ALTER TABLE post_views ENABLE ROW LEVEL SECURITY;
ALTER TABLE course_views ENABLE ROW LEVEL SECURITY;
ALTER TABLE post_engagements ENABLE ROW LEVEL SECURITY;
ALTER TABLE course_engagements ENABLE ROW LEVEL SECURITY;

-- RLS Policies - Anyone can insert views
CREATE POLICY "Anyone can insert post views" ON post_views FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can insert course views" ON course_views FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can insert post engagements" ON post_engagements FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can insert course engagements" ON course_engagements FOR INSERT WITH CHECK (true);

-- RLS Policies - Admins can view all analytics
CREATE POLICY "Admins can view post views" ON post_views FOR SELECT USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can view course views" ON course_views FOR SELECT USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can view post engagements" ON post_engagements FOR SELECT USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can view course engagements" ON course_engagements FOR SELECT USING (has_role(auth.uid(), 'admin'::app_role));

-- Create functions to increment view counts
CREATE OR REPLACE FUNCTION increment_post_view_count(post_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  UPDATE posts SET view_count = view_count + 1 WHERE id = post_id;
END;
$$;

CREATE OR REPLACE FUNCTION increment_course_view_count(course_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  UPDATE courses SET view_count = view_count + 1 WHERE id = course_id;
END;
$$;