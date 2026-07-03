import { cn } from "@/lib/utils";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ModelSelector } from "../ModelSelector";
import { ProviderLogo } from "../ProviderLogo";
import { getModelInfo, getModelProvider } from "@/lib/ai-models";
import {
  Cpu,
  Key,
  Cloud,
  CheckCircle as Check,
  AltArrowDown as ChevronDown,
  AltArrowRight as ChevronRight,
  DangerTriangle as AlertTriangle,
  Microphone as Mic2,
} from "@solar-icons/react";
import { VOICE_LANGUAGES, type VoiceLanguage, type LanguageOption } from "./VoiceInput";


interface BrainMenuProps {
  showModeMenu: boolean;
  setShowModeMenu: (open: boolean) => void;
  // Model
  currentModel: string;
  tierLevel: number;
  onModelChange?: (modelId: string) => void;
  enableGoogleProvider: boolean;
  enableAnthropicProvider: boolean;
  hasAnthropicKey?: boolean;
  hasSystemGoogleKey?: boolean;
  enabledGeminiModels?: string[];
  // API Source
  allowPersonalKey: boolean;
  hasPersonalKey: boolean;
  apiSource: 'personal' | 'system';
  onApiSourceChange?: (source: 'personal' | 'system') => void;
  onOpenApiKeyDialog?: (tab?: string) => void;
  // Voice
  voiceLanguage: VoiceLanguage;
  currentLang: LanguageOption;
  showLanguageSubmenu: boolean;
  setShowLanguageSubmenu: (open: boolean) => void;
  onLanguageChange: (lang: VoiceLanguage) => void;
  // Connector-aware
  hasOpenrouterKey?: boolean;
  disabledConnectors?: string[];
}

