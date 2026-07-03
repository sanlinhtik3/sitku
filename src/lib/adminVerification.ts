import { supabase } from "@/integrations/supabase/client";

/**
 * Server-side admin verification helper
 * Use this for critical operations that require admin privileges
 */
export async function verifyAdminAccess(userId: string): Promise<boolean> {
  try {
    const { data, error } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', userId)
      .eq('role', 'admin')
      .maybeSingle();

    if (error) {
      console.error('Error verifying admin access:', error);
      return false;
    }

    return !!data;
  } catch (error) {
    console.error('Exception verifying admin access:', error);
    return false;
  }
}

/**
 * Verify admin access with detailed logging
 * Use for debugging authentication issues
 */
export async function verifyAdminAccessDetailed(userId: string): Promise<{
  isAdmin: boolean;
  hasRole: boolean;
  error?: string;
}> {
  try {
    // Check if user exists in profiles
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('user_id, is_banned')
      .eq('user_id', userId)
      .maybeSingle();

    if (profileError) {
      return {
        isAdmin: false,
        hasRole: false,
        error: `Profile error: ${profileError.message}`
      };
    }

    if (!profile) {
      return {
        isAdmin: false,
        hasRole: false,
        error: 'Profile not found'
      };
    }

    if (profile.is_banned) {
      return {
        isAdmin: false,
        hasRole: false,
        error: 'User is banned'
      };
    }

    // Check admin role
    const { data: roleData, error: roleError } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', userId)
      .eq('role', 'admin')
      .maybeSingle();

    if (roleError) {
      return {
        isAdmin: false,
        hasRole: false,
        error: `Role error: ${roleError.message}`
      };
    }

    return {
      isAdmin: !!roleData,
      hasRole: !!roleData,
      error: roleData ? undefined : 'No admin role found'
    };
  } catch (error) {
    return {
      isAdmin: false,
      hasRole: false,
      error: `Exception: ${error instanceof Error ? error.message : 'Unknown error'}`
    };
  }
}

/**
 * Ensure user has admin role in database
 * Only use for development/testing - not for production
 */
export async function ensureAdminRole(userId: string): Promise<boolean> {
  try {
    // Check if admin role already exists
    const { data: existing } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', userId)
      .eq('role', 'admin')
      .maybeSingle();

    if (existing) {
      return true;
    }

    // Insert admin role
    const { error } = await supabase
      .from('user_roles')
      .insert({ user_id: userId, role: 'admin' });

    if (error) {
      console.error('Failed to insert admin role:', error);
      return false;
    }

    return true;
  } catch (error) {
    console.error('Exception ensuring admin role:', error);
    return false;
  }
}
