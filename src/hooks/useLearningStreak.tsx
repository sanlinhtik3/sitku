import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import { toast } from "sonner";

interface StreakData {
  currentStreak: number;
  longestStreak: number;
  lastActivityDate: string | null;
}

export const useLearningStreak = () => {
  const [streakData, setStreakData] = useState<StreakData>({
    currentStreak: 0,
    longestStreak: 0,
    lastActivityDate: null
  });
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();

  useEffect(() => {
    if (!user) {
      setStreakData({ currentStreak: 0, longestStreak: 0, lastActivityDate: null });
      setLoading(false);
      return;
    }

    fetchStreakData();

    // Subscribe to realtime updates
    const channel = supabase
      .channel('user-statistics-changes')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'user_statistics',
          filter: `user_id=eq.${user.id}`
        },
        () => {
          fetchStreakData();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user]);

  const fetchStreakData = async () => {
    if (!user) return;

    const { data, error } = await supabase
      .from("user_statistics")
      .select("current_streak, longest_streak, last_activity_date")
      .eq("user_id", user.id)
      .maybeSingle();

    if (!error && data) {
      setStreakData({
        currentStreak: data.current_streak,
        longestStreak: data.longest_streak,
        lastActivityDate: data.last_activity_date
      });
    }
    setLoading(false);
  };

  const trackActivity = async () => {
    if (!user) return;

    try {
      const { data, error } = await supabase.functions.invoke('track-learning-activity');

      if (error) throw error;

      if (data?.currentStreak > streakData.currentStreak) {
        toast.success(`🔥 ${data.currentStreak} day streak!`);
      }

      fetchStreakData();
    } catch (error) {
      console.error('Error tracking activity:', error);
    }
  };

  return {
    ...streakData,
    loading,
    trackActivity,
    refetch: fetchStreakData
  };
};
