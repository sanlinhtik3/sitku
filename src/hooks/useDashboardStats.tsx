import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { startOfMonth, endOfMonth, format } from "date-fns";

export interface DashboardStats {
  agentChat: { totalSessions: number; todayMessages: number };
  flowState: { income: number; expense: number; net: number };
  
  easySrt: { completedCount: number };
}

const emptyStats: DashboardStats = {
  agentChat: { totalSessions: 0, todayMessages: 0 },
  flowState: { income: 0, expense: 0, net: 0 },
  
  easySrt: { completedCount: 0 },
};

export function useDashboardStats(userId: string | undefined) {
  const monthKey = format(new Date(), "yyyy-MM");

  return useQuery({
    queryKey: ["dashboard-stats", userId, monthKey],
    queryFn: async (): Promise<DashboardStats> => {
      if (!userId) return emptyStats;

      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const monthStart = startOfMonth(new Date());
      const monthEnd = endOfMonth(new Date());

      const [sessions, todayMsgs, transactions, srtCount] =
        await Promise.all([
          supabase
            .from("agent_chat_sessions")
            .select("*", { count: "exact", head: true })
            .eq("user_id", userId),
          supabase
            .from("agent_chat_messages")
            .select("*", { count: "exact", head: true })
            .eq("user_id", userId)
            .gte("created_at", today.toISOString()),
          supabase
            .from("user_transactions")
            .select("type, amount")
            .eq("user_id", userId)
            .gte("transaction_date", format(monthStart, "yyyy-MM-dd"))
            .lte("transaction_date", format(monthEnd, "yyyy-MM-dd")),
          supabase
            .from("srt_translations")
            .select("*", { count: "exact", head: true })
            .eq("user_id", userId)
            .eq("status", "completed"),
        ]);

      const income =
        transactions.data
          ?.filter((t) => t.type === "income")
          .reduce((s, t) => s + Number(t.amount), 0) || 0;
      const expense =
        transactions.data
          ?.filter((t) => t.type === "expense")
          .reduce((s, t) => s + Number(t.amount), 0) || 0;

      return {
        agentChat: {
          totalSessions: sessions.count || 0,
          todayMessages: todayMsgs.count || 0,
        },
        flowState: { income, expense, net: income - expense },
        easySrt: { completedCount: srtCount.count || 0 },
      };
    },
    enabled: !!userId,
    staleTime: 1000 * 60 * 2,
  });
}
