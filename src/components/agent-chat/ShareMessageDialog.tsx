 import { useState } from "react";
 import { Link2, Copy, Lock, Unlock, ExternalLink, Loader2 } from "lucide-react";
 import {
   Dialog,
   DialogContent,
   DialogHeader,
   DialogTitle,
   DialogDescription,
 } from "@/components/ui/dialog";
 import { Button } from "@/components/ui/button";
 import { Input } from "@/components/ui/input";
 import { Badge } from "@/components/ui/badge";
 import { toast } from "sonner";
 import { supabase } from "@/integrations/supabase/client";
 import { cn } from "@/lib/utils";
 
 interface ShareMessageDialogProps {
   open: boolean;
   onOpenChange: (open: boolean) => void;
   messageId: string;
   isShared: boolean;
   shareUid: string | null;
   onShareChange: (isShared: boolean, shareUid: string | null) => void;
 }
 
 export function ShareMessageDialog({
   open,
   onOpenChange,
   messageId,
   isShared,
   shareUid,
   onShareChange,
 }: ShareMessageDialogProps) {
   const [isLoading, setIsLoading] = useState(false);
   const [isCopied, setIsCopied] = useState(false);
 
   const shareUrl = shareUid ? `${window.location.origin}/beebot/s/${shareUid}` : null;
 
   const handleCopyLink = async () => {
     if (!shareUrl) return;
     
     try {
       await navigator.clipboard.writeText(shareUrl);
       setIsCopied(true);
       toast.success("Link copied!");
       setTimeout(() => setIsCopied(false), 2000);
     } catch {
       toast.error("Failed to copy link");
     }
   };
 
   const handleToggleShare = async () => {
     setIsLoading(true);
     
     try {
       if (isShared) {
         // Unshare - set is_shared to false
         const { error } = await supabase
           .from("agent_chat_messages")
           .update({ is_shared: false })
           .eq("id", messageId);
 
         if (error) throw error;
 
         onShareChange(false, shareUid);
         toast.success("Message is now private");
         onOpenChange(false);
       } else {
         // Share - generate new UID or reuse existing
         const newUid = shareUid || generateShareUID();
         
         const { error } = await supabase
           .from("agent_chat_messages")
           .update({
             is_shared: true,
             share_uid: newUid,
             shared_at: new Date().toISOString(),
           })
           .eq("id", messageId);
 
         if (error) throw error;
 
         onShareChange(true, newUid);
         toast.success("Share link created!");
       }
     } catch (error: any) {
       console.error("Share toggle error:", error);
       toast.error(isShared ? "Failed to unshare" : "Failed to create share link");
     } finally {
       setIsLoading(false);
     }
   };
 
   const handleOpenLink = () => {
     if (shareUrl) {
       window.open(shareUrl, "_blank");
     }
   };
 
   return (
     <Dialog open={open} onOpenChange={onOpenChange}>
       <DialogContent className="max-w-md">
         <DialogHeader>
           <DialogTitle className="flex items-center gap-2">
             <Link2 className="h-5 w-5 text-primary" />
             Share BeeBot Response
           </DialogTitle>
           <DialogDescription>
             {isShared 
               ? "Anyone with this link can view this response."
               : "Create a public link to share this response."
             }
           </DialogDescription>
         </DialogHeader>
 
         <div className="space-y-4 pt-2">
           {/* Status Badge */}
           <div className="flex items-center gap-2">
             <span className="text-sm text-muted-foreground">Status:</span>
             <Badge 
               variant={isShared ? "default" : "secondary"}
              className="gap-1"
             >
               {isShared ? (
                 <>
                   <Unlock className="h-3 w-3" />
                   Public
                 </>
               ) : (
                 <>
                   <Lock className="h-3 w-3" />
                   Private
                 </>
               )}
             </Badge>
           </div>
 
           {/* Share Link (only when shared) */}
           {isShared && shareUrl && (
             <div className="space-y-2">
               <div className="flex gap-2">
                 <Input
                   value={shareUrl}
                   readOnly
                   className="text-sm font-mono bg-muted/50"
                 />
                 <Button
                   variant="outline"
                   size="icon"
                   onClick={handleCopyLink}
                   className="shrink-0"
                 >
                   <Copy className={cn("h-4 w-4", isCopied && "text-green-500")} />
                 </Button>
                 <Button
                   variant="outline"
                   size="icon"
                   onClick={handleOpenLink}
                   className="shrink-0"
                 >
                   <ExternalLink className="h-4 w-4" />
                 </Button>
               </div>
             </div>
           )}
 
           {/* Actions */}
           <div className="flex flex-col gap-2">
             <Button
               onClick={handleToggleShare}
               disabled={isLoading}
               variant={isShared ? "destructive" : "default"}
               className="w-full"
             >
               {isLoading ? (
                 <>
                   <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                   {isShared ? "Making Private..." : "Creating Link..."}
                 </>
               ) : isShared ? (
                 <>
                   <Lock className="h-4 w-4 mr-2" />
                   Make Private
                 </>
               ) : (
                 <>
                   <Link2 className="h-4 w-4 mr-2" />
                   Create Share Link
                 </>
               )}
             </Button>
           </div>
 
           {/* Warning */}
           {isShared && (
            <div className="p-3 rounded-lg bg-muted border border-border text-xs text-muted-foreground">
               <p className="flex items-start gap-2">
                 <Lock className="h-3.5 w-3.5 text-destructive shrink-0 mt-0.5" />
                 <span>
                   <strong>Warning:</strong> Making this private will immediately 
                   disable access via the share link.
                 </span>
               </p>
             </div>
           )}
         </div>
       </DialogContent>
     </Dialog>
   );
 }
 
 // Generate 8-character alphanumeric UID
 function generateShareUID(): string {
   const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
   let uid = "";
   for (let i = 0; i < 8; i++) {
     uid += chars.charAt(Math.floor(Math.random() * chars.length));
   }
   return uid;
 }