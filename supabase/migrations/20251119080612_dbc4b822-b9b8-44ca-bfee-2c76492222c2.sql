-- Add RLS policies for users to manage their own AI generated content

-- Users can view their own content
CREATE POLICY "Users can view own content" ON public.ai_generated_content
FOR SELECT 
USING (auth.uid() = user_id);

-- Users can insert their own content
CREATE POLICY "Users can insert own content" ON public.ai_generated_content
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

-- Users can update their own content
CREATE POLICY "Users can update own content" ON public.ai_generated_content
FOR UPDATE 
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- Users can delete their own content
CREATE POLICY "Users can delete own content" ON public.ai_generated_content
FOR DELETE 
USING (auth.uid() = user_id);