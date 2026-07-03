-- Create documentation categories table
CREATE TABLE public.doc_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  description TEXT,
  order_index INTEGER DEFAULT 0,
  icon TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create documentation pages table
CREATE TABLE public.docs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id UUID REFERENCES public.doc_categories(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  slug TEXT NOT NULL,
  content_html TEXT NOT NULL,
  content JSONB NOT NULL,
  order_index INTEGER DEFAULT 0,
  is_published BOOLEAN DEFAULT false,
  published_at TIMESTAMPTZ,
  author_id UUID,
  view_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(category_id, slug)
);

-- Create table of contents items table
CREATE TABLE public.doc_toc_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  doc_id UUID REFERENCES public.docs(id) ON DELETE CASCADE,
  heading TEXT NOT NULL,
  level INTEGER NOT NULL,
  anchor TEXT NOT NULL,
  order_index INTEGER DEFAULT 0
);

-- Enable RLS
ALTER TABLE public.doc_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.docs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.doc_toc_items ENABLE ROW LEVEL SECURITY;

-- RLS Policies for doc_categories
CREATE POLICY "Anyone can view categories"
ON public.doc_categories
FOR SELECT
USING (true);

CREATE POLICY "Admins can manage categories"
ON public.doc_categories
FOR ALL
USING (has_role(auth.uid(), 'admin'));

-- RLS Policies for docs
CREATE POLICY "Anyone can view published docs"
ON public.docs
FOR SELECT
USING (is_published = true);

CREATE POLICY "Admins can manage docs"
ON public.docs
FOR ALL
USING (has_role(auth.uid(), 'admin'));

-- RLS Policies for doc_toc_items
CREATE POLICY "Anyone can view TOC"
ON public.doc_toc_items
FOR SELECT
USING (true);

CREATE POLICY "Admins can manage TOC"
ON public.doc_toc_items
FOR ALL
USING (has_role(auth.uid(), 'admin'));

-- Create indexes for better performance
CREATE INDEX idx_docs_category_id ON public.docs(category_id);
CREATE INDEX idx_docs_published ON public.docs(is_published, published_at);
CREATE INDEX idx_doc_toc_items_doc_id ON public.doc_toc_items(doc_id);

-- Add trigger for updated_at
CREATE TRIGGER update_doc_categories_updated_at
BEFORE UPDATE ON public.doc_categories
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at();

CREATE TRIGGER update_docs_updated_at
BEFORE UPDATE ON public.docs
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at();