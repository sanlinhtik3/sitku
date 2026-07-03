import { memo } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Key, WifiOff, AlertCircle, Coins, Wifi } from "lucide-react";

interface AlertBannersProps {
  requirePersonalKey: boolean;
  hasPersonalKey: boolean;
  gatewayAllowed: boolean;
  showPersonalKeySettings: boolean;
  hasCredits: boolean;
  usePersonalKey: boolean;
  isOnline: boolean;
  onOpenApiKeyDialog: () => void;
}

export const AlertBanners = memo(({
  requirePersonalKey,
  hasPersonalKey,
  gatewayAllowed,
  showPersonalKeySettings,
  hasCredits,
  usePersonalKey,
  isOnline,
  onOpenApiKeyDialog
}: AlertBannersProps) => {
  const hasAlerts = !isOnline || 
    (requirePersonalKey && !hasPersonalKey) || 
    (!gatewayAllowed && !hasPersonalKey && !requirePersonalKey) || 
    (!usePersonalKey && !hasCredits && gatewayAllowed);
  
  if (!hasAlerts) return null;

  return (
    <>
      {/* Offline Alert */}
      {!isOnline && (
        <Alert className="bg-background/30 backdrop-blur-md border-destructive/30">
          <WifiOff className="h-4 w-4 text-destructive" aria-hidden="true" />
          <AlertDescription className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <span className="text-sm">You're offline. Content generation is unavailable until you reconnect.</span>
          </AlertDescription>
        </Alert>
      )}

      {/* Personal Key Required Alert */}
      {requirePersonalKey && !hasPersonalKey && (
        <Alert className="bg-background/30 backdrop-blur-md border-amber-500/30">
          <Key className="h-4 w-4 text-amber-500" aria-hidden="true" />
          <AlertDescription className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <span className="text-sm">Personal Gemini API Key required. Please add your API key to generate content.</span>
            <Button 
              size="sm" 
              onClick={onOpenApiKeyDialog}
              className="bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 whitespace-nowrap"
              aria-label="Add API Key"
            >
              <Key className="h-4 w-4 mr-2" aria-hidden="true" />
              Add API Key
            </Button>
          </AlertDescription>
        </Alert>
      )}
      
      {/* Gateway Disabled Alert */}
      {!gatewayAllowed && !hasPersonalKey && !requirePersonalKey && (
        <Alert className="bg-background/30 backdrop-blur-md border-destructive/30">
          <WifiOff className="h-4 w-4 text-destructive" aria-hidden="true" />
          <AlertDescription className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <span className="text-sm">AI Gateway is disabled. Add your personal Gemini API key to generate content.</span>
            {showPersonalKeySettings && (
              <Button 
                size="sm" 
                onClick={onOpenApiKeyDialog}
                className="bg-gradient-to-r from-primary to-primary/80 whitespace-nowrap"
                aria-label="Add API Key"
              >
                <Key className="h-4 w-4 mr-2" aria-hidden="true" />
                Add API Key
              </Button>
            )}
          </AlertDescription>
        </Alert>
      )}
      
      {/* Credit Balance Alert - only show if using gateway */}
      {!usePersonalKey && !hasCredits && gatewayAllowed && (
        <Alert className="bg-background/30 backdrop-blur-md border-destructive/30">
          <AlertCircle className="h-4 w-4 text-destructive" aria-hidden="true" />
          <AlertDescription className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <span className="text-sm">You need credits to generate content. Each generation costs 1 credit.</span>
            <Link to="/buy-credits">
              <Button size="sm" className="bg-gradient-to-r from-primary to-primary/80 shadow-lg shadow-primary/20 whitespace-nowrap">
                <Coins className="h-4 w-4 mr-2" aria-hidden="true" />
                Buy Credits
              </Button>
            </Link>
          </AlertDescription>
        </Alert>
      )}
    </>
  );
});

AlertBanners.displayName = "AlertBanners";
