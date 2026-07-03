
-- Fix 1: Add missing INSERT and UPDATE RLS policies for user_psych_profile
CREATE POLICY "Users can insert own psych profile"
ON public.user_psych_profile
FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own psych profile"
ON public.user_psych_profile
FOR UPDATE
USING (auth.uid() = user_id);

-- Fix 5: Add life_event category to user_memories
ALTER TABLE public.user_memories
DROP CONSTRAINT IF EXISTS user_memories_category_check;

ALTER TABLE public.user_memories
ADD CONSTRAINT user_memories_category_check
CHECK (category IN ('preference', 'fact', 'relationship', 'work', 'opinion', 'life_event'));
