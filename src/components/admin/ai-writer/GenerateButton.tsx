import { memo } from "react";
import { Button } from "@/components/ui/button";
import { Sparkles, Loader2, WifiOff } from "lucide-react";

interface GenerateButtonProps {
  onClick: () => void;
  loading: boolean;
  canGenerate: boolean;
  usePersonalKey: boolean;
  isOnline: boolean;
}

export const GenerateButton = memo(({ 
  onClick, 
  loading, 
  canGenerate,
  usePersonalKey,
  isOnline
}: GenerateButtonProps) => {
  const buttonText = usePersonalKey ? 'Generate (FREE)' : 'Generate (1 credit)';
  const isDisabled = loading || !canGenerate || !isOnline;

  return (
    <Button 
      onClick={onClick} 
      disabled={isDisabled}
      className="w-full h-10 sm:h-11 text-sm rounded-xl bg-gradient-to-r from-primary to-primary/80 hover:from-primary/90 hover:to-primary/70 shadow-lg shadow-primary/20 hover:shadow-primary/30 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-300"
      aria-label={loading ? "Generating content" : buttonText}
    >
      {!isOnline ? (
        <>
          <WifiOff className="mr-2 h-4 w-4" aria-hidden="true" />
          Offline
        </>
      ) : loading ? (
        <>
          <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
          Generating...
        </>
      ) : (
        <>
          <Sparkles className="mr-2 h-4 w-4" aria-hidden="true" />
          {buttonText}
        </>
      )}
    </Button>
  );
});

GenerateButton.displayName = "GenerateButton";
