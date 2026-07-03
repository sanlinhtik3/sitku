-- ═══ BEEBOT MULTIMODAL UPGRADE ═══
-- Phase 1: Vision capability with attachments
-- Phase 3: Personality level for "The Weird Friend"

-- Add attachments column to agent_chat_messages for multi-modal support
ALTER TABLE agent_chat_messages 
ADD COLUMN IF NOT EXISTS attachments JSONB DEFAULT NULL;

-- Add comment explaining the structure
COMMENT ON COLUMN agent_chat_messages.attachments IS 'JSONB array of MessageAttachment objects: {type: "image"|"audio"|"file", url: string, base64?: string, mime_type: string, file_name?: string, size_bytes?: number, analysis?: {type, extracted_data}}';

-- Add personality_level column to user_agent_settings
ALTER TABLE user_agent_settings 
ADD COLUMN IF NOT EXISTS personality_level TEXT NOT NULL DEFAULT 'normal';

-- Add check constraint for valid personality levels
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'valid_personality_level'
  ) THEN
    ALTER TABLE user_agent_settings 
    ADD CONSTRAINT valid_personality_level 
    CHECK (personality_level IN ('normal', 'sassy', 'roast'));
  END IF;
END $$;

COMMENT ON COLUMN user_agent_settings.personality_level IS 'Controls BeeBot personality intensity: normal (polite), sassy (playful), roast (witty teasing)';

-- ═══ STORAGE BUCKET FOR AGENT CHAT IMAGES ═══
-- Create bucket for user-uploaded images in agent chat
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'agent-chat-images', 
  'agent-chat-images', 
  false,
  5242880, -- 5MB limit
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
ON CONFLICT (id) DO NOTHING;

-- ═══ RLS POLICIES FOR AGENT CHAT IMAGES BUCKET ═══
-- Users can view their own uploaded images
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'Users can view own agent images' AND tablename = 'objects'
  ) THEN
    CREATE POLICY "Users can view own agent images"
    ON storage.objects FOR SELECT
    USING (
      bucket_id = 'agent-chat-images' 
      AND auth.uid()::text = (storage.foldername(name))[1]
    );
  END IF;
END $$;

-- Users can upload to their own folder
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'Users can upload agent images' AND tablename = 'objects'
  ) THEN
    CREATE POLICY "Users can upload agent images"
    ON storage.objects FOR INSERT
    WITH CHECK (
      bucket_id = 'agent-chat-images' 
      AND auth.uid()::text = (storage.foldername(name))[1]
    );
  END IF;
END $$;

-- Users can delete their own images
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'Users can delete own agent images' AND tablename = 'objects'
  ) THEN
    CREATE POLICY "Users can delete own agent images"
    ON storage.objects FOR DELETE
    USING (
      bucket_id = 'agent-chat-images' 
      AND auth.uid()::text = (storage.foldername(name))[1]
    );
  END IF;
END $$;

-- ═══ INSERT RESOURCEFUL PROMPT INTO agent_prompt_files ═══
-- Using 'features' category which is a valid value
INSERT INTO agent_prompt_files (
  file_name,
  display_name,
  category,
  content,
  description,
  order_index,
  is_active,
  is_required,
  version
) VALUES (
  'RESOURCEFUL.md',
  'Resourceful Agent Protocol',
  'features',
  '# RESOURCEFUL AGENT PROTOCOL

## Core Principle: Never Say "I Can''t" Without Trying

You are a resourceful assistant. When a user asks for something:

### 1. TOOL COMBINATION
If no single tool fits, **combine existing tools** creatively:
- Need research + content? → `search_knowledge_base` + `generate_ai_content`
- Need task + reminder? → `manage_workspace_task` with due date
- Need calculation + record? → Think through + `manage_flowstate`

### 2. KNOWLEDGE BASE FALLBACK
If a direct tool doesn''t exist:
- Search Knowledge Base for relevant information
- Synthesize an answer from available knowledge
- Only then explain limitations if truly can''t help

### 3. CREATIVE SOLUTIONS
Instead of: "ဒါကို မလုပ်ပေးနိုင်ဘူးခင်ဗျာ"
Say: "တိုက်ရိုက်မရပေမယ့်၊ ဒီလိုနည်းလမ်းနဲ့ ကူညီပေးနိုင်ပါတယ်..."

### 4. PROACTIVE SUGGESTIONS
After completing a task, suggest related helpful actions:
- Added expense? → "Budget review လုပ်ချင်ရင် ပြောပါ"
- Created content? → "ဒါကို Course lesson အဖြစ် သုံးမလား?"
- Completed task? → "ဆက်စပ် task တွေ ရှိသေးလား?"

### 5. TOOL CHAINING EXAMPLES
```
User: "ကျွန်တော့်ရဲ့ လစာကို တွက်ပြီး record လုပ်ပေး"
→ Think: Calculate + FlowState
→ Action: Use manage_flowstate with add_income

User: "Bitcoin အကြောင်း ရေးပြီး save လုပ်ပေး"
→ Think: KB search + Content generate
→ Action: search_knowledge_base → generate_ai_content with save=true
```

### 6. IMAGE ANALYSIS INSTRUCTIONS

When user uploads an image, analyze it and:

**Receipt Detection:**
- If it looks like a receipt/bill/invoice:
- Extract: total amount, date, merchant name, items if visible
- Suggest: "ဒီ receipt ကို FlowState မှာ record လုပ်ပေးရမလား?"
- Use `manage_flowstate` with extracted data

**Chart/Graph Detection:**
- If it''s a crypto chart, stock chart, or data visualization:
- Extract: trend direction, key levels, timeframe
- Offer: "ဒီ chart analysis ကို AI Content အဖြစ် save လုပ်ပေးရမလား?"
- Use `generate_ai_content` to create analysis

**General Image:**
- Describe what you see clearly
- Ask if user wants any specific action
- Offer helpful suggestions based on image content',
  'Teaches BeeBot to be resourceful by combining tools and never giving up',
  45,
  true,
  false,
  1
) ON CONFLICT (file_name) DO UPDATE SET
  content = EXCLUDED.content,
  description = EXCLUDED.description,
  order_index = EXCLUDED.order_index,
  updated_at = now();