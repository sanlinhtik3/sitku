import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";

interface Notification {
  id: string;
  user_id: string;
  type: string;
  title: string;
  message: string;
  related_id: string | null;
  is_read: boolean;
  created_at: string;
}

export const useNotifications = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const { data: notifications = [], isLoading: loading } = useQuery({
    queryKey: ["notifications", user?.id],
    queryFn: async () => {
      if (!user) return [];
      const { data, error } = await supabase
        .from("notifications")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      return (data || []) as Notification[];
    },
    enabled: !!user,
    staleTime: 60_000,
    refetchOnWindowFocus: true,
  });

  const unreadCount = notifications.filter(n => !n.is_read).length;

  const markAsRead = async (notificationId: string) => {
    if (!user) return;
    const { error } = await supabase
      .from("notifications")
      .update({ is_read: true })
      .eq("id", notificationId)
      .eq("user_id", user.id);

    if (!error) {
      queryClient.setQueryData<Notification[]>(
        ["notifications", user.id],
        (old) => old?.map(n => n.id === notificationId ? { ...n, is_read: true } : n) || []
      );
    }
  };

  const markAllAsRead = async () => {
    if (!user) return;
    const { error } = await supabase
      .from("notifications")
      .update({ is_read: true })
      .eq("user_id", user.id)
      .eq("is_read", false);

    if (!error) {
      queryClient.setQueryData<Notification[]>(
        ["notifications", user.id],
        (old) => old?.map(n => ({ ...n, is_read: true })) || []
      );
    }
  };

  const refetch = () => {
    queryClient.invalidateQueries({ queryKey: ["notifications", user?.id] });
  };

  return {
    notifications,
    unreadCount,
    loading,
    markAsRead,
    markAllAsRead,
    refetch,
  };
};
