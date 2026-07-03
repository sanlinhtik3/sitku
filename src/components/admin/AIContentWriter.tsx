import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Sparkles, Settings, HelpCircle } from "lucide-react";
import { AIContentWriterHelpDialog } from "./AIContentWriterHelpDialog";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { AIContentLibrary } from "./AIContentLibrary";
import { ContentEditorDialog } from "./ContentEditorDialog";
import { Separator } from "@/components/ui/separator";
import { useUserCredits } from "@/hooks/useUserCredits";
import { useProPlan } from "@/hooks/useProPlan";
import { useAuth } from "@/hooks/useAuth";
import { BuyCreditsModal } from "./BuyCreditsModal";
import { AdminTestingCredits } from "./AdminTestingCredits";
import { AIContentApiKeyDialog } from "@/components/ai-content/AIContentApiKeyDialog";
import { useQuery } from "@tanstack/react-query";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { CreditsExhaustedDialog, CreditsExhaustedError } from "@/components/CreditsExhaustedDialog";

// Import refactored components
import {
  PromptInputSection,
  OptionsGrid,
  SearchStatusIndicator,
  CreditSourceWidget,
  GenerateButton,
  PreviewSection,
  AlertBanners,
} from "./ai-writer";

interface AIContentWriterProps {
  showLibrary?: boolean;
}

