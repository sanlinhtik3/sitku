-- Create function to get table columns from information_schema
CREATE OR REPLACE FUNCTION public.get_table_columns()
RETURNS TABLE (
  table_name text,
  column_name text,
  data_type text,
  is_nullable text,
  column_default text
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 
    t.table_name::text,
    c.column_name::text,
    c.data_type::text,
    c.is_nullable::text,
    c.column_default::text
  FROM information_schema.tables t
  JOIN information_schema.columns c ON t.table_name = c.table_name
  WHERE t.table_schema = 'public'
    AND t.table_type = 'BASE TABLE'
    AND c.table_schema = 'public'
  ORDER BY t.table_name, c.ordinal_position;
$$;

-- Create function to get tables without primary keys
CREATE OR REPLACE FUNCTION public.get_tables_without_pk()
RETURNS TABLE (table_name text)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT t.table_name::text
  FROM information_schema.tables t
  LEFT JOIN information_schema.table_constraints tc 
    ON t.table_name = tc.table_name 
    AND tc.constraint_type = 'PRIMARY KEY'
    AND tc.table_schema = 'public'
  WHERE t.table_schema = 'public'
    AND t.table_type = 'BASE TABLE'
    AND tc.constraint_name IS NULL;
$$;

-- Create function to get tables without RLS enabled
CREATE OR REPLACE FUNCTION public.get_tables_without_rls()
RETURNS TABLE (table_name text)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT tablename::text
  FROM pg_tables
  WHERE schemaname = 'public'
    AND rowsecurity = false;
$$;