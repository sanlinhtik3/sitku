import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import * as VisuallyHidden from "@radix-ui/react-visually-hidden";
import { cn } from "@/lib/utils";
import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  Facebook, Plus, Trash2, Star, StarOff, Loader2, CheckCircle2,
  AlertCircle, ExternalLink, Eye, EyeOff, RefreshCw, X,
} from "lucide-react";

interface FacebookPage {
  id: string;
  page_id: string;
  page_name: string;
  is_active: boolean;
  is_default: boolean;
  created_at: string;
}

interface FacebookPagesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: string;
}

export function FacebookPagesDialog({ open, onOpenChange, userId }: FacebookPagesDialogProps) {
  const [pages, setPages] = useState<FacebookPage[]>([]);
  const [loading, setLoading] = useState(false);
  const [pageId, setPageId] = useState("");
  const [accessToken, setAccessToken] = useState("");
  const [showToken, setShowToken] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [verifiedName, setVerifiedName] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [showGuide, setShowGuide] = useState(false);

  const fetchPages = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from("facebook_pages")
      .select("id, page_id, page_name, is_active, is_default, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });
    setPages((data as FacebookPage[]) || []);
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    if (open) fetchPages();
  }, [open, fetchPages]);

  const verifyToken = async () => {
    if (!accessToken.trim()) {
      toast.error("Page Access Token ထည့်ပါ");
      return;
    }
    setVerifying(true);
    setVerifiedName(null);
    try {
      const { data, error } = await supabase.functions.invoke("facebook-api", {
        body: { action: "verify_token", page_access_token: accessToken.trim() },
      });
      if (error || !data?.success) {
        toast.error(data?.error || "Token verification failed");
        setVerifiedName(null);
      } else {
        setVerifiedName(data.page.name);
        setPageId(data.page.id);
        toast.success(`✅ Verified: ${data.page.name}`);
      }
    } catch (e: any) {
      toast.error(e.message || "Verification failed");
    } finally {
      setVerifying(false);
    }
  };

  const savePage = async () => {
    if (!pageId.trim() || !accessToken.trim()) {
      toast.error("Page ID နှင့် Access Token လိုအပ်ပါသည်");
      return;
    }
    setSaving(true);
    try {
      const isFirst = pages.length === 0;
      const { error } = await supabase.from("facebook_pages").upsert({
        user_id: userId,
        page_id: pageId.trim(),
        page_name: verifiedName || `Page ${pageId.trim().slice(-6)}`,
        page_access_token: accessToken.trim(),
        is_active: true,
        is_default: isFirst,
        updated_at: new Date().toISOString(),
      }, { onConflict: "user_id,page_id" });

      if (error) throw error;
      toast.success("✅ Facebook Page ချိတ်ဆက်ပြီးပါပြီ!");
      setPageId("");
      setAccessToken("");
      setVerifiedName(null);
      fetchPages();
    } catch (e: any) {
      toast.error(e.message || "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const deletePage = async (id: string) => {
    const { error } = await supabase.from("facebook_pages").delete().eq("id", id).eq("user_id", userId);
    if (error) { toast.error("Delete failed"); return; }
    toast.success("Page removed");
    fetchPages();
  };

  const toggleDefault = async (id: string) => {
    // Clear all defaults first
    await supabase.from("facebook_pages").update({ is_default: false }).eq("user_id", userId);
    await supabase.from("facebook_pages").update({ is_default: true }).eq("id", id);
    fetchPages();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[560px] p-0 bg-background/95 backdrop-blur-2xl border-border/30 rounded-2xl overflow-hidden">
        <VisuallyHidden.Root><DialogTitle>Facebook Pages</DialogTitle></VisuallyHidden.Root>

        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-6 pb-2">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-blue-500/10 flex items-center justify-center">
              <Facebook className="h-5 w-5 text-blue-400" />
            </div>
            <div>
              <h2 className="text-lg font-semibold">Facebook Pages</h2>
              <p className="text-xs text-muted-foreground">Manage connected Facebook Pages</p>
            </div>
          </div>
          <button onClick={() => onOpenChange(false)} className="p-2 rounded-lg hover:bg-muted/50 text-muted-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="px-6 pb-6 space-y-5 max-h-[70vh] overflow-y-auto">
          {/* Connected Pages */}
          {pages.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-sm font-medium text-muted-foreground">Connected Pages</h3>
              {pages.map((p) => (
                <div
                  key={p.id}
                  className={cn(
                    "flex items-center gap-3 p-3 rounded-xl border transition-all",
                    p.is_default ? "border-blue-500/30 bg-blue-500/5" : "border-border/30 bg-card/30",
                  )}
                >
                  <Facebook className="h-4 w-4 text-blue-400 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium truncate">{p.page_name}</span>
                      {p.is_default && <Badge variant="secondary" className="text-[10px] px-1.5 py-0">Default</Badge>}
                    </div>
                    <span className="text-xs text-muted-foreground">ID: {p.page_id}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => toggleDefault(p.id)}
                      className="p-1.5 rounded-lg hover:bg-muted/50 text-muted-foreground hover:text-amber-400 transition-colors"
                      title={p.is_default ? "Default page" : "Set as default"}
                    >
                      {p.is_default ? <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" /> : <StarOff className="h-3.5 w-3.5" />}
                    </button>
                    <button
                      onClick={() => deletePage(p.id)}
                      className="p-1.5 rounded-lg hover:bg-muted/50 text-muted-foreground hover:text-red-400 transition-colors"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Add Page Form */}
          <div className="space-y-3 p-4 rounded-xl border border-border/30 bg-card/30">
            <h3 className="text-sm font-medium flex items-center gap-2">
              <Plus className="h-4 w-4" /> Add Facebook Page
            </h3>

            <div className="space-y-2">
              <label className="text-xs text-muted-foreground">Page Access Token</label>
              <div className="relative">
                <Input
                  value={accessToken}
                  onChange={(e) => { setAccessToken(e.target.value); setVerifiedName(null); }}
                  placeholder="EAAxxxxxxx..."
                  type={showToken ? "text" : "password"}
                  className="pr-20 bg-background/50 border-border/30"
                />
                <div className="absolute right-1 top-1/2 -translate-y-1/2 flex items-center gap-1">
                  <button onClick={() => setShowToken(!showToken)} className="p-1 rounded hover:bg-muted/50 text-muted-foreground">
                    {showToken ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                  </button>
                </div>
              </div>
            </div>

            {verifiedName && (
              <div className="flex items-center gap-2 p-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
                <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                <span className="text-sm text-emerald-400">{verifiedName}</span>
                <span className="text-xs text-muted-foreground ml-auto">ID: {pageId}</span>
              </div>
            )}

            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={verifyToken}
                disabled={verifying || !accessToken.trim()}
                className="flex-1"
              >
                {verifying ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <RefreshCw className="h-3.5 w-3.5 mr-1" />}
                Verify Token
              </Button>
              <Button
                size="sm"
                onClick={savePage}
                disabled={saving || !accessToken.trim()}
                className="flex-1 bg-blue-600 hover:bg-blue-700"
              >
                {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <Plus className="h-3.5 w-3.5 mr-1" />}
                {verifiedName ? "Save Page" : "Save"}
              </Button>
            </div>
          </div>

          {/* Guide */}
          <div className="space-y-2">
            <button
              onClick={() => setShowGuide(!showGuide)}
              className="text-xs text-primary hover:underline flex items-center gap-1"
            >
              <AlertCircle className="h-3 w-3" />
              How to get a Page Access Token?
            </button>
            {showGuide && (
              <div className="text-xs text-muted-foreground space-y-1.5 p-3 rounded-lg bg-muted/30 border border-border/20">
                <p className="font-medium text-foreground">Step-by-step:</p>
                <ol className="list-decimal pl-4 space-y-1">
                  <li>
                    Go to{" "}
                    <a href="https://developers.facebook.com" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline inline-flex items-center gap-0.5">
                      developers.facebook.com <ExternalLink className="h-2.5 w-2.5" />
                    </a>
                  </li>
                  <li>Create a new App (Business type)</li>
                  <li>Add the "Pages" product</li>
                  <li>Go to Tools → Graph API Explorer</li>
                  <li>Select your App, then select Page token</li>
                  <li>Add permissions: <code className="px-1 py-0.5 bg-muted rounded">pages_manage_posts</code>, <code className="px-1 py-0.5 bg-muted rounded">pages_read_engagement</code></li>
                  <li>Generate and copy the Access Token</li>
                  <li>For long-lived token: exchange via Access Token Debugger</li>
                </ol>
                <p className="pt-1 text-muted-foreground/70">💡 Long-lived tokens last ~60 days. Never-expiring tokens require additional steps.</p>
              </div>
            )}
          </div>

          {/* Empty State */}
          {!loading && pages.length === 0 && (
            <div className="text-center py-6 text-muted-foreground">
              <Facebook className="h-8 w-8 mx-auto mb-2 opacity-30" />
              <p className="text-sm">No Facebook Pages connected yet</p>
              <p className="text-xs mt-1">Add your Page Access Token above to get started</p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
