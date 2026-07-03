-- Add category column to cr_questions table
ALTER TABLE public.cr_questions 
ADD COLUMN IF NOT EXISTS category text DEFAULT 'basic_info';

-- Update existing questions with appropriate categories
UPDATE public.cr_questions SET category = 'basic_info' WHERE category IS NULL OR category = 'basic_info';

-- Insert 20 new expert-level questions (using correct types: choice, text, multiselect)
INSERT INTO public.cr_questions (question_text, question_type, icon, options, order_index, is_active, category) VALUES

-- Self-Awareness & Identity (4 questions)
('ကိုယ်က ငွေမရဘဲ နာရီပေါင်းများစွာ လုပ်နေနိုင်တဲ့ အရာက ဘာလဲ?', 'text', 'Heart', NULL, 15, true, 'self_awareness'),

('လူတွေက ကိုယ့်ဆီကို ဘာအကြံဉာဏ်တွေ တောင်းလေ့ရှိလဲ?', 'multiselect', 'Users', '["နည်းပညာ/Tech ဆိုင်ရာ", "ဘဝ/Relationship အကြံဉာဏ်", "ငွေရေးကြေးရေး/Business", "ဖန်တီးမှု/Creative အကြံဉာဏ်", "ကျန်းမာရေး/Fitness", "အခြား"]', 16, true, 'self_awareness'),

('ကိုယ့်ကို တခြားသူတွေနဲ့ မတူအောင် ဘာက ခြားနားစေလဲ?', 'text', 'Fingerprint', NULL, 17, true, 'self_awareness'),

('အခက်ခဲဆုံး အချိန်မှာ ကိုယ့်ကို ဘာက ဆက်လုပ်စေလဲ?', 'choice', 'Flame', '["မိသားစု/ချစ်ရသူများအတွက်", "ကိုယ့်အိပ်မက်/Goal အတွက်", "သူများကို ကူညီချင်လို့", "ကိုယ့်ကိုယ်ကို သက်သေပြချင်လို့", "ငွေကြေး/လူနေမှုအဆင့်အတန်း"]', 18, true, 'self_awareness'),

-- Values & Goals (3 questions)
('၅ နှစ်အတွင်း ကိုယ်ဘယ်လိုနေရာမှာ ရောက်နေချင်လဲ?', 'text', 'Target', NULL, 19, true, 'values_goals'),

('Content Creator အဖြစ် ဘာရရှိချင်အဆုံးလဲ?', 'multiselect', 'Trophy', '["ငွေကြေးလွတ်လပ်မှု", "နာမည်ကျော်ကြားမှု", "သူများကို Inspire လုပ်ချင်", "Community တည်ဆောက်ချင်", "ကိုယ့်ကိုယ်ကို ဖော်ထုတ်ချင်", "Business/Brand တည်ဆောက်ချင်"]', 20, true, 'values_goals'),

('ဘာကို အဓိက တန်ဖိုးထားဆုံးလဲ?', 'choice', 'Star', '["ရိုးသားမှု/Authenticity", "တီထွင်ဖန်တီးမှု/Creativity", "လွတ်လပ်မှု/Freedom", "အကျိုးသက်ရောက်မှု/Impact", "ငွေကြေး/Wealth"]', 21, true, 'values_goals'),

-- Working Style & Energy (3 questions)
('ဘယ်အချိန်မှာ အထက်ထက်မြက်မြက် စဉ်းစားနိုင်လဲ?', 'choice', 'Clock', '["မနက်စောစော (5AM-9AM)", "နေ့လည် (9AM-12PM)", "နေ့ခင်း (12PM-5PM)", "ညနေ/ည (5PM-12AM)", "သန်းခေါင်ယံ (12AM-5AM)"]', 22, true, 'working_style'),

('Stress ဖြစ်တဲ့အခါ ဘယ်လို handle လုပ်လဲ?', 'choice', 'Brain', '["တစ်ယောက်တည်း နေချင်တယ်", "သူငယ်ချင်းတွေနဲ့ ပြောချင်တယ်", "Exercise/Movement လုပ်တယ်", "Music/Entertainment ကြည့်တယ်", "အလုပ်ထဲ ပိုနစ်မြှုပ်တယ်"]', 23, true, 'working_style'),

('ကိုယ့်ကို အကောင်းဆုံး describe လုပ်တဲ့ စကားက?', 'choice', 'Sparkles', '["Planner - အစီအစဉ်ချရတာ ကြိုက်တယ်", "Spontaneous - လိုက်ပြီး improvise လုပ်တယ်", "Perfectionist - အသေးစိတ်ဂရုစိုက်တယ်", "Fast mover - မြန်မြန်ဆန်ဆန် လုပ်တယ်", "Deep thinker - သေချာစဉ်းစားတယ်"]', 24, true, 'working_style'),

