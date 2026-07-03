import { useState } from "react";
import { cn } from "@/lib/utils";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import { Switch } from "@/components/ui/switch";
import {
  Global as Globe, SendSquare as Send, MagicStick3 as Sparkles, MagicStick as Wand2, AddSquare as Plus,
  CloseSquare as X, Route as Router, Atom, Settings as Settings2, Book2 as BookOpen,
} from "@solar-icons/react";
import { Puzzle, Facebook } from "lucide-react";
import { ConnectorsDialog } from "./ConnectorsDialog";

export interface ConnectorItem {
  id: string;
  name: string;
  icon: React.ReactNode;
  connected: boolean;
  enabled: boolean;
  onToggle?: () => void;
  onEnabledChange?: (enabled: boolean) => void;
}

interface ConnectorsPopoverProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  hasPersonalKey: boolean;
  hasTavilyKey?: boolean;
  hasTelegramLink?: boolean;
  hasSoulConfig?: boolean;
  hasOpenrouterKey?: boolean;
  hasXaiKey?: boolean;
  hasFacebookPages?: boolean;
  hasNotionKey?: boolean;
  
  disabledConnectors?: string[];
  onToggleConnector?: (id: string, enabled: boolean) => void;
  onOpenApiKey: (tab?: string) => void;
  onOpenTavily: () => void;
  onOpenTelegram: () => void;
  onOpenSoulEditor: () => void;
  onOpenFacebook?: () => void;
  onOpenNotion?: () => void;
  connectorsDialogOpen?: boolean;
  onConnectorsDialogOpenChange?: (open: boolean) => void;
  connectorsTab?: "apps" | "custom-api";
  onConnectorsTabChange?: (tab: "apps" | "custom-api") => void;
}

