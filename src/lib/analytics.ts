import { supabase } from '@/integrations/supabase/client';

export const trackEngagement = async (
  type: 'post' | 'course',
  id: string,
  engagementType: 'click' | 'share' | 'bookmark' | 'enroll_click'
) => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    const sessionId = sessionStorage.getItem('session_id') || crypto.randomUUID();

    if (type === 'post') {
      await supabase.from('post_engagements').insert({
        post_id: id,
        user_id: user?.id || null,
        engagement_type: engagementType,
        session_id: !user ? sessionId : null,
      });
    } else {
      await supabase.from('course_engagements').insert({
        course_id: id,
        user_id: user?.id || null,
        engagement_type: engagementType,
        session_id: !user ? sessionId : null,
      });
    }
  } catch (error) {
    console.error('Error tracking engagement:', error);
  }
};
