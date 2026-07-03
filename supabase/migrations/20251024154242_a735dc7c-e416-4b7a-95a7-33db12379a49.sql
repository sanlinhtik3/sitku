-- Create posts table
CREATE TABLE public.posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  type TEXT NOT NULL DEFAULT 'learn',
  content JSONB NOT NULL,
  content_html TEXT,
  thumbnail_url TEXT,
  external_link TEXT,
  author_id UUID REFERENCES auth.users(id),
  is_published BOOLEAN DEFAULT false,
  view_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  published_at TIMESTAMPTZ
);

-- Create indexes for better performance
CREATE INDEX idx_posts_slug ON public.posts(slug);
CREATE INDEX idx_posts_type ON public.posts(type);
CREATE INDEX idx_posts_published ON public.posts(is_published, published_at DESC);
CREATE INDEX idx_posts_author ON public.posts(author_id);

-- Enable Row Level Security
ALTER TABLE public.posts ENABLE ROW LEVEL SECURITY;

-- Anyone can view published posts
CREATE POLICY "Anyone can view published posts"
  ON public.posts FOR SELECT
  USING (is_published = true);

-- Admins can manage all posts
CREATE POLICY "Admins can manage all posts"
  ON public.posts FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role));

-- Create post_categories table
CREATE TABLE public.post_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT UNIQUE NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Add category_id to posts
ALTER TABLE public.posts ADD COLUMN category_id UUID REFERENCES public.post_categories(id);
CREATE INDEX idx_posts_category ON public.posts(category_id);

-- Enable RLS on categories
ALTER TABLE public.post_categories ENABLE ROW LEVEL SECURITY;

-- Anyone can view categories
CREATE POLICY "Anyone can view categories"
  ON public.post_categories FOR SELECT
  USING (true);

-- Admins can manage categories
CREATE POLICY "Admins can manage categories"
  ON public.post_categories FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role));

-- Add trigger for updated_at
CREATE TRIGGER update_posts_updated_at
  BEFORE UPDATE ON public.posts
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at();