export function ConnectorsPopover({
  open, onOpenChange,
  hasPersonalKey, hasTavilyKey = false, hasTelegramLink = false, hasSoulConfig = false,
  hasOpenrouterKey = false, hasXaiKey = false, hasFacebookPages = false, hasNotionKey = false,
  disabledConnectors = [], onToggleConnector,
  onOpenApiKey, onOpenTavily, onOpenTelegram, onOpenSoulEditor, onOpenFacebook, onOpenNotion,
  connectorsDialogOpen, onConnectorsDialogOpenChange,
  connectorsTab, onConnectorsTabChange,
}: ConnectorsPopoverProps) {
  const [internalDialogOpen, setInternalDialogOpen] = useState(false);
  const dialogOpen = connectorsDialogOpen ?? internalDialogOpen;
  const setDialogOpen = onConnectorsDialogOpenChange ?? setInternalDialogOpen;

  const isEnabled = (id: string) => !disabledConnectors.includes(id);

  const connectors: ConnectorItem[] = [
    {
      id: "gemini",
      name: "Google Gemini",
      icon: <Wand2 className="h-4 w-4 text-blue-400" />,
      connected: hasPersonalKey,
      enabled: hasPersonalKey && isEnabled("gemini"),
      onToggle: () => onOpenApiKey('gemini'),
      onEnabledChange: (v) => onToggleConnector?.("gemini", v),
    },
    {
      id: "tavily",
      name: "Web Search",
      icon: <Globe className="h-4 w-4 text-emerald-400" />,
      connected: hasTavilyKey,
      enabled: hasTavilyKey && isEnabled("tavily"),
      onToggle: onOpenTavily,
      onEnabledChange: (v) => onToggleConnector?.("tavily", v),
    },
    {
      id: "openrouter",
      name: "OpenRouter",
      icon: <Router className="h-4 w-4 text-cyan-400" />,
      connected: hasOpenrouterKey,
      enabled: hasOpenrouterKey && isEnabled("openrouter"),
      onToggle: () => onOpenApiKey('openrouter'),
      onEnabledChange: (v) => onToggleConnector?.("openrouter", v),
    },
    {
      id: "xai",
      name: "Grok (xAI)",
      icon: <Atom className="h-4 w-4 text-amber-400" />,
      connected: hasXaiKey,
      enabled: hasXaiKey && isEnabled("xai"),
      onToggle: () => onOpenApiKey('xai'),
      onEnabledChange: (v) => onToggleConnector?.("xai", v),
    },
    {
      id: "telegram",
      name: "Neural Link",
      icon: <Send className="h-4 w-4 text-violet-400" />,
      connected: hasTelegramLink,
      enabled: hasTelegramLink && isEnabled("telegram"),
      onToggle: onOpenTelegram,
      onEnabledChange: (v) => onToggleConnector?.("telegram", v),
    },
    {
      id: "facebook",
      name: "Facebook Pages",
      icon: <Facebook className="h-4 w-4 text-blue-400" />,
      connected: hasFacebookPages,
      enabled: hasFacebookPages && isEnabled("facebook"),
      onToggle: () => onOpenFacebook?.(),
      onEnabledChange: (v) => onToggleConnector?.("facebook", v),
    },
    {
      id: "notion",
      name: "Notion",
      icon: <BookOpen className="h-4 w-4 text-purple-400" />,
      connected: hasNotionKey,
      enabled: hasNotionKey && isEnabled("notion"),
      onToggle: () => onOpenNotion?.(),
      onEnabledChange: (v) => onToggleConnector?.("notion", v),
    },
    {
      id: "soul",
      name: "Soul Config",
      icon: <Sparkles className="h-4 w-4 text-pink-400" />,
      connected: hasSoulConfig,
      enabled: hasSoulConfig && isEnabled("soul"),
      onToggle: onOpenSoulEditor,
      onEnabledChange: (v) => onToggleConnector?.("soul", v),
    },
  ];

  const connectedCount = connectors.filter(c => c.connected).length;
  const activeCount = connectors.filter(c => c.connected && c.enabled).length;

  return (
    <>
      <Popover open={open} onOpenChange={onOpenChange}>
        <PopoverTrigger asChild>
          <button
            className={cn(
              "h-[34px] w-[34px] rounded-[11px] flex items-center justify-center bg-transparent text-[#9b9b9d] hover:bg-[#1a1a1c] hover:text-[#ededed] transition-colors duration-[130ms] active:scale-95 touch-manipulation relative",
              connectedCount > 0 && "text-[var(--beebot-accent)]",
            )}
            title="Connectors"
          >
            <Puzzle className="h-5 w-5" />
            {connectedCount > 0 && (
              <span className="absolute top-0 right-0 h-3 w-3 rounded-full bg-emerald-500 text-[7px] font-bold text-white flex items-center justify-center">
                {activeCount}
              </span>
            )}
          </button>
        </PopoverTrigger>
        <PopoverContent
          side="top"
          align="start"
          className="w-72 p-0 bg-popover/95 backdrop-blur-xl border-border/50 rounded-xl overflow-hidden"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-border/30">
            <div className="flex items-center gap-2">
              <Puzzle className="h-4 w-4 text-primary" />
              <span className="text-sm font-semibold">Connectors</span>
            </div>
            <button
              onClick={() => onOpenChange(false)}
              className="p-1 rounded-md hover:bg-muted/50 text-muted-foreground"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>

          {/* Connector List */}
          <div className="p-2 space-y-0.5">
            {connectors.map((c) => (
              <div
                key={c.id}
                className={cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all",
                  c.connected && !c.enabled && "opacity-50",
                )}
              >
                {/* Icon + Name — clickable to open settings */}
                <button
                  onClick={() => {
                    onOpenChange(false);
                    c.onToggle?.();
                  }}
                  className="flex items-center gap-3 flex-1 min-w-0 hover:opacity-80 transition-opacity"
                >
                  {c.icon}
                  <span className="flex-1 text-left text-sm truncate">{c.name}</span>
                </button>

                {/* Switch or Connect badge */}
                {c.connected ? (
                  <Switch
                    checked={c.enabled}
                    onCheckedChange={(checked) => {
                      c.onEnabledChange?.(checked);
                    }}
                    className="data-[state=checked]:bg-emerald-500 data-[state=unchecked]:bg-muted-foreground/30 h-5 w-9 [&_span]:h-4 [&_span]:w-4 [&_span]:data-[state=checked]:translate-x-4"
                  />
                ) : (
                  <button
                    onClick={() => {
                      onOpenChange(false);
                      c.onToggle?.();
                    }}
                    className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-muted/50 text-muted-foreground hover:text-foreground transition-colors"
                  >
                    Connect
                  </button>
                )}
              </div>
            ))}
          </div>

          {/* Footer */}
          <div className="border-t border-border/30 p-2">
            <button
              onClick={() => {
                onOpenChange(false);
                setDialogOpen(true);
              }}
              className="w-full flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-muted/50 transition-colors text-sm text-muted-foreground hover:text-foreground"
            >
              <Plus className="h-4 w-4" />
              <span>Add connectors</span>
              <div className="flex-1" />
              <div className="flex -space-x-1">
                {connectors.filter(c => c.connected && c.enabled).map(c => (
                  <div key={c.id} className="h-5 w-5 rounded-full bg-muted/80 flex items-center justify-center ring-1 ring-background">
                    {c.icon}
                  </div>
                ))}
              </div>
            </button>
          </div>
        </PopoverContent>
      </Popover>

      <ConnectorsDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        connectors={connectors}
        onOpenApiKey={onOpenApiKey}
        onOpenTavily={onOpenTavily}
        onOpenTelegram={onOpenTelegram}
        onOpenSoulEditor={onOpenSoulEditor}
        onOpenFacebook={onOpenFacebook}
        onOpenNotion={onOpenNotion}
        activeTab={connectorsTab}
        onTabChange={onConnectorsTabChange}
      />
    </>
  );
}
