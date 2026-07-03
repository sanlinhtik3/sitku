import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface UserPreferences {
  email_notifications: boolean;
  push_notifications: boolean;
  enrollment_notifications: boolean;
  course_updates: boolean;
  theme: "light" | "dark" | "system";
  language: string;
}

export const useUserPreferences = (userId: string | undefined) => {
  const queryClient = useQueryClient();

  const { data: preferences, isLoading } = useQuery({
    queryKey: ["user-preferences", userId],
    queryFn: async () => {
      if (!userId) return null;

      const { data, error } = await supabase
        .from("user_preferences")
        .select("*")
        .eq("user_id", userId)
        .maybeSingle();

      if (error) throw error;

      // Create default preferences if none exist
      if (!data) {
        const { data: newPrefs, error: insertError } = await supabase
          .from("user_preferences")
          .insert({ user_id: userId })
          .select()
          .single();

        if (insertError) throw insertError;
        return newPrefs as UserPreferences;
      }

      return data as UserPreferences;
    },
    enabled: !!userId,
  });

  const updatePreferences = useMutation({
    mutationFn: async (updates: Partial<UserPreferences>) => {
      if (!userId) throw new Error("No user ID");

      const { error } = await supabase
        .from("user_preferences")
        .update(updates)
        .eq("user_id", userId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["user-preferences", userId] });
      toast.success("Preferences updated successfully");
    },
    onError: () => {
      toast.error("Failed to update preferences");
    },
  });

  return {
    preferences,
    isLoading,
    updatePreferences: updatePreferences.mutate,
  };
};
