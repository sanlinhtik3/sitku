import { memo, useState, useCallback } from "react";
import {
  Sparkles,
  Brain,
  Crown,
  Shield,
  Key,
  Globe,
  Plus,
  Check,
  X,
} from "lucide-react";
import { getModelsGroupedByProvider, OPENROUTER_MODELS, type AIModelInfo } from "@/lib/ai-models";
import { ProviderLogo } from "./ProviderLogo";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";

const CUSTOM_MODELS_KEY = 'beebot-custom-models';
// ═══════════════════════════════════════════════════════════════════════════
// ZoeCrypto "Apex" Model Selector — macOS/iOS Premium Inline List
// ═══════════════════════════════════════════════════════════════════════════

interface ModelSelectorProps {
  currentModel: string;
  tierLevel: number;
  onModelChange: (modelId: string) => void;
  disabled?: boolean;
  compact?: boolean;
  enableGoogleProvider?: boolean;
  enableAnthropicProvider?: boolean;
  enabledGeminiModels?: string[];
  isUsingPersonalKey?: boolean;
  hasOpenrouterKey?: boolean;
  hasAnthropicKey?: boolean;
  hasSystemGoogleKey?: boolean;
  disabledConnectors?: string[];
}

type ModelEntry = { id: string } & AIModelInfo;

interface ProviderGroup {
  key: string;
  label: string;
  dotColor: string;
  icon: typeof Sparkles;
  iconColor: string;
  models: ModelEntry[];
}

function ModelItem({
  model, 
  isSelected, 
  onSelect,
  isCustom,
  onDelete,
}: { 
  model: ModelEntry; 
  isSelected: boolean; 
  onSelect: () => void;
  isCustom?: boolean;
  onDelete?: () => void;
}) {
  const ProviderIcon = model.provider === 'anthropic' 
    ? (model.tier === 'opus' ? Crown : Brain) 
    : model.provider === 'openrouter' 
      ? Globe 
      : Sparkles;

  const iconColor = model.provider === 'anthropic'
    ? "text-accent-foreground"
    : model.provider === 'openrouter'
      ? "text-emerald-400"
      : "text-primary";

  return (
    <button
      onClick={onSelect}
      className={cn(
        "w-full flex items-center gap-2.5 rounded-xl px-2.5 py-2.5 transition-all duration-200",
        "text-left group",
        isSelected
          ? "bg-primary/15 text-primary"
          : "text-muted-foreground hover:bg-white/[0.045] hover:text-foreground active:bg-white/[0.065]"
      )}
    >
      <span
        className={cn(
          "flex h-7 w-7 shrink-0 items-center justify-center rounded-lg",
          isSelected ? "bg-primary/15" : "bg-white/[0.04]"
        )}
      >
        <ProviderLogo
          provider={model.provider}
          fallback={ProviderIcon}
          className="h-4 w-4"
          fallbackClassName={cn(
            "h-3.5 w-3.5",
            isSelected ? "text-primary" : iconColor
          )}
        />
      </span>
      
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className={cn(
            "text-sm font-medium truncate",
            isSelected ? "text-primary" : "text-foreground/86"
          )}>
            {model.displayName}
          </span>
        </div>
      </div>

      {isCustom && onDelete && (
        <button
          onClick={(e) => { e.stopPropagation(); onDelete(); }}
          className={cn(
            "opacity-0 group-hover:opacity-100 transition-opacity duration-200 p-0.5 rounded shrink-0",
            isSelected ? "hover:bg-primary-foreground/20" : "hover:bg-destructive/20"
          )}
        >
          <X className={cn("h-3 w-3", isSelected ? "text-primary-foreground" : "text-destructive")} />
        </button>
      )}

      <span className={cn(
        "flex h-6 w-6 shrink-0 items-center justify-center rounded-full transition-colors",
        isSelected
          ? "bg-primary/15 text-primary"
          : "text-muted-foreground/35 group-hover:text-primary"
      )}>
        {isSelected && <Check className="h-3.5 w-3.5" />}
      </span>
    </button>
  );
}

