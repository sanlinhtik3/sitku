import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useEffect } from "react";

export const useUserCredits = (userId: string | undefined) => {
  const queryClient = useQueryClient();

  const { data: creditsData, isLoading } = useQuery({
    queryKey: ["user-credits", userId],
    queryFn: async () => {
      if (!userId) return null;

      const { data, error } = await supabase
        .from("user_credits")
        .select("*")
        .eq("user_id", userId)
        .maybeSingle();

      if (error) throw error;
      return data;
    },
    enabled: !!userId,
    staleTime: Infinity, // Realtime subscription handles updates
  });

  // Real-time subscription to balance changes
  useEffect(() => {
    if (!userId) return;

    const channel = supabase
      .channel(`user-credits-${userId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "user_credits",
          filter: `user_id=eq.${userId}`,
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ["user-credits", userId] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, queryClient]);

  const deductCredits = useMutation({
    mutationFn: async (contentId?: string) => {
      if (!userId) throw new Error("No user ID");

      const { data, error } = await supabase.rpc("deduct_generation_credits", {
        p_user_id: userId,
        p_content_id: contentId,
      });

      if (error) throw error;
      return data;
    },
    onSuccess: (data: any) => {
      if (data?.success) {
        queryClient.invalidateQueries({ queryKey: ["user-credits", userId] });
        toast.success("1 credit deducted");
      } else {
        toast.error("Insufficient credits. Please buy more credits.");
      }
    },
    onError: () => {
      toast.error("Failed to deduct credits");
    },
  });

  return {
    balance: creditsData?.balance ?? 0,
    totalEarned: creditsData?.total_earned ?? 0,
    totalSpent: creditsData?.total_spent ?? 0,
    isTrialUser: creditsData?.trial_credits_used ?? false,
    isLoading,
    hasCredits: (creditsData?.balance ?? 0) > 0,
    deductCredits: deductCredits.mutate,
  };
};
