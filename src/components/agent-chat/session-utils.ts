// Session grouping utility extracted from ChatSessionSidebar
import { format, isToday, isYesterday, isThisWeek } from "date-fns";
import type { AgentChatSession } from "@/hooks/useAgentChat";

export function groupSessionsByDate(sessions: AgentChatSession[]): Record<string, AgentChatSession[]> {
  const groups: Record<string, AgentChatSession[]> = {};

  sessions.forEach((session) => {
    const date = new Date(session.last_message_at || session.created_at);
    let group: string;

    if (isToday(date)) {
      group = "Today";
    } else if (isYesterday(date)) {
      group = "Yesterday";
    } else if (isThisWeek(date)) {
      group = "This Week";
    } else {
      group = format(date, "MMMM yyyy");
    }

    if (!groups[group]) {
      groups[group] = [];
    }
    groups[group].push(session);
  });

  return groups;
}
