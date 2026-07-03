 import { useState } from "react";
import { 
   RefreshCw, 
    Volume2, 
    VolumeX,
    Copy, 
    Share2,
   ThumbsUp, 
   ThumbsDown, 
   MoreHorizontal,
   Flag,
   FileDown,
   Loader2,
   Link2,
   Trash2,
   MessageSquarePlus
 } from "lucide-react";
 import { cn } from "@/lib/utils";
 import { AgentChatMessage } from "@/hooks/useAgentChat";
 import { useTextToSpeech } from "@/hooks/useTextToSpeech";
import { exportMessageAsPdf } from "@/lib/exportMessagePdf";
import { exportAsWord, exportAsMarkdown } from "@/lib/exportUtils";
 import { supabase } from "@/integrations/supabase/client";
 import { toast } from "sonner";
 import { format } from "date-fns";
 import {
   Tooltip,
   TooltipContent,
   TooltipProvider,
   TooltipTrigger,
 } from "@/components/ui/tooltip";
 import {
   DropdownMenu,
   DropdownMenuContent,
   DropdownMenuItem,
   DropdownMenuTrigger,
 } from "@/components/ui/dropdown-menu";
 // Note: UserFeedbackDialog doesn't accept default props, using direct dialog
 import {
   Dialog,
   DialogContent,
   DialogHeader,
   DialogTitle,
 } from "@/components/ui/dialog";
 import { Button } from "@/components/ui/button";
 import { Textarea } from "@/components/ui/textarea";
import { ShareMessageDialog } from "./ShareMessageDialog";
 
export interface MessageActionBarProps {
  message: AgentChatMessage;
  onRegenerate?: () => void;
  onDelete?: () => void;
  botName?: string;
  onMessageUpdate?: (updates: Partial<AgentChatMessage>) => void;
  onOpenThread?: (messageId: string) => void;
  isThreadActive?: boolean;
  threadReplyCount?: number;
}

