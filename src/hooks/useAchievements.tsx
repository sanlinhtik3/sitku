import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";

interface Achievement {
  id: string;
  name: string;
  description: string;
  icon: string;
  requirement_type: string;
  requirement_value: number;
  earned_at?: string;
}

export const useAchievements = () => {
  const [achievements, setAchievements] = useState<Achievement[]>([]);
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();

  useEffect(() => {
    if (!user) {
      setAchievements([]);
      setLoading(false);
      return;
    }

    fetchAchievements();

    // Subscribe to realtime updates
    const channel = supabase
      .channel('user-achievements')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'user_achievements',
          filter: `user_id=eq.${user.id}`
        },
        () => {
          fetchAchievements();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user]);

  const fetchAchievements = async () => {
    if (!user) return;

    // Get all achievements with earned status
    const { data: allAchievements } = await supabase
      .from("achievements")
      .select("*")
      .order("requirement_value", { ascending: true });

    const { data: userAchievements } = await supabase
      .from("user_achievements")
      .select("achievement_id, earned_at")
      .eq("user_id", user.id);

    if (allAchievements && userAchievements) {
      const achievementsWithStatus = allAchievements.map(achievement => {
        const earned = userAchievements.find(ua => ua.achievement_id === achievement.id);
        return {
          ...achievement,
          earned_at: earned?.earned_at
        };
      });
      
      setAchievements(achievementsWithStatus);
    }
    setLoading(false);
  };

  const earnedAchievements = achievements.filter(a => a.earned_at);
  const lockedAchievements = achievements.filter(a => !a.earned_at);

  return {
    achievements,
    earnedAchievements,
    lockedAchievements,
    loading
  };
};
