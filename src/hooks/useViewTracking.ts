import { useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';

export const usePostViewTracking = (postId: string | undefined) => {
  const tracked = useRef(false);

  useEffect(() => {
    if (!postId || tracked.current) return;

    const trackView = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const user = session?.user ?? null;
        const viewSessionId = sessionStorage.getItem('session_id') || crypto.randomUUID();
        
        if (!sessionStorage.getItem('session_id')) {
          sessionStorage.setItem('session_id', viewSessionId);
        }

        // Insert view record
        await supabase.from('post_views').insert({
          post_id: postId,
          user_id: user?.id || null,
          session_id: !user ? viewSessionId : null,
        });

        // Increment view count
        await supabase.rpc('increment_post_view_count', { post_id: postId });
        
        tracked.current = true;
      } catch (error) {
        console.error('Error tracking post view:', error);
      }
    };

    // Track after 3 seconds (meaningful view)
    const timer = setTimeout(trackView, 3000);
    return () => clearTimeout(timer);
  }, [postId]);
};

export const useCourseViewTracking = (courseId: string | undefined) => {
  const tracked = useRef(false);

  useEffect(() => {
    if (!courseId || tracked.current) return;

    const trackView = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const user = session?.user ?? null;
        const viewSessionId = sessionStorage.getItem('session_id') || crypto.randomUUID();
        
        if (!sessionStorage.getItem('session_id')) {
          sessionStorage.setItem('session_id', viewSessionId);
        }

        // Insert view record
        await supabase.from('course_views').insert({
          course_id: courseId,
          user_id: user?.id || null,
          session_id: !user ? viewSessionId : null,
        });

        // Increment view count
        await supabase.rpc('increment_course_view_count', { course_id: courseId });
        
        tracked.current = true;
      } catch (error) {
        console.error('Error tracking course view:', error);
      }
    };

    // Track after 3 seconds (meaningful view)
    const timer = setTimeout(trackView, 3000);
    return () => clearTimeout(timer);
  }, [courseId]);
};
