import { memo, useMemo, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { Home, Sparkles, User, Briefcase, Wrench, Bot } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import { useFeatureFlags } from "@/hooks/useFeatureFlags";
import { FeatureUnavailableDialog } from "@/components/FeatureUnavailableDialog";

import { lazy, Suspense } from "react";
const UserProfileDialog = lazy(() => import("@/components/UserProfileDialog").then(m => ({ default: m.UserProfileDialog })));
import type { FeatureStatus } from "@/hooks/useFeatureFlags";

const NAV_ITEMS_CONFIG = [
  { path: "/sitku", icon: Bot, label: "Sitku", featureKey: null, isDialog: false as const },
  { path: "/dashboard", icon: Home, label: "Home", featureKey: null, isDialog: false as const },
  { path: "/ai-content", icon: Sparkles, label: "AI", featureKey: "ai_content", isDialog: false as const },
  { path: "/team-workspace", icon: Briefcase, label: "Studio", featureKey: "team_workspace", isDialog: false as const },
  { path: "#profile", icon: User, label: "Profile", featureKey: null, isDialog: "profile" as const },
] as const;

export const MobileBottomNav = memo(() => {
  const location = useLocation();
  const { user } = useAuth();
  const { isFeatureEnabled, getFeatureStatus, getFeature, getMaintenanceMessage } = useFeatureFlags();
  
  
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedFeature, setSelectedFeature] = useState<{
    name: string;
    nameMy: string | null;
    status: FeatureStatus;
    message: string | null;
    messageMy: string | null;
  } | null>(null);

  const [profileOpen, setProfileOpen] = useState(false);

  const navItems = useMemo(() => {
    return NAV_ITEMS_CONFIG.map(item => {
      const featureKey = item.featureKey;
      const isEnabled = featureKey ? isFeatureEnabled(featureKey) : true;
      const status = featureKey ? getFeatureStatus(featureKey) : null;
      const feature = featureKey ? getFeature(featureKey) : null;
      
      return {
        ...item,
        isEnabled,
        status,
        feature,
      };
    });
  }, [isFeatureEnabled, getFeatureStatus, getFeature]);

  if (!user) return null;

  const handleNavClick = (item: typeof navItems[0], e: React.MouseEvent) => {
    if (item.isDialog === "profile") {
      e.preventDefault();
      setProfileOpen(true);
      return;
    }
    if (!item.isEnabled && item.featureKey && item.feature && item.status) {
      e.preventDefault();
      setSelectedFeature({
        name: item.feature.feature_name,
        nameMy: item.feature.feature_name_my,
        status: item.status,
        message: getMaintenanceMessage(item.featureKey),
        messageMy: getMaintenanceMessage(item.featureKey, true),
      });
      setDialogOpen(true);
    }
  };

  return (
    <>
      <nav className="fixed bottom-0 left-0 right-0 z-50 lg:hidden border-t border-white/[0.06] bg-background/80 backdrop-blur-2xl safe-area-pb">
        <div className="grid grid-cols-5 h-16">
          {navItems.map((item) => {
            const Icon = item.isEnabled ? item.icon : Wrench;
            const isActive = item.isDialog === "profile" ? profileOpen : location.pathname === item.path;
            const isDisabled = !item.isEnabled && item.featureKey;
            
            const content = (
              <>
                <Icon className={cn(
                  "h-5 w-5 transition-all duration-200",
                  isActive && "drop-shadow-[0_0_8px_hsl(var(--primary)/0.5)]",
                  isDisabled && "text-orange-500/50"
                )} />
                <span className={cn(
                  "text-[10px] font-medium",
                  isDisabled && "text-orange-500/50"
                )}>
                  {isDisabled ? "ပြုပြင်နေ" : item.label}
                </span>
                {isActive && !isDisabled && (
                  <div className="absolute -top-px left-1/2 -translate-x-1/2 w-10 h-0.5 bg-gradient-to-r from-transparent via-primary to-transparent rounded-full" />
                )}
                {item.status && item.status !== "active" && item.isEnabled && (
                  <div className={cn(
                    "absolute top-1 right-1/4 w-1.5 h-1.5 rounded-full",
                    item.status === "beta" && "bg-blue-500",
                    item.status === "maintenance" && "bg-orange-500",
                    item.status === "coming_soon" && "bg-purple-500",
                  )} />
                )}
              </>
            );

            const sharedClassName = cn(
              "flex flex-col items-center justify-center gap-0.5 transition-all duration-200 touch-manipulation active:scale-95 relative min-h-[44px]",
              isActive 
                ? "text-primary" 
                : isDisabled
                  ? "text-muted-foreground/40"
                  : "text-muted-foreground hover:text-foreground"
            );

            if (item.isDialog) {
              return (
                <button
                  key={item.path}
                  onClick={(e) => handleNavClick(item, e)}
                  className={sharedClassName}
                  style={{ willChange: "transform" }}
                >
                  {content}
                </button>
              );
            }

            return (
              <Link
                key={item.path}
                to={isDisabled ? "#" : item.path}
                onClick={(e) => handleNavClick(item, e)}
                className={sharedClassName}
                style={{ willChange: "transform" }}
              >
                {content}
              </Link>
            );
          })}
        </div>
      </nav>

      <Suspense fallback={null}>
        {profileOpen && (
          <UserProfileDialog open={profileOpen} onOpenChange={setProfileOpen} />
        )}
      </Suspense>

      {selectedFeature && (
        <FeatureUnavailableDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          featureName={selectedFeature.name}
          featureNameMy={selectedFeature.nameMy}
          status={selectedFeature.status}
          message={selectedFeature.message}
          messageMy={selectedFeature.messageMy}
        />
      )}
    </>
  );
});

MobileBottomNav.displayName = "MobileBottomNav";
