import { useState, useRef, useEffect } from "react";
import { motion } from "motion/react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { IconSend, IconRobot, IconUser, IconLoader2 } from "@tabler/icons-react";
import { useFeedback } from "@/hooks/useFeedback";
import { formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils";

interface FeedbackDiscussionProps {
  feedbackId: string;
}

export function FeedbackDiscussion({ feedbackId }: FeedbackDiscussionProps) {
  const [message, setMessage] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  const { useFeedbackDiscussions, addDiscussion } = useFeedback();
  const { data: discussions, isLoading, refetch } = useFeedbackDiscussions(feedbackId);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [discussions]);

  const handleSend = async () => {
    if (!message.trim()) return;

    try {
      await addDiscussion.mutateAsync({
        feedback_id: feedbackId,
        content: message.trim(),
        author_type: 'admin',
      });
      setMessage('');
      refetch();
    } catch (error) {
      // Error handled in hook
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="flex flex-col h-[450px]">
      {/* Messages */}
      <ScrollArea ref={scrollRef} className="flex-1 p-4">
        <div className="space-y-4">
          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground">Loading discussions...</div>
          ) : discussions?.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <IconRobot className="h-10 w-10 mx-auto mb-2 opacity-30" />
              <p>No discussion yet</p>
              <p className="text-xs">Start a conversation with Super BeeBot</p>
            </div>
          ) : (
            discussions?.map((disc) => (
              <motion.div
                key={disc.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className={cn(
                  "flex gap-3",
                  disc.author_type === 'admin' ? 'flex-row-reverse' : ''
                )}
              >
                <Avatar className={cn(
                  "h-8 w-8",
                  disc.author_type === 'beebot' ? 'bg-gradient-to-br from-yellow-500 to-amber-600' :
                  disc.author_type === 'admin' ? 'bg-gradient-to-br from-blue-500 to-blue-600' :
                  'bg-muted'
                )}>
                  <AvatarFallback className="bg-transparent text-white">
                    {disc.author_type === 'beebot' ? <IconRobot className="h-4 w-4" /> :
                     disc.author_type === 'admin' ? <IconUser className="h-4 w-4" /> :
                     'S'}
                  </AvatarFallback>
                </Avatar>
                <div className={cn(
                  "flex-1 max-w-[80%]",
                  disc.author_type === 'admin' ? 'text-right' : ''
                )}>
                  <div className={cn(
                    "inline-block p-3 rounded-lg",
                    disc.author_type === 'admin' ? 'bg-primary/20 text-right' :
                    disc.author_type === 'beebot' ? 'bg-yellow-500/10 border border-yellow-500/30' :
                    'bg-muted'
                  )}>
                    <p className="text-sm whitespace-pre-wrap">{disc.content}</p>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {disc.author_type === 'beebot' ? '🐝 Super BeeBot' : 
                     disc.author_type === 'admin' ? 'Admin' : 'System'} • {' '}
                    {formatDistanceToNow(new Date(disc.created_at), { addSuffix: true })}
                  </p>
                </div>
              </motion.div>
            ))
          )}
        </div>
      </ScrollArea>

      {/* Input */}
      <div className="p-4 border-t border-border/50">
        <div className="flex gap-2">
          <Textarea
            placeholder="Type a message to Super BeeBot or add notes..."
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={handleKeyDown}
            rows={2}
            className="bg-background/50 resize-none"
          />
          <Button
            onClick={handleSend}
            disabled={!message.trim() || addDiscussion.isPending}
            className="self-end"
          >
            {addDiscussion.isPending ? (
              <IconLoader2 className="h-4 w-4 animate-spin" />
            ) : (
              <IconSend className="h-4 w-4" />
            )}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground mt-2">
          💡 Tip: Super BeeBot can read this discussion and provide insights
        </p>
      </div>
    </div>
  );
}
