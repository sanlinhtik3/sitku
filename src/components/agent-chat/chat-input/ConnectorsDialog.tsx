import { useState, useEffect, useMemo, useCallback } from "react";
import { cn } from "@/lib/utils";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import {
  MagicStick as Wand2, Global as Globe, SendSquare as Send, MagicStick3 as Sparkles, Magnifer as Search, CheckCircle as Check,
  Cpu, AltArrowLeft as ArrowLeft, Route as Router, Atom, Book2 as BookOpen,
} from "@solar-icons/react";
import { Puzzle, Facebook } from "lucide-react";
import type { ConnectorItem } from "./ConnectorsPopover";

type TabId = "apps" | "custom-api";

interface ConnectorsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  connectors: ConnectorItem[];
  onOpenApiKey: (tab?: string) => void;
  onOpenTavily: () => void;
  onOpenTelegram: () => void;
  onOpenSoulEditor: () => void;
  onOpenFacebook?: () => void;
  onOpenNotion?: () => void;
  activeTab?: TabId;
  onTabChange?: (tab: TabId) => void;
}

// Apps = actual app integrations (not API keys)
const APP_CATALOG = [
  { id: "telegram", name: "Telegram Neural Link", desc: "Connect BeeBot to Telegram for cross-platform messaging", icon: <Send className="h-5 w-5 text-violet-400" />, action: "telegram" as const },
  { id: "facebook", name: "Facebook Pages", desc: "Manage Facebook Pages — post, reply, schedule content", icon: <Facebook className="h-5 w-5 text-blue-400" />, action: "facebook" as const },
  { id: "notion", name: "Notion", desc: "Search, create, edit pages and query databases in your Notion workspace", icon: <BookOpen className="h-5 w-5 text-purple-400" />, action: "notion" as const },
  { id: "soul", name: "Soul Configuration", desc: "Customize BeeBot's personality, behavior and responses", icon: <Sparkles className="h-5 w-5 text-pink-400" />, action: "soul" as const },
] as const;

// Custom API = API key integrations plus broker-backed auth profiles
const CUSTOM_API_CATALOG = [
  { id: "gemini", name: "Google Gemini", desc: "Process multimodal content including text, images, and code", icon: <Wand2 className="h-5 w-5 text-blue-400" />, action: "apikey" as const, apiTab: "gemini" },
  { id: "tavily", name: "Tavily Web Search", desc: "Search real-time information and get accurate answers with citations", icon: <Globe className="h-5 w-5 text-emerald-400" />, action: "tavily" as const },
  { id: "anthropic", name: "Anthropic Claude", desc: "Access reliable AI assistant services with safe and intelligent conversations", icon: <Cpu className="h-5 w-5 text-orange-400" />, action: "apikey" as const, apiTab: "claude" },
  { id: "openrouter", name: "OpenRouter", desc: "Access 200+ AI models through a single API key", icon: <Router className="h-5 w-5 text-cyan-400" />, action: "apikey" as const, apiTab: "openrouter" },
  { id: "xai", name: "Grok (xAI)", desc: "xAI's powerful AI with real-time knowledge and reasoning", icon: <Atom className="h-5 w-5 text-amber-400" />, action: "apikey" as const, apiTab: "xai" },
] as const;

const TABS: { id: TabId; label: string }[] = [
  { id: "apps", label: "Apps" },
  { id: "custom-api", label: "Custom API" },
];