export function BrainMenu({
  showModeMenu, setShowModeMenu,
  currentModel, tierLevel, onModelChange,
  enableGoogleProvider, enableAnthropicProvider, hasAnthropicKey = false, hasSystemGoogleKey = false, enabledGeminiModels,
  allowPersonalKey, hasPersonalKey, apiSource, onApiSourceChange, onOpenApiKeyDialog,
  voiceLanguage, currentLang, showLanguageSubmenu, setShowLanguageSubmenu, onLanguageChange,
  hasOpenrouterKey = false, disabledConnectors = [],
}: BrainMenuProps) {
  const activeProvider = getModelInfo(currentModel)?.provider ?? getModelProvider(currentModel);

  return (
    <Popover open={showModeMenu} onOpenChange={setShowModeMenu}>
      <PopoverTrigger asChild>
        <button
          className={cn(
            "h-[34px] rounded-[11px] px-3 bg-transparent text-[#9b9b9d] hover:bg-[#1a1a1c] hover:text-[#ededed] transition-colors duration-[130ms] flex items-center gap-1.5 text-xs border border-[rgba(255,255,255,0.06)] shadow-[inset_0_1px_0_rgba(255,255,255,0.03)] active:scale-95 touch-manipulation"
          )}
        >
          <ProviderLogo
            provider={activeProvider}
            fallback={Cpu}
            className="h-3.5 w-3.5"
            fallbackClassName="h-3.5 w-3.5 text-primary"
          />
          <span className="font-medium truncate max-w-[120px]">
            {currentModel.replace(/^gemini-/, "Gemini ").replace(/^claude-/, "Claude ").replace(/-/g, " ")}
          </span>
          <ChevronDown className="h-3 w-3 shrink-0 opacity-60" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        side="top"
        align="end"
        sideOffset={8}
        className="w-[292px] overflow-hidden rounded-[20px] border-white/10 bg-[#090c0f]/98 p-1.5 shadow-[0_24px_70px_rgba(0,0,0,0.72),inset_0_1px_0_rgba(255,255,255,0.045)] backdrop-blur-2xl"
      >
        <div className="relative">
          <div className="space-y-1">
            {/* AI Model Section */}
            {onModelChange && (
              <ModelSelector
                currentModel={currentModel}
                tierLevel={tierLevel}
                onModelChange={onModelChange}
                enableGoogleProvider={enableGoogleProvider}
                enableAnthropicProvider={enableAnthropicProvider}
                hasAnthropicKey={hasAnthropicKey}
                hasSystemGoogleKey={hasSystemGoogleKey}
                enabledGeminiModels={enabledGeminiModels}
                isUsingPersonalKey={!!(hasPersonalKey && apiSource === 'personal')}
                hasOpenrouterKey={hasOpenrouterKey}
                disabledConnectors={disabledConnectors}
              />
            )}

            {/* API Source Section */}
            {allowPersonalKey && hasPersonalKey && onApiSourceChange && (
              <div className="mt-1 border-t border-white/10 pt-1.5">
                <div className="mb-1 flex items-center justify-between px-2">
                  <div className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
                    <Key className="h-3 w-3 text-primary" />
                    API Source
                  </div>
                  {onOpenApiKeyDialog && (
                    <button
                      onClick={() => { setShowModeMenu(false); onOpenApiKeyDialog(); }}
                      className="text-[10px] text-cyan-300 hover:text-cyan-200"
                    >
                      Keys
                    </button>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-1 rounded-[14px] bg-black/20 p-1">
                    <button
                      onClick={() => onApiSourceChange('personal')}
                      className={cn(
                        "flex items-center justify-center gap-1.5 rounded-xl px-2 py-2 text-xs transition-all",
                        apiSource === 'personal'
                          ? "bg-emerald-400/15 text-emerald-200"
                          : "text-muted-foreground hover:bg-white/[0.04] hover:text-foreground"
                      )}
                    >
                      <Key className="h-3.5 w-3.5" />
                      Personal
                      {apiSource === 'personal' && <Check className="h-3.5 w-3.5" />}
                    </button>
                    <button
                      onClick={() => onApiSourceChange('system')}
                      className={cn(
                        "flex items-center justify-center gap-1.5 rounded-xl px-2 py-2 text-xs transition-all",
                        apiSource === 'system'
                          ? "bg-sky-400/15 text-sky-200"
                          : "text-muted-foreground hover:bg-white/[0.04] hover:text-foreground"
                      )}
                    >
                      <Cloud className="h-3.5 w-3.5" />
                      System
                      {apiSource === 'system' && <Check className="h-3.5 w-3.5" />}
                    </button>
                </div>
              </div>
            )}

            {/* Voice Language Settings */}
            <Popover open={showLanguageSubmenu} onOpenChange={setShowLanguageSubmenu}>
              <PopoverTrigger asChild>
                <button className="mt-1 flex w-full items-center gap-2 rounded-xl px-2.5 py-2 text-muted-foreground transition-colors hover:bg-white/[0.055] hover:text-foreground">
                  <Mic2 className="h-4 w-4" />
                  <div className="flex-1 text-left">
                    <div className="text-sm">Voice Language</div>
                  </div>
                  <span className="text-xs text-muted-foreground">{currentLang.label}</span>
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                </button>
              </PopoverTrigger>
              <PopoverContent
                side="right"
                align="start"
                className="w-56 rounded-[20px] border-white/10 bg-[#16181f]/95 p-2 shadow-[0_18px_60px_rgba(0,0,0,0.48)] backdrop-blur-2xl"
              >
                <div className="space-y-1">
                  {VOICE_LANGUAGES.map((lang) => (
                    <button
                      key={lang.code}
                      onClick={() => onLanguageChange(lang.code)}
                      className={cn(
                        "w-full flex items-center gap-2 px-3 py-2 rounded-lg transition-colors",
                        "hover:bg-muted/50",
                        voiceLanguage === lang.code && "bg-primary/10"
                      )}
                    >
                      <span className="font-medium text-sm">{lang.shortLabel}</span>
                      <span className="flex-1 text-left text-sm">{lang.label}</span>
                      {!lang.supported && <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />}
                      {voiceLanguage === lang.code && <Check className="h-4 w-4 text-primary" />}
                    </button>
                  ))}
                </div>
              </PopoverContent>
            </Popover>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
