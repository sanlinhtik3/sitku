import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Shield, Loader2, CheckCircle2, Copy, Check
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import type { ChannelIdentity } from "./types";

interface SecureLinkingSectionProps {
  userId: string;
  isWebhookActive: boolean;
  isOwnerLinked: boolean;
  ownerIdentity: ChannelIdentity | null;
  setOwnerIdentity: (identity: ChannelIdentity | null) => void;
}

export function SecureLinkingSection({
  userId, isWebhookActive, isOwnerLinked, ownerIdentity, setOwnerIdentity,
}: SecureLinkingSectionProps) {
  const [linkCode, setLinkCode] = useState<string | null>(null);
  const [linkCodeExpiry, setLinkCodeExpiry] = useState<string | null>(null);
  const [isGeneratingCode, setIsGeneratingCode] = useState(false);
  const [codeCopied, setCodeCopied] = useState(false);
  const [codeCountdown, setCodeCountdown] = useState(0);

  // Countdown timer
  useEffect(() => {
    if (!linkCodeExpiry) return;
    const update = () => {
      const remaining = Math.max(0, Math.floor((new Date(linkCodeExpiry).getTime() - Date.now()) / 1000));
      setCodeCountdown(remaining);
      if (remaining <= 0) { setLinkCode(null); setLinkCodeExpiry(null); }
    };
    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [linkCodeExpiry]);

  // Auto-poll for identity verification
  useEffect(() => {
    if (!linkCode || isOwnerLinked) return;
    const poll = setInterval(async () => {
      const { data } = await supabase
        .from("channel_identities")
        .select("id, channel, external_username, is_verified")
        .eq("user_id", userId).eq("channel", "telegram").eq("is_verified", true)
        .maybeSingle();
      if (data) {
        setOwnerIdentity(data as ChannelIdentity);
        setLinkCode(null); setLinkCodeExpiry(null);
        toast.success("🛡️ Owner identity verified!");
      }
    }, 5000);
    return () => clearInterval(poll);
  }, [linkCode, isOwnerLinked, userId, setOwnerIdentity]);

  const handleGenerateLinkCode = async () => {
    setIsGeneratingCode(true);
    try {
      const { data, error } = await supabase.functions.invoke("telegram-webhook", { body: { action: "generate-link-code" } });
      if (error) throw error;
      if (!data?.ok) throw new Error(data?.error || "Failed to generate code");
      setLinkCode(data.code); setLinkCodeExpiry(data.expires_at); setCodeCopied(false);
      toast.success("Secure linking code generated!");
    } catch (err: any) {
      toast.error(err.message || "Failed to generate code");
    } finally { setIsGeneratingCode(false); }
  };

  const handleCopyCode = async () => {
    if (!linkCode) return;
    await navigator.clipboard.writeText(linkCode);
    setCodeCopied(true); toast.success("Code copied!");
    setTimeout(() => setCodeCopied(false), 2000);
  };

  return (
    <div className={cn("p-4 rounded-xl border transition-all", isOwnerLinked ? "bg-gradient-to-br from-green-500/10 to-emerald-500/5 border-green-500/30 shadow-[0_0_20px_-5px] shadow-green-500/20" : "bg-card/30 border-border/20")}>
      {isOwnerLinked ? (
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-green-500/10 border border-green-500/20 flex items-center justify-center">
            <Shield className="h-5 w-5 text-green-500" />
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <p className="text-sm font-semibold text-green-400">Owner Verified</p>
              <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
            </div>
            <p className="text-[10px] text-muted-foreground">@{ownerIdentity?.external_username || "you"} — secured via code verification</p>
          </div>
          <Badge className="text-[9px] px-2 py-0.5 bg-green-500/10 text-green-400 border-green-500/20">
            <Shield className="h-2.5 w-2.5 mr-0.5" />Secured
          </Badge>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-lg bg-muted/30 flex items-center justify-center">
              <Shield className="h-4 w-4 text-muted-foreground" />
            </div>
            <div>
              <p className="text-xs font-medium">Owner Not Linked</p>
              <p className="text-[10px] text-muted-foreground">Generate a code and send it to your bot on Telegram</p>
            </div>
          </div>

          {linkCode && codeCountdown > 0 ? (
            <div className="space-y-3 animate-fade-in">
              <div className="p-4 rounded-xl bg-gradient-to-br from-violet-500/15 to-purple-500/10 border border-violet-500/30 shadow-[0_0_25px_-5px] shadow-violet-500/20">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[10px] font-medium text-violet-400 uppercase tracking-wider">Linking Code</span>
                  <span className="text-[10px] text-muted-foreground">⏰ {Math.floor(codeCountdown / 60)}:{(codeCountdown % 60).toString().padStart(2, '0')}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-2xl font-mono font-bold tracking-[0.3em] bg-gradient-to-r from-violet-300 to-purple-300 bg-clip-text text-transparent">{linkCode}</span>
                  <Button variant="ghost" size="sm" onClick={handleCopyCode} className="h-8 px-2 gap-1.5">
                    {codeCopied ? <><Check className="h-3.5 w-3.5 text-green-500" /><span className="text-[10px] text-green-500">Copied</span></> : <><Copy className="h-3.5 w-3.5" /><span className="text-[10px]">Copy</span></>}
                  </Button>
                </div>
              </div>
              <div className="space-y-1.5 text-[10px] text-muted-foreground">
                <p>1️⃣ Open Telegram and find your bot</p>
                <p>2️⃣ Send <span className="font-mono text-violet-400">{linkCode}</span> as a message</p>
                <p>3️⃣ BeeBot will verify and link automatically</p>
              </div>
              <div className="flex items-center gap-2 p-2 rounded-lg bg-violet-500/5 border border-violet-500/10">
                <Loader2 className="h-3 w-3 animate-spin text-violet-400" />
                <span className="text-[10px] text-violet-400">Waiting for verification...</span>
              </div>
            </div>
          ) : (
            <Button variant="outline" size="sm" onClick={handleGenerateLinkCode} disabled={isGeneratingCode || !isWebhookActive} className="w-full gap-2 border-violet-500/30 hover:border-violet-500 hover:bg-violet-500/5">
              {isGeneratingCode ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Shield className="h-3.5 w-3.5" />}
              Generate Secure Linking Code
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