export function ConnectorsDialog({
  open, onOpenChange, connectors,
  onOpenApiKey, onOpenTavily, onOpenTelegram, onOpenSoulEditor, onOpenFacebook, onOpenNotion,
  activeTab: externalTab, onTabChange,
}: ConnectorsDialogProps) {
  const [internalTab, setInternalTab] = useState<TabId>("apps");
  const activeTab = externalTab ?? internalTab;
  const setActiveTab = onTabChange ?? setInternalTab;
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    if (open) setSearchQuery("");
  }, [open]);

  // Build maps from live connector data
  const connectorMap = useMemo(() => {
    const map = new Map<string, ConnectorItem>();
    for (const c of connectors) map.set(c.id, c);
    return map;
  }, [connectors]);

  const lowerQuery = searchQuery.toLowerCase();

  const filteredApps = useMemo(() =>
    APP_CATALOG.filter(a =>
      a.name.toLowerCase().includes(lowerQuery) ||
      a.desc.toLowerCase().includes(lowerQuery)
    ), [lowerQuery]);

  const filteredApis = useMemo(() =>
    CUSTOM_API_CATALOG.filter(a =>
      a.name.toLowerCase().includes(lowerQuery) ||
      a.desc.toLowerCase().includes(lowerQuery)
    ), [lowerQuery]);

  const handleAction = useCallback((item: typeof APP_CATALOG[number] | typeof CUSTOM_API_CATALOG[number]) => {
    if (item.action === "apikey" && 'apiTab' in item) {
      onOpenApiKey(item.apiTab);
    } else if (item.action === "tavily") {
      onOpenTavily();
    } else if (item.action === "telegram") {
      onOpenTelegram();
    } else if (item.action === "soul") {
      onOpenSoulEditor();
    } else if (item.action === "facebook") {
      onOpenFacebook?.();
    } else if (item.action === "notion") {
      onOpenNotion?.();
    }
  }, [onOpenApiKey, onOpenTavily, onOpenTelegram, onOpenSoulEditor, onOpenFacebook, onOpenNotion]);

  const renderCard = (item: typeof APP_CATALOG[number] | typeof CUSTOM_API_CATALOG[number]) => {
    const connector = connectorMap.get(item.id);
    const isConnected = connector?.connected ?? false;
    const isEnabled = connector?.enabled ?? false;

    return (
      <div
        key={item.id}
        className={cn(
          "flex items-start gap-3 p-4 rounded-xl border transition-all",
          isConnected && !isEnabled && "opacity-50",
          isConnected ? "border-emerald-500/30 bg-emerald-500/5" : "border-border/30 bg-card/30",
        )}
      >
        <button
          onClick={() => handleAction(item)}
          className="flex items-start gap-3 flex-1 min-w-0 text-left hover:opacity-80 transition-opacity"
        >
          <div className="shrink-0 h-10 w-10 rounded-xl bg-muted/50 flex items-center justify-center">
            {item.icon}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">{item.name}</span>
              {isConnected && isEnabled && <Check className="h-3.5 w-3.5 text-emerald-400" />}
            </div>
            <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{item.desc}</p>
          </div>
        </button>

        {/* Switch for connected connectors */}
        {isConnected && connector && (
          <div className="shrink-0 pt-1">
            <Switch
              checked={isEnabled}
              onCheckedChange={(checked) => connector.onEnabledChange?.(checked)}
              className="data-[state=checked]:bg-emerald-500 data-[state=unchecked]:bg-muted-foreground/30 h-5 w-9 [&_span]:h-4 [&_span]:w-4 [&_span]:data-[state=checked]:translate-x-4"
            />
          </div>
        )}
      </div>
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[640px] p-0 bg-background/95 backdrop-blur-2xl border-border/30 rounded-2xl overflow-hidden">
        <DialogHeader className="px-6 pt-6 pb-0">
          <div className="flex items-center justify-between">
            <DialogTitle className="text-xl font-semibold">Connectors</DialogTitle>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <input
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Search"
                className="pl-8 pr-3 py-1.5 w-40 text-sm bg-muted/50 border border-border/30 rounded-lg outline-none focus:border-primary/50 text-foreground placeholder:text-muted-foreground/60"
              />
            </div>
          </div>
          <DialogDescription className="sr-only">Manage BeeBot integrations and API connections</DialogDescription>
        </DialogHeader>

        {/* Tabs */}
        <div className="flex gap-1 px-6 pt-3 border-b border-border/30">
          {TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                "px-4 py-2 text-sm font-medium transition-colors rounded-t-lg",
                activeTab === tab.id
                  ? "text-foreground border-b-2 border-primary"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="p-6 max-h-[60vh] overflow-y-auto">
          {activeTab === "apps" && (
            <>
              <p className="text-sm text-muted-foreground mb-4 flex items-center gap-2">
                <Puzzle className="h-4 w-4" />
                Connect BeeBot to your apps and services.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {filteredApps.map(renderCard)}
              </div>
              {filteredApps.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-8">No apps found</p>
              )}
            </>
          )}

          {activeTab === "custom-api" && (
            <>
              <p className="text-sm text-muted-foreground mb-4 flex items-center gap-2">
                <Wand2 className="h-4 w-4" />
                Connect using your own API keys.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {filteredApis.map(renderCard)}
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
