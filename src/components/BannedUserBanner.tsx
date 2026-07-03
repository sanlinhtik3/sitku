import { AlertCircle } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";

export const BannedUserBanner = () => {
  const { user, isBanned } = useAuth();

  if (!user || !isBanned) return null;

  return (
    <div className="fixed top-16 left-0 right-0 z-50 animate-in slide-in-from-top duration-300">
      <div className="bg-destructive text-destructive-foreground px-4 py-2 shadow-lg">
        <div className="max-w-7xl mx-auto flex items-center justify-center gap-2">
          <AlertCircle className="h-4 w-4 flex-shrink-0" />
          <p className="text-sm font-medium">
            Your account has been banned. Access is restricted.
          </p>
        </div>
      </div>
    </div>
  );
};
