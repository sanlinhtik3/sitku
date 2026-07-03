import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Search, MessageSquare, Bot, User } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDistanceToNow } from "date-fns";
import type { ChatLog } from "./types";

interface BotChatLogsTabProps {
  chatLogs: ChatLog[];
  isLoading: boolean;
}

export function BotChatLogsTab({ chatLogs, isLoading }: BotChatLogsTabProps) {
  const [searchQuery, setSearchQuery] = useState("");

  const filteredLogs = chatLogs.filter(log => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return log.message.toLowerCase().includes(q) || log.ai_reply?.toLowerCase().includes(q) || log.telegram_username?.toLowerCase().includes(q);
  });

  if (isLoading) {
    return <div className="space-y-3">{[1, 2, 3].map(i => <Card key={i} className="bg-card/50 backdrop-blur-sm border-border/50"><CardContent className="p-4"><div className="flex gap-3"><Skeleton className="h-10 w-10 rounded-full" /><div className="flex-1 space-y-2"><Skeleton className="h-4 w-24" /><Skeleton className="h-4 w-full" /></div></div></CardContent></Card>)}</div>;
  }

  return (
    <div className="space-y-4">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input placeholder="Search messages..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pl-10 bg-background/50 border-border/50" />
      </div>

      {filteredLogs.length === 0 ? (
        <Card className="bg-card/30 backdrop-blur-sm border-border/50">
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <div className="h-16 w-16 rounded-full bg-muted/50 flex items-center justify-center mb-4"><MessageSquare className="h-8 w-8 text-muted-foreground" /></div>
            <p className="text-muted-foreground font-medium">{searchQuery ? "No messages match" : "No chat logs yet"}</p>
            <p className="text-xs text-muted-foreground mt-1">{searchQuery ? "Try a different search" : "Messages appear here once your bot receives them"}</p>
          </CardContent>
        </Card>
      ) : (
        <ScrollArea className="h-[400px] sm:h-[500px]">
          <div className="space-y-3 pr-4">
            {filteredLogs.map(log => {
              const name = log.telegram_username || `User ${log.telegram_user_id.slice(-4)}`;
              const time = formatDistanceToNow(new Date(log.created_at), { addSuffix: true });
              return (
                <Card key={log.id} className="bg-card/50 backdrop-blur-sm border-border/50 overflow-hidden">
                  <CardContent className="p-3 sm:p-4 space-y-3">
                    <div className="flex gap-3">
                      <Avatar className="h-8 w-8 shrink-0 border border-border/50"><AvatarFallback className="bg-gradient-to-br from-violet-500 to-purple-500 text-white text-xs"><User className="h-4 w-4" /></AvatarFallback></Avatar>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1"><span className="font-medium text-sm truncate">@{name}</span><span className="text-xs text-muted-foreground shrink-0">{time}</span></div>
                        <p className="text-sm text-foreground/90 break-words">{log.message}</p>
                      </div>
                    </div>
                    {log.ai_reply && (
                      <div className="flex gap-3 pl-2 border-l-2 border-violet-500/30 ml-4">
                        <Avatar className="h-8 w-8 shrink-0 border border-violet-500/30"><AvatarFallback className="bg-gradient-to-br from-violet-500 to-purple-600 text-white text-xs"><Bot className="h-4 w-4" /></AvatarFallback></Avatar>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1"><span className="font-medium text-sm text-violet-400">AI Bot</span></div>
                          <p className="text-sm text-foreground/80 break-words">{log.ai_reply}</p>
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </ScrollArea>
      )}
    </div>
  );
}
