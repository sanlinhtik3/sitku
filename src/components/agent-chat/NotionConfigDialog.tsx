import { useState, useEffect, useCallback } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { BookOpen, Loader2, CheckCircle, Trash2, ExternalLink } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";

interface NotionConfigDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: string;
}

export function NotionConfigDialog({ open, onOpenChange, userId }: NotionConfigDialogProps) {
  const [isConnecting, setIsConnecting] = useState(false);
  const [isDisconnecting, setIsDisconnecting] = useState(false);
  const [hasExisting, setHasExisting] = useState(false);
  const [workspaceName, setWorkspaceName] = useState<string | null>(null);
  const queryClient = useQueryClient();

  // Load existing connection status (without exposing raw token)
  useEffect(() => {
    if (!open || !userId) return;
    (async () => {
      const { data } = await supabase
        .from("ai_user_settings")
        .select("notion_workspace_name")
        .eq("user_id", userId)
        .maybeSingle();
      // If workspace name exists, the OAuth flow completed successfully
      const connected = !!(data as any)?.notion_workspace_name;
      setHasExisting(connected);
      setWorkspaceName(connected ? (data as any).notion_workspace_name : null);
    })();
  }, [open, userId]);

  // Check for OAuth callback result in URL — also invalidate caches
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("notion_connected") === "true") {
      toast.success("Notion connected successfully! 🎉");
      setHasExisting(true);
      // Invalidate all relevant caches so BeeBot picks up new state
      queryClient.invalidateQueries({ queryKey: ["user-ai-settings"] });
      queryClient.invalidateQueries({ queryKey: ["intelligence-status"] });
      // Clean URL
      window.history.replaceState({}, "", window.location.pathname);
    }
    const notionError = params.get("notion_error");
    if (notionError) {
      toast.error(`Notion connection failed: ${notionError}`);
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, [queryClient]);

  const handleConnect = useCallback(async () => {
    setIsConnecting(true);
    try {
      // Get current session token for auth
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        toast.error("Please log in first");
        setIsConnecting(false);
        return;
      }

      // Build the function URL directly — bypasses preview fetch proxy
      const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const functionUrl = `${supabaseUrl}/functions/v1/notion-oauth-start`;

      const resp = await fetch(functionUrl, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${session.access_token}`,
          "apikey": import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          "Content-Type": "application/json",
        },
      });

      if (!resp.ok) {
        const errData = await resp.json().catch(() => ({}));
        throw new Error(errData.error || `Request failed (${resp.status})`);
      }

      const data = await resp.json().catch(() => ({} as { url?: string }));
      if (data?.url) {
        window.location.href = data.url;
      } else {
        toast.error("Failed to generate Notion authorization URL");
        setIsConnecting(false);
      }
    } catch (err: any) {
      toast.error(err.message || "Failed to start Notion connection");
      setIsConnecting(false);
    }
  }, []);

  const handleDisconnect = useCallback(async () => {
    setIsDisconnecting(true);
    try {
      const { error } = await supabase
        .from("ai_user_settings")
        .update({ notion_api_key: null, notion_workspace_name: null } as any)
        .eq("user_id", userId);
      if (error) throw error;
      toast.success("Notion disconnected");
      setHasExisting(false);
      setWorkspaceName(null);
      // Invalidate caches
      queryClient.invalidateQueries({ queryKey: ["user-ai-settings"] });
      queryClient.invalidateQueries({ queryKey: ["intelligence-status"] });
    } catch (err: any) {
      toast.error(err.message || "Failed to disconnect");
    } finally {
      setIsDisconnecting(false);
    }
  }, [userId, queryClient]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md bg-background/95 backdrop-blur-2xl border-border/30 rounded-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg">
            <div className="h-9 w-9 rounded-xl bg-purple-500/10 flex items-center justify-center">
              <BookOpen className="h-5 w-5 text-purple-400" />
            </div>
            Notion Integration
          </DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground">
            Connect your Notion workspace so BeeBot can search, create, and edit pages.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          {hasExisting ? (
            <>
              {/* Connected State */}
              <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
                <CheckCircle className="h-5 w-5 text-emerald-400 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-emerald-300">Connected</p>
                  {workspaceName && (
                    <p className="text-xs text-emerald-400/70 truncate">{workspaceName}</p>
                  )}
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleDisconnect}
                  disabled={isDisconnecting}
                  className="h-8 px-3 text-destructive/70 hover:text-destructive hover:bg-destructive/10"
                >
                  {isDisconnecting ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Trash2 className="h-3.5 w-3.5" />
                  )}
                </Button>
              </div>

              <p className="text-xs text-muted-foreground/60">
                BeeBot can now search, create, and edit your Notion pages and databases.
              </p>
            </>
          ) : (
            <>
              {/* Not Connected State */}
              <div className="text-center py-4 space-y-4">
                <div className="mx-auto h-16 w-16 rounded-2xl bg-purple-500/10 flex items-center justify-center">
                  <BookOpen className="h-8 w-8 text-purple-400" />
                </div>
                <div className="space-y-1">
                  <p className="text-sm font-medium text-foreground/80">
                    Connect your Notion workspace
                  </p>
                  <p className="text-xs text-muted-foreground">
                    One-click authorization — no API tokens needed
                  </p>
                </div>
                <Button
                  onClick={handleConnect}
                  disabled={isConnecting}
                  className="w-full bg-purple-600 hover:bg-purple-700 text-white"
                >
                  {isConnecting ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : (
                    <ExternalLink className="h-4 w-4 mr-2" />
                  )}
                  Connect with Notion
                </Button>
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