-- Skills Assessment (3 questions)
('Video editing skill level ကို ဘယ်လို အဆင့်သတ်မှတ်မလဲ?', 'choice', 'Video', '["မလုပ်တတ်ဘူး", "Basic တတ်တယ် (Cut/Trim)", "Intermediate (Effects, Transitions)", "Advanced (Color grading, Motion graphics)", "Professional level"]', 25, true, 'skills'),

('ဘယ် skill ကို အခုထက် ပိုတိုးတက်ချင်လဲ?', 'multiselect', 'GraduationCap', '["Video Editing", "Storytelling/Script Writing", "Public Speaking/Camera Presence", "Marketing/Promotion", "Community Building", "Monetization/Business"]', 26, true, 'skills'),

('ကိုယ်တော်တဲ့ skill 3 ခု ရွေးပါ?', 'multiselect', 'Zap', '["ပြောဆိုဆက်ဆံရေး", "ရေးသားခြင်း", "ဒီဇိုင်း/Visual", "Teaching/ရှင်းပြခြင်း", "Research/သုတေသန", "Entertainment/ဖျော်ဖြေခြင်း", "Technical skills", "Leadership"]', 27, true, 'skills'),

-- Deep Insights (3 questions)
('ကိုယ် ဘာ topic ကို ပြောရင် အပြောကြမ်းဆုံး ဖြစ်လဲ?', 'text', 'MessageCircle', NULL, 28, true, 'deep_insights'),

('ကိုယ့် content ကို ကြည့်ပြီး viewer တွေ ဘာခံစားစေချင်လဲ?', 'multiselect', 'Heart', '["Inspired/တက်ကြွစေချင်", "Educated/သင်ယူစေချင်", "Entertained/ပျော်ရွှင်စေချင်", "Connected/ချိတ်ဆက်မှုခံစားစေချင်", "Motivated/လှုံ့ဆော်စေချင်", "Empowered/စွမ်းဆောင်နိုင်စေချင်"]', 29, true, 'deep_insights'),

('တကယ်လို့ fail ဖြစ်မှာ မကြောက်ရင် ဘာစမ်းကြည့်ချင်လဲ?', 'text', 'Rocket', NULL, 30, true, 'deep_insights'),

-- Personality & Communication (2 questions)
('Party တစ်ခုမှာ ကိုယ်ဘယ်လို ဖြစ်လေ့ရှိလဲ?', 'choice', 'Users', '["အားလုံးနဲ့ ပြောဆိုဆက်ဆံတယ်", "သိတဲ့လူတွေနဲ့ပဲ ပြောတယ်", "ထောင့်မှာ ငြိမ်နေတယ်", "Party organizer ဖြစ်တယ်", "စောစော ပြန်သွားတယ်"]', 31, true, 'personality'),

('ကိုယ့် Communication style က?', 'choice', 'Mic', '["ပြောတာ ကြိုက်တယ် (Talker)", "နားထောင်တာ ကြိုက်တယ် (Listener)", "ရေးတာ ကြိုက်တယ် (Writer)", "Visual နဲ့ ပြတာ ကြိုက်တယ် (Visual)", "အားလုံး ရောနှောတယ်"]', 32, true, 'personality'),

-- Growth Mindset (2 questions)
('Criticism/ဝေဖန်မှုကို ဘယ်လို လက်ခံလဲ?', 'choice', 'MessageSquare', '["တိုးတက်ဖို့ အခွင့်အလမ်းအဖြစ် မြင်တယ်", "အရင် စိတ်ဆိုးပြီး နောက်မှ လက်ခံတယ်", "ခက်ခက်ခဲခဲ လက်ခံရတယ်", "ဘယ်သူပြောလဲပေါ် မူတည်တယ်", "အများအားဖြင့် လျစ်လျူရှုတယ်"]', 33, true, 'growth_mindset'),

('အသစ်တစ်ခုခု စမ်းရတာကို ဘယ်လို ခံစားလဲ?', 'choice', 'Lightbulb', '["အရမ်း စိတ်လှုပ်ရှားတယ်", "စိုးရိမ်ပေမယ့် စမ်းကြည့်တယ်", "သေချာ plan ချပြီးမှ စမ်းတယ်", "တခြားသူ အရင်လုပ်တာ ကြည့်တယ်", "ကိုယ့် comfort zone မှာပဲ နေချင်တယ်"]', 34, true, 'growth_mindset');

-- Create index for category column
CREATE INDEX IF NOT EXISTS idx_cr_questions_category ON public.cr_questions(category);