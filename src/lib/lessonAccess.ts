import { supabase } from "@/integrations/supabase/client";

export type UserRole = 'admin' | 'learner';

export interface LessonAccessInfo {
  canAccess: boolean;
  reason?: 'private' | 'premium' | 'draft' | 'unauthorized';
  message?: string;
}

/**
 * Check if a user has a specific role
 */
export async function checkUserRole(userId: string | undefined): Promise<UserRole> {
  if (!userId) return 'learner';
  
  const { data } = await supabase
    .from('user_roles')
    .select('role')
    .eq('user_id', userId)
    .single();
  
  return (data?.role as UserRole) || 'learner';
}

/**
 * Determine if a user can access a specific lesson
 */
export async function canAccessLesson(
  lesson: {
    is_published: boolean;
    is_private: boolean;
    is_locked: boolean;
    course_id: string;
  },
  userId: string | undefined,
  courseIsFree: boolean
): Promise<LessonAccessInfo> {
  // Check if published
  if (!lesson.is_published) {
    const userRole = await checkUserRole(userId);
    if (userRole !== 'admin') {
      return {
        canAccess: false,
        reason: 'draft',
        message: 'This lesson is not yet published.'
      };
    }
  }

  // Check if private (admin-only)
  if (lesson.is_private) {
    const userRole = await checkUserRole(userId);
    if (userRole !== 'admin') {
      return {
        canAccess: false,
        reason: 'private',
        message: 'This lesson is private and only accessible to administrators.'
      };
    }
  }

  // Check if locked (requires enrollment)
  if (lesson.is_locked && !courseIsFree) {
    if (!userId) {
      return {
        canAccess: false,
        reason: 'unauthorized',
        message: 'Please sign in to access this premium content.'
      };
    }

    const { data: enrollmentData } = await supabase
      .from('enrollments')
      .select('status, is_expired')
      .eq('user_id', userId)
      .eq('course_id', lesson.course_id)
      .eq('status', 'approved')
      .eq('is_expired', false)
      .single();

    if (!enrollmentData) {
      return {
        canAccess: false,
        reason: 'premium',
        message: 'This is premium content. Please enroll in the course to access this lesson.'
      };
    }
  }

  return { canAccess: true };
}

/**
 * Get badge configuration for lesson status
 */
export function getLessonStatusBadge(lesson: {
  is_published?: boolean;
  is_private?: boolean;
  is_locked?: boolean;
}): { text: string; variant: 'default' | 'secondary' | 'destructive' | 'outline'; icon?: string } | null {
  if (!lesson.is_published) {
    return { text: 'Draft', variant: 'outline', icon: 'Clock' };
  }
  if (lesson.is_private) {
    return { text: 'Private', variant: 'destructive', icon: 'Lock' };
  }
  if (lesson.is_locked) {
    return { text: 'Premium', variant: 'secondary', icon: 'Star' };
  }
  return null;
}
