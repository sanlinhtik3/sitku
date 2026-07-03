import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

interface LoginAttempt {
  id: string;
  email: string;
  ip_address: string;
  user_agent: string;
  success: boolean;
  attempt_time: string;
  attempt_type: string;
}

export const useLoginHistory = (userEmail: string | undefined) => {
  return useQuery({
    queryKey: ["login-history", userEmail],
    queryFn: async () => {
      if (!userEmail) return [];

      const { data, error } = await supabase
        .from("login_attempts")
        .select("*")
        .eq("email", userEmail)
        .eq("success", true)
        .order("attempt_time", { ascending: false })
        .limit(10);

      if (error) throw error;
      return (data || []) as LoginAttempt[];
    },
    enabled: !!userEmail,
  });
};