export function MessageActionBar({ 
  message, 
  onRegenerate,
  onDelete,
  botName = "BeeBot",
  onMessageUpdate,
  onOpenThread,
  isThreadActive,
  threadReplyCount,
}: MessageActionBarProps) {
   const { toggle, isSpeaking, isSupported: ttsSupported } = useTextToSpeech();
    const [isCopied, setIsCopied] = useState(false);
   const [feedbackOpen, setFeedbackOpen] = useState(false);
   const [reportText, setReportText] = useState("");
   const [isSubmitting, setIsSubmitting] = useState(false);
  const [shareDialogOpen, setShareDialogOpen] = useState(false);
  const [localIsShared, setLocalIsShared] = useState(message.is_shared || false);
  const [localShareUid, setLocalShareUid] = useState(message.share_uid || null);
 
   // Don't show for empty content
   if (!message.content?.trim()) return null;
 
   const handleCopy = async () => {
     try {
       await navigator.clipboard.writeText(message.content);
       setIsCopied(true);
       toast.success("Copied to clipboard");
       setTimeout(() => setIsCopied(false), 2000);
     } catch {
       toast.error("Failed to copy");
     }
   };
 
   const handleShare = async () => {
    // Open share dialog for link management
    setShareDialogOpen(true);
  };
 
  const handleShareChange = (isShared: boolean, shareUid: string | null) => {
    setLocalIsShared(isShared);
    setLocalShareUid(shareUid);
    onMessageUpdate?.({ is_shared: isShared, share_uid: shareUid });
   };
 
  
   const handleExportPdf = () => {
     try {
       exportMessageAsPdf(message.content, message.created_at, botName);
       toast.success("PDF exported");
     } catch (error) {
       console.error("PDF export error:", error);
       toast.error("Failed to export PDF");
     }
   };
 
   const handleSubmitReport = async () => {
     if (!reportText.trim()) {
       toast.error("Please describe the issue");
       return;
     }
     
     setIsSubmitting(true);
     try {
       const { data: { user } } = await supabase.auth.getUser();
       if (!user) {
         toast.error("Please sign in to report issues");
         return;
       }
       
       const { error } = await supabase.from('user_feedback').insert([{
         user_id: user.id,
         feedback_type: 'bug',
        title: 'BeeBot Response Issue',
         description: reportText,
        page_url: window.location.href,
        error_details: {
           message_id: message.id,
           content_preview: message.content.slice(0, 200),
           source: 'beebot_action_bar'
        },
        severity: 'medium'
       }]);
       
       if (error) throw error;
       
       toast.success("Report submitted. Thank you!");
       setFeedbackOpen(false);
       setReportText("");
     } catch (error) {
       console.error("Submit report error:", error);
       toast.error("Failed to submit report");
     } finally {
       setIsSubmitting(false);
     }
   };
 
   const handleAudio = () => {
     toggle(message.content);
   };
 
   const ActionButton = ({ 
     onClick, 
     disabled, 
     active, 
     activeColor,
     tooltip, 
     children 
   }: { 
     onClick: () => void; 
     disabled?: boolean;
     active?: boolean;
     activeColor?: 'green' | 'purple';
     tooltip: string; 
     children: React.ReactNode;
   }) => (
     <Tooltip>
       <TooltipTrigger asChild>
         <button
           onClick={onClick}
           disabled={disabled}
           className={cn(
             "p-1.5 rounded-md transition-all duration-150",
             "hover:bg-muted/50 focus:outline-none focus:ring-1 focus:ring-primary/30",
             "disabled:opacity-40 disabled:cursor-not-allowed",
             active && activeColor === 'green' && "text-green-500 bg-green-500/10",
             
             active && activeColor === 'purple' && "text-purple-500 bg-purple-500/10",
             !active && "text-muted-foreground hover:text-foreground"
           )}
         >
           {children}
         </button>
       </TooltipTrigger>
       <TooltipContent side="bottom" className="text-xs">
         {tooltip}
       </TooltipContent>
     </Tooltip>
   );
 
   return (
     <TooltipProvider delayDuration={300}>
       <div className="flex items-center gap-0.5 mt-2">
         {/* Regenerate */}
         {onRegenerate && (
           <ActionButton onClick={onRegenerate} tooltip="Regenerate">
             <RefreshCw className="h-3.5 w-3.5" />
           </ActionButton>
         )}
 
         {/* Audio - only show if TTS supported */}
         {ttsSupported && (
           <ActionButton 
             onClick={handleAudio} 
             tooltip={isSpeaking ? "Stop" : "Listen"}
             active={isSpeaking}
             activeColor="purple"
           >
             {isSpeaking ? (
               <VolumeX className="h-3.5 w-3.5" />
             ) : (
               <Volume2 className="h-3.5 w-3.5" />
             )}
           </ActionButton>
         )}
 
         {/* Copy */}
         <ActionButton 
           onClick={handleCopy} 
           tooltip={isCopied ? "Copied!" : "Copy"}
           active={isCopied}
           activeColor="green"
         >
           <Copy className="h-3.5 w-3.5" />
         </ActionButton>
 
         {/* Discuss in Thread */}
         {onOpenThread && (
           <div className="relative">
             <ActionButton
               onClick={() => onOpenThread(message.id)}
               tooltip={isThreadActive ? "Close Thread" : "Discuss in Thread"}
               active={isThreadActive}
               activeColor="purple"
             >
               <MessageSquarePlus className="h-3.5 w-3.5" />
             </ActionButton>
             {threadReplyCount && threadReplyCount > 0 ? (
               <span className="absolute -top-0.5 -right-0.5 h-3.5 min-w-[14px] px-1 rounded-full bg-primary text-primary-foreground text-[9px] font-semibold flex items-center justify-center pointer-events-none">
                 {threadReplyCount > 9 ? "9+" : threadReplyCount}
               </span>
             ) : null}
           </div>
         )}

         {/* Share - hidden on mobile, in More menu */}
         <div className="hidden sm:block">
          <ActionButton 
            onClick={handleShare} 
            tooltip={localIsShared ? "Manage Share" : "Share"}
            active={localIsShared}
            activeColor="green"
          >
            {localIsShared ? (
              <Link2 className="h-3.5 w-3.5" />
            ) : (
              <Share2 className="h-3.5 w-3.5" />
            )}
           </ActionButton>
         </div>
 
          {/* Delete */}
          {onDelete && (
            <ActionButton 
              onClick={() => {
                if (window.confirm("Delete this message?")) onDelete();
              }} 
              tooltip="Delete"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </ActionButton>
          )}

         {/* More menu */}
         <DropdownMenu>
           <DropdownMenuTrigger asChild>
             <button className={cn(
               "p-1.5 rounded-md transition-all duration-150",
               "hover:bg-muted/50 focus:outline-none focus:ring-1 focus:ring-primary/30",
               "text-muted-foreground hover:text-foreground"
             )}>
               <MoreHorizontal className="h-3.5 w-3.5" />
             </button>
           </DropdownMenuTrigger>
           <DropdownMenuContent align="end" className="min-w-[140px]">
             {/* Share - visible in menu on mobile */}
             <DropdownMenuItem onClick={handleShare} className="sm:hidden gap-2">
               <Share2 className="h-4 w-4" />
               Share
             </DropdownMenuItem>
             <DropdownMenuItem onClick={() => setFeedbackOpen(true)} className="gap-2">
               <Flag className="h-4 w-4" />
               Report Issue
             </DropdownMenuItem>
            <DropdownMenuItem onClick={handleExportPdf} className="gap-2">
                <FileDown className="h-4 w-4" />
                Export PDF
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => {
                try {
                  exportAsWord(message.content, `${botName} Response`, `beebot_${format(new Date(message.created_at), "yyyyMMdd_HHmm")}`);
                  toast.success("Word document exported");
                } catch { toast.error("Failed to export Word"); }
              }} className="gap-2">
                <FileDown className="h-4 w-4" />
                Export Word
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => {
                try {
                  exportAsMarkdown(message.content, `beebot_${format(new Date(message.created_at), "yyyyMMdd_HHmm")}`);
                  toast.success("Markdown exported");
                } catch { toast.error("Failed to export Markdown"); }
              }} className="gap-2">
                <FileDown className="h-4 w-4" />
                Export Markdown
              </DropdownMenuItem>
            </DropdownMenuContent>
         </DropdownMenu>
       </div>
 
       {/* Report Issue Dialog */}
       <Dialog open={feedbackOpen} onOpenChange={setFeedbackOpen}>
          <DialogContent className="max-w-md" aria-describedby="report-desc">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
               <Flag className="h-5 w-5 text-destructive" />
               Report Issue
             </DialogTitle>
              <p id="report-desc" className="sr-only">Report an issue with this AI response</p>
            </DialogHeader>
           <div className="space-y-4">
             <div className="p-3 rounded-lg bg-muted/50 text-xs text-muted-foreground">
               <p className="font-medium mb-1">Message Preview:</p>
               <p className="line-clamp-3">{message.content.slice(0, 150)}...</p>
             </div>
             <Textarea
               placeholder="Describe the issue with this response..."
               value={reportText}
               onChange={(e) => setReportText(e.target.value)}
               rows={4}
               className="resize-none"
             />
             <div className="flex justify-end gap-2">
               <Button 
                 variant="ghost" 
                 onClick={() => setFeedbackOpen(false)}
                 disabled={isSubmitting}
               >
                 Cancel
               </Button>
               <Button 
                 onClick={handleSubmitReport}
                 disabled={isSubmitting || !reportText.trim()}
               >
                 {isSubmitting ? (
                   <>
                     <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                     Submitting...
                   </>
                 ) : (
                   "Submit Report"
                 )}
               </Button>
             </div>
           </div>
         </DialogContent>
       </Dialog>

      {/* Share Dialog */}
      <ShareMessageDialog
        open={shareDialogOpen}
        onOpenChange={setShareDialogOpen}
        messageId={message.id}
        isShared={localIsShared}
        shareUid={localShareUid}
        onShareChange={handleShareChange}
      />
     </TooltipProvider>
   );
 }