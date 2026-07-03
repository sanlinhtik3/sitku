 import { useParams, Link } from "react-router-dom";
 import { useQuery } from "@tanstack/react-query";
 import { supabase } from "@/integrations/supabase/client";
 import { format } from "date-fns";
 import { Bot, ArrowRight, AlertCircle } from "lucide-react";
 import { Button } from "@/components/ui/button";
 import { Badge } from "@/components/ui/badge";
 import { MarkdownContent } from "@/components/lesson/MarkdownContent";
 
 export default function SharedBeeBot() {
   const { uid } = useParams<{ uid: string }>();
 
   const { data: message, isLoading, error } = useQuery({
     queryKey: ["shared-beebot", uid],
     queryFn: async () => {
       if (!uid) throw new Error("No share ID");
 
       const { data, error } = await supabase
         .from("agent_chat_messages")
         .select("id, content, created_at, shared_at, is_shared, share_uid")
         .eq("share_uid", uid)
         .eq("is_shared", true)
         .single();
 
       if (error) throw error;
       return data;
     },
     enabled: !!uid,
     retry: false,
   });
 
   // Not found state
   if (!isLoading && (error || !message)) {
     return (
       <div className="min-h-screen bg-background flex items-center justify-center p-4">
         <div className="max-w-md w-full text-center space-y-6">
           <div className="w-16 h-16 rounded-2xl bg-muted/50 flex items-center justify-center mx-auto">
             <AlertCircle className="h-8 w-8 text-muted-foreground" />
           </div>
           <div className="space-y-2">
             <h1 className="text-2xl font-bold">Message Not Found</h1>
             <p className="text-muted-foreground">
               This shared message no longer exists or has been made private.
             </p>
           </div>
           <Button asChild>
             <Link to="/">
               Go to ZoeCrypto
               <ArrowRight className="h-4 w-4 ml-2" />
             </Link>
           </Button>
         </div>
       </div>
     );
   }
 
   // Loading state
    if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="flex flex-col gap-3 w-48">
          <div className="h-3 rounded-md bg-muted/30 animate-pulse" />
          <div className="h-3 rounded-md bg-muted/30 animate-pulse w-4/5" />
          <div className="h-3 rounded-md bg-muted/30 animate-pulse w-3/5" />
        </div>
      </div>
    );
  }
 
   const sharedDate = message?.shared_at 
     ? format(new Date(message.shared_at), "MMM d, yyyy") 
     : null;
 
   return (
     <div className="min-h-screen bg-background">
       {/* Header */}
       <header className="border-b border-border/50 bg-background/95 backdrop-blur sticky top-0 z-10">
         <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
           <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary/80 to-primary flex items-center justify-center shadow-lg shadow-primary/20">
               <span className="text-xl">🐝</span>
             </div>
             <div>
               <h1 className="font-semibold">BeeBot Response</h1>
               <p className="text-xs text-muted-foreground">Shared from ZoeCrypto</p>
             </div>
           </div>
           <Button variant="outline" size="sm" asChild>
             <Link to="/">
               Visit ZoeCrypto
             </Link>
           </Button>
         </div>
       </header>
 
       {/* Content */}
       <main className="max-w-4xl mx-auto px-4 py-8">
         <article className="bg-card/50 border border-border/50 rounded-2xl p-6 sm:p-8">
           {/* Message content */}
            <MarkdownContent content={message?.content || ""} />
 
           {/* Meta info */}
           <div className="mt-8 pt-6 border-t border-border/50 flex items-center justify-between">
             <div className="flex items-center gap-2 text-xs text-muted-foreground">
               {sharedDate && <span>Shared on {sharedDate}</span>}
             </div>
             <Badge variant="secondary" className="text-xs">
               🐝 BeeBot
             </Badge>
           </div>
         </article>
 
         {/* CTA Footer */}
         <div className="mt-8 p-6 bg-gradient-to-br from-primary/5 to-primary/10 border border-primary/20 rounded-2xl text-center">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary/80 to-primary flex items-center justify-center mx-auto mb-4 shadow-lg shadow-primary/20">
             <span className="text-2xl">🐝</span>
           </div>
           <h2 className="text-xl font-semibold mb-2">Try BeeBot</h2>
           <p className="text-muted-foreground mb-4 text-sm">
             Your personalized Agentic AI assistant for content creation, 
             financial tracking, and more.
           </p>
           <Button asChild>
             <Link to="/auth">
               Get Started Free
               <ArrowRight className="h-4 w-4 ml-2" />
             </Link>
           </Button>
         </div>
       </main>
 
       {/* Footer */}
       <footer className="border-t border-border/50 mt-16">
         <div className="max-w-4xl mx-auto px-4 py-6 text-center text-sm text-muted-foreground">
           <p>© {new Date().getFullYear()} ZoeCrypto. All rights reserved.</p>
         </div>
       </footer>
     </div>
   );
 }