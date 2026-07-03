-- Drop all docs-related tables in reverse order of dependencies
DROP TABLE IF EXISTS public.doc_toc_items CASCADE;
DROP TABLE IF EXISTS public.docs CASCADE;
DROP TABLE IF EXISTS public.doc_categories CASCADE;