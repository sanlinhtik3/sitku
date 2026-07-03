-- Create srt_translations table for Easy Burmese SRT app
CREATE TABLE public.srt_translations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  video_name TEXT NOT NULL,
  video_url TEXT,
  original_language TEXT DEFAULT 'en',
  target_language TEXT DEFAULT 'my',
  original_text TEXT,
  translated_text TEXT,
  srt_content TEXT,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'extracting', 'transcribing', 'translating', 'completed', 'failed')),
  error_message TEXT,
  duration_seconds INTEGER,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.srt_translations ENABLE ROW LEVEL SECURITY;

-- Create policies for user access
CREATE POLICY "Users can view their own translations" 
ON public.srt_translations 
FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own translations" 
ON public.srt_translations 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own translations" 
ON public.srt_translations 
FOR UPDATE 
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own translations" 
ON public.srt_translations 
FOR DELETE 
USING (auth.uid() = user_id);

-- Create trigger for automatic timestamp updates
CREATE TRIGGER update_srt_translations_updated_at
BEFORE UPDATE ON public.srt_translations
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Create storage bucket for SRT videos
INSERT INTO storage.buckets (id, name, public, file_size_limit) 
VALUES ('srt-videos', 'srt-videos', false, 524288000);

-- Storage policies for srt-videos bucket
CREATE POLICY "Users can upload their own srt videos"
ON storage.objects
FOR INSERT
WITH CHECK (bucket_id = 'srt-videos' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can view their own srt videos"
ON storage.objects
FOR SELECT
USING (bucket_id = 'srt-videos' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can delete their own srt videos"
ON storage.objects
FOR DELETE
USING (bucket_id = 'srt-videos' AND auth.uid()::text = (storage.foldername(name))[1]);

-- Add feature flag for Easy SRT
INSERT INTO public.feature_flags (feature_key, feature_name, is_enabled, status, icon, description, category)
VALUES ('easy_srt', 'Easy Burmese SRT', true, 'active', 'Subtitles', 'AI-powered video translation to Burmese subtitles', 'tools')
ON CONFLICT (feature_key) DO NOTHING;