export const ModelSelector = memo(({ 
  currentModel, 
  tierLevel, 
  onModelChange,
  disabled = false,
  enableGoogleProvider = true,
  enableAnthropicProvider = true,
  enabledGeminiModels,
  isUsingPersonalKey = false,
  hasOpenrouterKey = false,
  hasAnthropicKey = false,
  hasSystemGoogleKey = false,
  disabledConnectors = [],
}: ModelSelectorProps) => {
  const effectiveTier = isUsingPersonalKey ? 3 : tierLevel;
  const { google: allGeminiModels, anthropic: allClaudeModels, openrouter: allOpenrouterModels } = getModelsGroupedByProvider(effectiveTier);

  const effectiveGoogleProvider = enableGoogleProvider || isUsingPersonalKey;
  const effectiveAnthropicProvider = enableAnthropicProvider || isUsingPersonalKey;

  const isGeminiDisabled = disabledConnectors.includes('gemini');
  const isOpenrouterDisabled = disabledConnectors.includes('openrouter');
  const isAnthropicDisabled = disabledConnectors.includes('anthropic');

  const hasGeminiAccess = isUsingPersonalKey || hasSystemGoogleKey;
  const showGemini = effectiveGoogleProvider && !isGeminiDisabled && hasGeminiAccess;
  const showOpenrouter = hasOpenrouterKey && !isOpenrouterDisabled;
  const showClaude = effectiveAnthropicProvider && (hasAnthropicKey || isUsingPersonalKey) && !isAnthropicDisabled;

  const geminiModels = showGemini 
    ? (enabledGeminiModels && !isUsingPersonalKey
        ? allGeminiModels.filter(m => enabledGeminiModels.includes(m.id))
        : allGeminiModels)
    : [];
  const claudeModels = showClaude ? allClaudeModels : [];
  const openrouterModels = showOpenrouter ? allOpenrouterModels : [];

  const [customModelId, setCustomModelId] = useState("");
  const [customModels, setCustomModels] = useState<string[]>(() => {
    try {
      return JSON.parse(localStorage.getItem(CUSTOM_MODELS_KEY) || '[]');
    } catch { return []; }
  });

  const saveCustomModels = useCallback((models: string[]) => {
    setCustomModels(models);
    localStorage.setItem(CUSTOM_MODELS_KEY, JSON.stringify(models));
  }, []);

  const applyCustomModel = useCallback(() => {
    const trimmed = customModelId.trim();
    if (!trimmed.includes('/')) {
      toast({ title: "Invalid format", description: "Model ID must contain '/' (e.g. qwen/qwen3.6-plus-preview:free)", variant: "destructive" });
      return;
    }
    // Validate against known OpenRouter models
    const isKnownModel = trimmed in OPENROUTER_MODELS;
    if (!isKnownModel) {
      toast({ title: "⚠️ Custom Model Warning", description: `"${trimmed}" is not in the BeeBot-compatible list. This model must support tool-calling (function calling) to work with BeeBot. Check OpenRouter privacy settings too.`, variant: "destructive" });
    }
    if (!customModels.includes(trimmed)) {
      saveCustomModels([...customModels, trimmed]);
    }
    onModelChange(trimmed);
    setCustomModelId("");
  }, [customModelId, onModelChange, customModels, saveCustomModels]);

  const removeCustomModel = useCallback((modelId: string) => {
    const updated = customModels.filter(m => m !== modelId);
    saveCustomModels(updated);
    if (currentModel === modelId) {
      const firstAvailable = openrouterModels[0]?.id || geminiModels[0]?.id;
      if (firstAvailable) onModelChange(firstAvailable);
    }
  }, [customModels, saveCustomModels, currentModel, onModelChange, openrouterModels, geminiModels]);

  // Inject custom models into openrouter entries
  const customModelEntries: ModelEntry[] = customModels.map(id => ({
    id,
    displayName: id,
    provider: 'openrouter' as const,
    tier: 'flash' as const,
    displayNameMM: id,
    rpm: 30,
    tpm: 100000,
    rpd: 1000,
    maxTokens: 8192,
    contextWindow: 128000,
    color: '#10b981',
    minTierLevel: 0,
  }));

  // Build provider groups
  const groups: ProviderGroup[] = [];
  if (geminiModels.length > 0) {
    groups.push({
      key: "gemini",
      label: "Gemini",
      dotColor: "bg-primary",
      icon: Sparkles,
      iconColor: "text-primary",
      models: geminiModels,
    });
  }
  const hasOpenrouterContent = openrouterModels.length > 0 || customModelEntries.length > 0;
  if (hasOpenrouterContent) {
    groups.push({
      key: "openrouter",
      label: "OpenRouter",
      dotColor: "bg-emerald-500",
      icon: Globe,
      iconColor: "text-emerald-400",
      models: [...openrouterModels, ...customModelEntries],
    });
  }
  if (claudeModels.length > 0) {
    groups.push({
      key: "claude",
      label: "Claude",
      dotColor: "bg-accent",
      icon: Crown,
      iconColor: "text-accent-foreground",
      models: claudeModels,
    });
  }

  if (groups.length === 0) {
    return (
      <div className="flex items-center gap-2 rounded-2xl border border-destructive/25 bg-destructive/5 px-3 py-3 text-destructive">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-destructive/10">
          <Shield className="h-4 w-4" />
        </span>
        <span className="text-xs font-medium">No AI provider active</span>
      </div>
    );
  }

  return (
    <div className="space-y-1">
      {/* Scrollable model list */}
      <div className="max-h-[320px] overflow-y-auto pr-1 custom-scrollbar">
        {groups.map((group) => (
          <div key={group.key} className="py-1">
            {/* Provider header */}
            <div className="mb-0.5 flex items-center justify-between px-2">
              <div className="flex items-center gap-2">
                <span className={cn("h-1.5 w-1.5 rounded-full", group.dotColor)} />
                <span className={cn("text-[10px] font-semibold uppercase tracking-[0.12em]", group.iconColor)}>
                  {group.label}
                </span>
              </div>
              <span className="text-[9px] text-muted-foreground/60">
                {group.models.length}
              </span>
            </div>
            
            {/* Models card */}
            <div className="space-y-1">
              {group.models.map((model) => {
                const isCustom = customModels.includes(model.id);
                return (
                  <ModelItem
                    key={model.id}
                    model={model}
                    isSelected={currentModel === model.id}
                    onSelect={() => !disabled && onModelChange(model.id)}
                    isCustom={isCustom}
                    onDelete={isCustom ? () => removeCustomModel(model.id) : undefined}
                  />
                );
              })}

              {/* Custom model input for OpenRouter */}
              {group.key === "openrouter" && (
                <>
                  <div className="mx-1 mt-1 rounded-xl border border-white/10 bg-white/[0.03] px-2.5 py-2">
                    <p className="mb-1.5 flex items-center gap-1 text-[10px] font-medium text-muted-foreground">
                      <Plus className="h-2.5 w-2.5" />
                      Custom model
                    </p>
                    <div className="flex gap-1.5">
                      <Input
                        placeholder="e.g. qwen/qwen3.6:free"
                        value={customModelId}
                        onChange={e => setCustomModelId(e.target.value)}
                        className="h-8 flex-1 rounded-lg border-white/10 bg-black/20 text-xs"
                        onKeyDown={e => {
                          e.stopPropagation();
                          if (e.key === 'Enter') applyCustomModel();
                        }}
                      />
                      <Button
                        size="sm"
                        variant="secondary"
                        className="h-8 shrink-0 rounded-lg px-3 text-xs"
                        onClick={applyCustomModel}
                        disabled={!customModelId.trim()}
                      >
                        Use
                      </Button>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        ))}

        {/* Locked hint */}
        {tierLevel < 1 && effectiveAnthropicProvider && !isUsingPersonalKey && !showClaude && (
          <div className="mx-1 rounded-xl border border-white/10 bg-white/[0.03] px-2 py-2 text-center text-xs text-muted-foreground">
            <span className="flex items-center justify-center gap-1">
              <Crown className="h-3 w-3" />
              Upgrade for Claude access
            </span>
          </div>
        )}
      </div>

      {/* Personal key badge */}
      {isUsingPersonalKey && (
        <div className="mx-1 flex items-center gap-1 px-1 py-1">
          <Key className="h-3 w-3 text-emerald-300" />
          <span className="text-[10px] font-medium text-emerald-300">All models unlocked</span>
        </div>
      )}
    </div>
  );
});

ModelSelector.displayName = "ModelSelector";
