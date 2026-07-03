-- Add new position and multi-language columns to srt_subtitle_styles
ALTER TABLE public.srt_subtitle_styles
ADD COLUMN IF NOT EXISTS position_x INTEGER DEFAULT 50,
ADD COLUMN IF NOT EXISTS position_y INTEGER DEFAULT 85,
ADD COLUMN IF NOT EXISTS text_alignment TEXT DEFAULT 'center',
ADD COLUMN IF NOT EXISTS show_original BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS original_position TEXT DEFAULT 'top',
ADD COLUMN IF NOT EXISTS original_font_size INTEGER DEFAULT 18,
ADD COLUMN IF NOT EXISTS original_text_color TEXT DEFAULT '#CCCCCC',
ADD COLUMN IF NOT EXISTS original_opacity NUMERIC(3,2) DEFAULT 0.7;