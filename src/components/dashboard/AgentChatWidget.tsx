import { memo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Sparkles, Zap } from "lucide-react";

interface AgentChatWidgetProps {
  userId: string;
  onClick: () => void;
  delay?: number;
  totalSessions?: number;
  todayMessages?: number;
  isLoading?: boolean;
}

export const AgentChatWidget = memo(({ userId, onClick, delay = 0, totalSessions = 0, todayMessages = 0, isLoading = false }: AgentChatWidgetProps) => {
  return (
    <div
      className="h-full animate-fade-in transition-transform duration-200 hover:scale-[1.02] active:scale-[0.98]"
      style={{ animationDelay: `${delay * 1000}ms`, animationFillMode: "backwards" }}
    >
      <Card
        className="cursor-pointer transition-all duration-300 border-border/30 bg-card/30 backdrop-blur-xl hover:border-primary/20 hover:shadow-[0_0_30px_hsl(var(--primary)/0.08)] group h-full overflow-hidden relative rounded-2xl"
        onClick={onClick}
      >
        {/* Hover gradient */}
        <div className="absolute inset-0 bg-gradient-to-br from-purple-500/[0.05] via-transparent to-indigo-500/[0.05] opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
        
        {/* Particles */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-2 right-4 h-1 w-1 rounded-full bg-purple-500/40 animate-pulse" />
          <div className="absolute bottom-4 right-2 h-1 w-1 rounded-full bg-indigo-500/30 animate-pulse delay-300" />
        </div>

        <CardContent className="p-2.5 sm:p-4 relative">
          {/* Mobile: horizontal compact | Desktop: vertical like others */}
          <div className="flex flex-row sm:flex-col items-center sm:text-center gap-3 sm:gap-3">
            <div className="relative p-3 sm:p-3.5 rounded-2xl transition-transform group-hover:scale-110 bg-gradient-to-br from-purple-500 via-indigo-500 to-purple-600 shadow-lg shadow-purple-500/30 shrink-0">
              <Sparkles className="h-5 w-5 sm:h-7 sm:w-7 text-white" />
              <div className="absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full border-2 border-card bg-green-500 flex items-center justify-center">
                <Zap className="h-2 w-2 text-white" />
              </div>
            </div>
            <div className="min-w-0 flex-1 sm:w-full">
              <p className="text-[11px] sm:text-xs font-medium text-muted-foreground truncate">AI Assistant</p>
              <div className="flex items-center gap-2 sm:justify-center mt-0.5">
                <p className="text-lg sm:text-xl font-bold bg-gradient-to-r from-purple-400 to-indigo-400 bg-clip-text text-transparent">
                  {isLoading ? "..." : totalSessions}
                </p>
                <span className="text-[10px] text-muted-foreground/60 sm:hidden">sessions</span>
              </div>
              <div className="flex items-center gap-1.5 sm:justify-center mt-0.5">
                <Zap className="h-3 w-3 text-purple-500 shrink-0" />
                <p className="text-[10px] text-muted-foreground/80 truncate">
                  {isLoading ? "..." : `${todayMessages} today`}
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
});

AgentChatWidget.displayName = "AgentChatWidget";
