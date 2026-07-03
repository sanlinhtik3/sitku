-- First create the update_updated_at_column function if it doesn't exist
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Create feature_flags table with hierarchy support
CREATE TABLE public.feature_flags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Hierarchy
  feature_key TEXT UNIQUE NOT NULL,
  parent_feature_key TEXT,
  
  -- Basic Info (Bilingual)
  feature_name TEXT NOT NULL,
  feature_name_my TEXT,
  description TEXT,
  description_my TEXT,
  icon TEXT DEFAULT 'Settings',
  
  -- Status System
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'beta', 'maintenance', 'coming_soon', 'deprecated')),
  is_enabled BOOLEAN DEFAULT true,
  
  -- Messaging (Bilingual)
  status_message TEXT,
  status_message_my TEXT,
  maintenance_message TEXT,
  maintenance_message_my TEXT,
  
  -- Display
  category TEXT DEFAULT 'general',
  sort_order INTEGER DEFAULT 0,
  show_in_nav BOOLEAN DEFAULT true,
  
  -- Tracking
  disabled_at TIMESTAMPTZ,
  disabled_by UUID,
  enabled_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ DEFAULT now(),
  updated_by UUID
);

-- Add self-referencing FK after table creation
ALTER TABLE public.feature_flags 
  ADD CONSTRAINT feature_flags_parent_fkey 
  FOREIGN KEY (parent_feature_key) 
  REFERENCES public.feature_flags(feature_key) ON DELETE CASCADE;

-- Enable RLS
ALTER TABLE public.feature_flags ENABLE ROW LEVEL SECURITY;

-- Anyone can read feature flags (for feature checks)
CREATE POLICY "Anyone can read feature flags"
  ON public.feature_flags
  FOR SELECT
  USING (true);

-- Only admins can manage feature flags
CREATE POLICY "Admins can manage feature flags"
  ON public.feature_flags
  FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role));

-- Create updated_at trigger
CREATE TRIGGER update_feature_flags_updated_at
  BEFORE UPDATE ON public.feature_flags
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Seed Major Features
INSERT INTO public.feature_flags (feature_key, feature_name, feature_name_my, description, description_my, icon, category, sort_order, status, is_enabled) VALUES
  ('courses', 'Courses', 'သင်တန်းများ', 'Online learning courses with video lessons', 'ဗီဒီယိုသင်ခန်းစာများပါဝင်သော အွန်လိုင်းသင်တန်းများ', 'GraduationCap', 'learning', 1, 'active', true),
  ('learn', 'Learn (Blog)', 'လေ့လာရန် (ဆောင်းပါးများ)', 'Educational blog posts and articles', 'ပညာရေးဆိုင်ရာ ဘလော့ဂ်ပို့စ်များနှင့် ဆောင်းပါးများ', 'BookOpen', 'learning', 2, 'active', true),
  ('ai_content', 'AI Content Writer', 'AI အကြောင်းအရာ ရေးသားစက်', 'AI-powered content generation tool', 'AI ဖြင့် အကြောင်းအရာထုတ်လုပ်သည့် tool', 'Sparkles', 'ai_tools', 3, 'active', true),
  ('creator_rocket', 'Creator Rocket', 'Creator Rocket', 'Creator business blueprint generator', 'Creator လုပ်ငန်း blueprint ထုတ်လုပ်စက်', 'Rocket', 'ai_tools', 4, 'active', true),
  ('team_workspace', 'Studio Hub', 'Studio Hub (အဖွဲ့လုပ်ငန်းခွင်)', 'Team collaboration workspace', 'အဖွဲ့ပူးပေါင်းဆောင်ရွက်ရေး လုပ်ငန်းခွင်', 'Briefcase', 'collaboration', 5, 'active', true),
  ('referrals', 'Referral Program', 'မိတ်ဆက်ပရိုဂရမ်', 'User referral system with credit rewards', 'ခရက်ဒစ်ဆုလာဘ်များပါဝင်သော အသုံးပြုသူမိတ်ဆက်စနစ်', 'Users', 'engagement', 6, 'active', true),
  ('credits', 'Credits System', 'ခရက်ဒစ်စနစ်', 'Credit purchasing and management', 'ခရက်ဒစ်ဝယ်ယူခြင်းနှင့် စီမံခန့်ခွဲခြင်း', 'CreditCard', 'monetization', 7, 'active', true),
  ('achievements', 'Achievements', 'အောင်မြင်မှုများ', 'Gamification with badges and rewards', 'တံဆိပ်များနှင့် ဆုလာဘ်များပါဝင်သော ဂိမ်းဆန်မှု', 'Trophy', 'engagement', 8, 'active', true);

-- Seed Sub-Features
INSERT INTO public.feature_flags (feature_key, parent_feature_key, feature_name, feature_name_my, icon, category, sort_order, status, is_enabled) VALUES
  ('course_enrollment', 'courses', 'Course Enrollment', 'သင်တန်းစာရင်းသွင်းခြင်း', 'UserPlus', 'learning', 1, 'active', true),
  ('course_progress', 'courses', 'Progress Tracking', 'တိုးတက်မှုခြေရာခံ', 'TrendingUp', 'learning', 2, 'active', true),
  ('certificates', 'courses', 'Certificates', 'လက်မှတ်များ', 'Award', 'learning', 3, 'active', true),
  ('ai_content_library', 'ai_content', 'Content Library', 'အကြောင်းအရာစာကြည့်တိုက်', 'Library', 'ai_tools', 1, 'active', true),
  ('ai_web_search', 'ai_content', 'Web Search Integration', 'ဝဘ်ရှာဖွေမှု ပေါင်းစပ်ခြင်း', 'Search', 'ai_tools', 2, 'active', true),
  ('cr_blueprint_gen', 'creator_rocket', 'Blueprint Generation', 'Blueprint ထုတ်လုပ်ခြင်း', 'FileText', 'ai_tools', 1, 'active', true),
  ('cr_premium', 'creator_rocket', 'Premium Analysis', 'Premium ခွဲခြမ်းစိတ်ဖြာခြင်း', 'Crown', 'ai_tools', 2, 'active', true),
  ('cr_sharing', 'creator_rocket', 'Blueprint Sharing', 'Blueprint မျှဝေခြင်း', 'Share2', 'ai_tools', 3, 'active', true),
  ('workspace_tasks', 'team_workspace', 'Task Management', 'လုပ်ငန်းစီမံခန့်ခွဲမှု', 'CheckSquare', 'collaboration', 1, 'active', true),
  ('workspace_team', 'team_workspace', 'Team Members', 'အဖွဲ့ဝင်များ', 'Users', 'collaboration', 2, 'active', true),
  ('workspace_leaderboard', 'team_workspace', 'Leaderboard', 'အဆင့်ဇယား', 'BarChart3', 'collaboration', 3, 'active', true),
  ('credit_purchase', 'credits', 'Credit Purchase', 'ခရက်ဒစ်ဝယ်ယူခြင်း', 'ShoppingCart', 'monetization', 1, 'active', true),
  ('credit_analytics', 'credits', 'Credit Analytics', 'ခရက်ဒစ်ခွဲခြမ်းစိတ်ဖြာခြင်း', 'PieChart', 'monetization', 2, 'active', true),
  ('referral_tracking', 'referrals', 'Referral Tracking', 'မိတ်ဆက်မှုခြေရာခံ', 'Eye', 'engagement', 1, 'active', true),
  ('referral_rewards', 'referrals', 'Credit Rewards', 'ခရက်ဒစ်ဆုလာဘ်များ', 'Gift', 'engagement', 2, 'active', true);