export const AIContentWriter = ({ showLibrary = true }: AIContentWriterProps) => {
  const { user, isAdmin } = useAuth();
  const { balance, hasCredits } = useUserCredits(user?.id);
  const { remainingUses: dailyRemaining, isPro, proCredits, creditBalance } = useProPlan();
  const isOnline = useOnlineStatus();
  const promptRef = useRef<HTMLTextAreaElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  
  const [prompt, setPrompt] = useState("");
  const [tone, setTone] = useState("professional");
  const [style, setStyle] = useState("blog post");
  const [language, setLanguage] = useState("myanmar");
  const [category, setCategory] = useState("general");
  const [tags, setTags] = useState("");
  const [generatedContent, setGeneratedContent] = useState("");
  const [loading, setLoading] = useState(false);
  const [knowledgeBaseCount, setKnowledgeBaseCount] = useState(0);
  const [selectedKnowledgeBase, setSelectedKnowledgeBase] = useState<any[]>([]);
  const [searchStatus, setSearchStatus] = useState("");
  const [searchMetadata, setSearchMetadata] = useState<any>(null);
  const [editingContent, setEditingContent] = useState<any>(null);
  const [showBuyCreditsModal, setShowBuyCreditsModal] = useState(false);
  const [showApiKeyDialog, setShowApiKeyDialog] = useState(false);
  const [creditsExhaustedError, setCreditsExhaustedError] = useState<CreditsExhaustedError | null>(null);
  const [showCreditsExhaustedDialog, setShowCreditsExhaustedDialog] = useState(false);

  // Fetch admin AI settings
  const { data: aiSettings, refetch: refetchAiSettings } = useQuery({
    queryKey: ["ai-model-settings"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ai_model_settings")
        .select("*")
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) return null;
      return data;
    },
  });

  // Fetch user's personal API key status
  const { data: userAiSettings, refetch: refetchUserAiSettings } = useQuery({
    queryKey: ["ai-user-settings", user?.id],
    queryFn: async () => {
      if (!user?.id) return null;
      const { data, error } = await supabase
        .from("ai_user_settings")
        .select("*")
        .eq("user_id", user.id)
        .single();
      if (error) return null;
      return data;
    },
    enabled: !!user?.id,
  });

  // Memoized computed values
  const hasPersonalKey = useMemo(() => !!userAiSettings?.gemini_api_key, [userAiSettings]);
  const showPersonalKeySettings = useMemo(() => aiSettings?.allow_personal_api_key === true, [aiSettings]);
  const gatewayAllowed = useMemo(() => aiSettings?.allow_gateway_fallback_content !== false, [aiSettings]);
  const requirePersonalKey = useMemo(() => aiSettings?.require_personal_key === true, [aiSettings]);
  
  const totalAvailableCredits = useMemo(() => {
    if (isAdmin) return Infinity;
    return (dailyRemaining || 0) + (proCredits || 0) + (creditBalance || 0) + (balance || 0);
  }, [isAdmin, dailyRemaining, proCredits, creditBalance, balance]);
  
  const canGenerate = useMemo(() => {
    if (hasPersonalKey) return true;
    if (isAdmin) return true;
    if (gatewayAllowed && totalAvailableCredits > 0) return true;
    return false;
  }, [hasPersonalKey, isAdmin, gatewayAllowed, totalAvailableCredits]);

  const usePersonalKey = useMemo(() => hasPersonalKey && showPersonalKeySettings, [hasPersonalKey, showPersonalKeySettings]);
  const creditCost = useMemo(() => usePersonalKey ? 0 : 1, [usePersonalKey]);

  useEffect(() => {
    loadKnowledgeBaseCount();
  }, []);

  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  const loadKnowledgeBaseCount = useCallback(async () => {
    const { count } = await supabase
      .from("ai_generated_content")
      .select("*", { count: 'exact', head: true });
    if (count !== null) setKnowledgeBaseCount(count);
  }, []);

  const handlePromptChange = useCallback(() => {}, []);

  const handleOpenApiKeyDialog = useCallback(() => {
    setShowApiKeyDialog(true);
  }, []);

  const handleGenerate = useCallback(async () => {
    if (!isOnline) {
      toast.error("You're offline. Please check your internet connection.");
      return;
    }

    const currentPrompt = promptRef.current?.value || "";
    if (!currentPrompt.trim()) {
      toast.error("Please enter a prompt to generate content.");
      promptRef.current?.focus();
      return;
    }
    
    setPrompt(currentPrompt);
    
    if (requirePersonalKey && !hasPersonalKey) {
      toast.error("Personal API Key required. Please add your Gemini API key.");
      setShowApiKeyDialog(true);
      return;
    }
    
    if (!canGenerate) {
      if (!gatewayAllowed) {
        toast.error("AI Gateway is disabled. Please add your personal Gemini API key.");
        setShowApiKeyDialog(true);
      } else {
        setShowBuyCreditsModal(true);
      }
      return;
    }

    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    abortControllerRef.current = new AbortController();

    try {
      setLoading(true);
      setGeneratedContent("");
      setSelectedKnowledgeBase([]);
      setSearchStatus("Analyzing knowledge base...");
      setSearchMetadata(null);

      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        toast.error("Session expired. Please log in again.");
        return;
      }

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-content-writer`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`
          },
          body: JSON.stringify({ 
            prompt: currentPrompt.trim(), 
            tone, 
            style, 
            language, 
            category, 
            tags: tags.split(',').map(t => t.trim()).filter(t => t) 
          }),
          signal: abortControllerRef.current.signal
        }
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        
        if (response.status === 401) {
          toast.error("Session expired. Please refresh the page and log in again.");
          return;
        }
        
        if (response.status === 429 && errorData.code === 'CREDITS_EXHAUSTED') {
          setCreditsExhaustedError({
            type: errorData.type || 'credits_exhausted',
            dailyLimit: errorData.dailyLimit || 3,
            creditBalance: errorData.creditBalance || 0,
            creditsRemaining: errorData.creditsRemaining || 0,
            resetsAt: errorData.resetsAt || '',
            isPro: errorData.isPro || false,
            hasPersonalKey: errorData.hasPersonalKey || false
          });
          setShowCreditsExhaustedDialog(true);
          return;
        }
        
        if (response.status === 402) {
          toast.error("AI credits exhausted. Please contact support.");
          return;
        }
        
        if (errorData.code === 'INSUFFICIENT_CREDITS') {
          toast.error("Insufficient credits. Please purchase more credits.");
          setShowBuyCreditsModal(true);
          return;
        }
        
        if (errorData.code === 'USAGE_CHECK_FAILED') {
          toast.error("Unable to verify your credits. Please refresh and try again.");
          return;
        }
        
        throw new Error(errorData.error || `Failed to generate: ${response.status}`);
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error("Failed to initialize stream reader");
      }

      const decoder = new TextDecoder();
      let buffer = '';
      let fullContent = '';

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          
          let newlineIndex: number;
          while ((newlineIndex = buffer.indexOf('\n')) !== -1) {
            let line = buffer.slice(0, newlineIndex);
            buffer = buffer.slice(newlineIndex + 1);
            
            if (line.endsWith('\r')) line = line.slice(0, -1);
            if (line.startsWith(':') || line.trim() === '') continue;
            
            if (line.startsWith('data: ')) {
              const data = line.slice(6).trim();
              
              try {
                const parsed = JSON.parse(data);
                
                if (parsed.error) {
                  toast.error(parsed.error);
                  continue;
                }
                
                if (parsed.content) {
                  fullContent += parsed.content;
                  setGeneratedContent(fullContent);
                  if (searchMetadata?.webSearchUsed) {
                    setSearchStatus("Synthesizing results...");
                  } else {
                    setSearchStatus("");
                  }
                } else if (parsed.knowledgeBase) {
                  setSelectedKnowledgeBase(parsed.knowledgeBase);
                } else if (parsed.searchMetadata) {
                  setSearchMetadata(parsed.searchMetadata);
                  if (parsed.searchMetadata.forceWebSearch) {
                    setSearchStatus(`⚡ Time-sensitive query detected - Fetching live data...`);
                  } else if (parsed.searchMetadata.webSearchUsed) {
                    setSearchStatus(`📊 KB Confidence: ${parsed.searchMetadata.confidence}% - Augmenting with web...`);
                  } else {
                    setSearchStatus(`✅ Using Knowledge Base (${parsed.searchMetadata.confidence}% confidence)`);
                  }
                }
              } catch (parseError) {
                buffer = line + '\n' + buffer;
                break;
              }
            }
          }
        }
        
        if (buffer.trim()) {
          const lines = buffer.split('\n');
          for (const line of lines) {
            if (!line.trim() || line.startsWith(':')) continue;
            if (line.startsWith('data: ')) {
              const data = line.slice(6).trim();
              try {
                const parsed = JSON.parse(data);
                if (parsed.content) {
                  fullContent += parsed.content;
                  setGeneratedContent(fullContent);
                } else if (parsed.knowledgeBase) {
                  setSelectedKnowledgeBase(parsed.knowledgeBase);
                } else if (parsed.searchMetadata) {
                  setSearchMetadata(parsed.searchMetadata);
                }
              } catch (e) {}
            }
          }
        }

        if (fullContent) {
          const creditTypeMsg = usePersonalKey 
            ? "(Personal API Key - FREE)" 
            : searchMetadata?.usage_type 
              ? `(${searchMetadata.usage_type === 'daily_free' ? 'Daily credit' : searchMetadata.usage_type === 'pro_credit' ? 'Pro credit' : 'Credit balance'} used)`
              : "(1 credit deducted)";
          toast.success(`Content generated successfully! ${creditTypeMsg}`);
        } else {
          toast.error("No content was generated. Please try again.");
        }
      } catch (streamError: any) {
        if (streamError.name === 'AbortError') return;
        throw streamError;
      }
    } catch (error: any) {
      if (error.name === 'AbortError') return;
      toast.error(error.message || "Failed to generate content. Please try again.");
    } finally {
      setLoading(false);
      setSearchStatus("");
      abortControllerRef.current = null;
    }
  }, [isOnline, requirePersonalKey, hasPersonalKey, canGenerate, gatewayAllowed, tone, style, language, category, tags, usePersonalKey, searchMetadata]);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(generatedContent);
    toast.success("Copied to clipboard!");
  }, [generatedContent]);

  const handleDownload = useCallback(() => {
    const blob = new Blob([generatedContent], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `content-${Date.now()}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success("Downloaded as markdown!");
  }, [generatedContent]);

  const handleSave = useCallback(() => {
    if (!generatedContent) {
      toast.error("No content to save");
      return;
    }
    setEditingContent({
      title: generatedContent.split('\n')[0] || 'Untitled',
      content: generatedContent,
      prompt: prompt,
      tone: tone,
      style: style,
      language: language,
      is_global: true,
    });
  }, [generatedContent, prompt, tone, style, language]);

  return (
    <TooltipProvider>
      <div className="space-y-3 sm:space-y-4 w-full max-w-full">
        {/* Alert Banners */}
        <AlertBanners
          requirePersonalKey={requirePersonalKey}
          hasPersonalKey={hasPersonalKey}
          gatewayAllowed={gatewayAllowed}
          showPersonalKeySettings={showPersonalKeySettings}
          hasCredits={hasCredits}
          usePersonalKey={usePersonalKey}
          isOnline={isOnline}
          onOpenApiKeyDialog={handleOpenApiKeyDialog}
        />
        
        {/* Credit/API Source + Admin Testing */}
        <div className="flex items-center gap-2 flex-wrap">
          <CreditSourceWidget 
            usePersonalKey={usePersonalKey}
            balance={balance}
            creditCost={creditCost}
            isAdmin={isAdmin}
          />
          {isAdmin && <AdminTestingCredits />}
        </div>

        {/* Unified Input Pill + Options + Generate */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 sm:gap-4">
          <div className="space-y-0">
            <PromptInputSection
              ref={promptRef}
              defaultValue={prompt}
              onChange={handlePromptChange}
              disabled={loading}
            />
            {/* Options & Generate inside a bottom bar */}
            <div className="bg-card/30 backdrop-blur-sm border border-t-0 border-border/30 rounded-b-2xl -mt-[1px] px-3 py-2.5 sm:px-4 sm:py-3 flex flex-col gap-2.5">
              <div className="flex items-center justify-between gap-2">
                <OptionsGrid
                  tone={tone}
                  setTone={setTone}
                  style={style}
                  setStyle={setStyle}
                  language={language}
                  setLanguage={setLanguage}
                  disabled={loading}
                />
                <div className="flex items-center gap-1">
                  {showPersonalKeySettings && (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 rounded-lg"
                          onClick={handleOpenApiKeyDialog}
                          aria-label={hasPersonalKey ? "Personal API Key configured" : "Add Personal API Key"}
                        >
                          <Settings className={`h-3.5 w-3.5 ${hasPersonalKey ? 'text-green-500' : 'text-muted-foreground'}`} />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>
                        {hasPersonalKey ? "Personal API Key configured" : "Add Personal API Key"}
                      </TooltipContent>
                    </Tooltip>
                  )}
                  <AIContentWriterHelpDialog />
                </div>
              </div>
              
              <SearchStatusIndicator
                searchStatus={searchStatus}
                searchMetadata={searchMetadata}
                selectedKnowledgeBase={selectedKnowledgeBase}
                loading={loading}
              />
              
              <GenerateButton
                onClick={handleGenerate}
                loading={loading}
                canGenerate={canGenerate}
                usePersonalKey={usePersonalKey}
                isOnline={isOnline}
              />
            </div>
          </div>
          
          <PreviewSection
            loading={loading}
            generatedContent={generatedContent}
            onCopy={handleCopy}
            onDownload={handleDownload}
            onSave={handleSave}
          />
        </div>
        
        {showLibrary && (
          <>
            <Separator className="my-4 sm:my-6" />
            <AIContentLibrary />
          </>
        )}
        
        {editingContent && (
          <ContentEditorDialog 
            content={editingContent} 
            open={!!editingContent} 
            onClose={() => setEditingContent(null)} 
            onSave={() => { 
              setEditingContent(null); 
              loadKnowledgeBaseCount(); 
            }} 
          />
        )}
        <BuyCreditsModal open={showBuyCreditsModal} onClose={() => setShowBuyCreditsModal(false)} />
        
        <CreditsExhaustedDialog
          open={showCreditsExhaustedDialog}
          onOpenChange={setShowCreditsExhaustedDialog}
          error={creditsExhaustedError}
          featureName="AI Content Writer"
        />
        
        {user?.id && (
          <AIContentApiKeyDialog
            open={showApiKeyDialog}
            onOpenChange={setShowApiKeyDialog}
            userId={user.id}
            onKeyUpdated={() => refetchUserAiSettings()}
          />
        )}
      </div>
    </TooltipProvider>
  );
};
