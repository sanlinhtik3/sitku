import { useState, type ComponentType } from "react";
import type { LucideProps } from "lucide-react";
import type { AIProvider } from "@/lib/ai-models";
import { cn } from "@/lib/utils";

export const PROVIDER_LOGO_URLS: Record<AIProvider, string> = {
  google: "https://cdn.jsdelivr.net/npm/@lobehub/icons-static-svg@latest/icons/gemini-color.svg",
  anthropic: "https://cdn.jsdelivr.net/npm/@lobehub/icons-static-svg@latest/icons/claude-color.svg",
  openrouter: "https://cdn.jsdelivr.net/npm/@lobehub/icons-static-svg@latest/icons/openrouter.svg",
};

const PROVIDER_LABELS: Record<AIProvider, string> = {
  google: "Gemini",
  anthropic: "Claude AI",
  openrouter: "OpenRouter",
};

interface ProviderLogoProps {
  provider: AIProvider;
  fallback: ComponentType<LucideProps>;
  className?: string;
  fallbackClassName?: string;
}

export function ProviderLogo({
  provider,
  fallback: Fallback,
  className,
  fallbackClassName,
}: ProviderLogoProps) {
  const [hasError, setHasError] = useState(false);

  if (hasError) {
    return <Fallback className={cn(className, fallbackClassName)} />;
  }

  return (
    <img
      src={PROVIDER_LOGO_URLS[provider]}
      alt={`${PROVIDER_LABELS[provider]} logo`}
      className={cn("object-contain", className)}
      draggable={false}
      loading="lazy"
      onError={() => setHasError(true)}
    />
  );
}
