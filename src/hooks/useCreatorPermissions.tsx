import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "@/hooks/use-toast";

interface CreatorPermissions {
  can_create_courses: boolean;
  max_courses: number;
  is_suspended: boolean;
  suspension_reason: string | null;
}

export const useCreatorPermissions = () => {
  const { user, isCreator } = useAuth();
  const [permissions, setPermissions] = useState<CreatorPermissions | null>(null);
  const [loading, setLoading] = useState(true);
  const [courseCount, setCourseCount] = useState(0);

  useEffect(() => {
    if (!user || !isCreator) {
      setLoading(false);
      return;
    }

    fetchPermissions();
    fetchCourseCount();

    // Set up realtime subscription for permission changes
    const channel = supabase
      .channel(`creator_permissions:${user.id}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'creator_permissions',
          filter: `user_id=eq.${user.id}`
        },
        (payload) => {
          setPermissions(payload.new as CreatorPermissions);
          toast({
            title: "Permissions Updated",
            description: "Your creator permissions have been updated by an admin.",
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, isCreator]);

  const fetchPermissions = async () => {
    try {
      const { data, error } = await supabase
        .from("creator_permissions")
        .select("*")
        .eq("user_id", user?.id)
        .maybeSingle();

      if (error) throw error;
      setPermissions(data);
    } catch (error) {
      console.error("Error fetching creator permissions:", error);
    } finally {
      setLoading(false);
    }
  };

  const fetchCourseCount = async () => {
    try {
      const { count, error } = await supabase
        .from("courses")
        .select("*", { count: "exact", head: true })
        .eq("created_by", user?.id);

      if (error) throw error;
      setCourseCount(count || 0);
    } catch (error) {
      console.error("Error fetching course count:", error);
    }
  };

  const canCreateCourse = useMemo(() => {
    if (!permissions) return false;
    if (permissions.is_suspended) return false;
    if (!permissions.can_create_courses) return false;
    if (courseCount >= permissions.max_courses) return false;
    return true;
  }, [permissions, courseCount]);

  const remainingSlots = useMemo(() => {
    if (!permissions) return 0;
    return Math.max(0, permissions.max_courses - courseCount);
  }, [permissions, courseCount]);

  return {
    permissions,
    loading,
    courseCount,
    canCreateCourse,
    remainingSlots,
    refresh: () => {
      fetchPermissions();
      fetchCourseCount();
    }
  };
};
