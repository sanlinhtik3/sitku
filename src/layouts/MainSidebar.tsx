import { memo, useMemo, useCallback, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useFeatureFlags } from "@/hooks/useFeatureFlags";
import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Coins } from "lucide-react";
import { Home, BookOpen, GraduationCap, Sparkles, Briefcase, LogOut, Wrench, Bot } from "lucide-react";
import { FeatureStatusBadge } from "@/components/FeatureStatusBadge";
import { FeatureUnavailableDialog } from "@/components/FeatureUnavailableDialog";
import type { FeatureStatus } from "@/hooks/useFeatureFlags";

const NAV_ITEMS_CONFIG = [
  { icon: Home, label: "Dashboard", path: "/dashboard", featureKey: null },
  { icon: Sparkles, label: "AI Content", path: "/ai-content", featureKey: "ai_content" },
  { icon: Briefcase, label: "Studio Hub", path: "/team-workspace", featureKey: "team_workspace" },
  { icon: BookOpen, label: "Courses", path: "/courses", featureKey: "courses" },
  { icon: GraduationCap, label: "Learn", path: "/learn", featureKey: "learn" },
] as const;

export const MainSidebar = memo(() => {
  const location = useLocation();
  const { user, signOut } = useAuth();
  const { isFeatureEnabled, getFeatureStatus, getFeature, getMaintenanceMessage } = useFeatureFlags();

  

  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedFeature, setSelectedFeature] = useState<{
    name: string;
    nameMy: string | null;
    status: FeatureStatus;
    message: string | null;
    messageMy: string | null;
  } | null>(null);

  const isActive = useCallback((path: string) => location.pathname === path, [location.pathname]);

  const getInitials = useCallback((email: string) => {
    return email?.charAt(0).toUpperCase() || "U";
  }, []);

  const userEmail = user?.email;
  const userInitials = useMemo(() => getInitials(userEmail || ""), [userEmail, getInitials]);
  const userName = useMemo(() => userEmail?.split("@")[0], [userEmail]);

  const visibleNavItems = useMemo(() => {
    return NAV_ITEMS_CONFIG.filter(item => {
      if (!item.featureKey) return true;
      const feature = getFeature(item.featureKey);
      return feature?.show_in_nav !== false;
    });
  }, [getFeature]);

  const handleDisabledClick = useCallback((featureKey: string) => {
    const feature = getFeature(featureKey);
    const status = getFeatureStatus(featureKey);
    if (feature && status) {
      setSelectedFeature({
        name: feature.feature_name,
        nameMy: feature.feature_name_my,
        status,
        message: getMaintenanceMessage(featureKey, false),
        messageMy: getMaintenanceMessage(featureKey, true),
      });
      setDialogOpen(true);
    }
  }, [getFeature, getFeatureStatus, getMaintenanceMessage]);

  return (
    <>
      <aside className="hidden lg:flex flex-col w-72 h-screen bg-black relative shrink-0">
        {/* Logo */}
        <div className="p-5 border-b border-white/5">
          <Link to="/" className="flex items-center gap-3 group">
            <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-primary/20 to-primary/40 flex items-center justify-center group-hover:shadow-[0_0_20px_hsl(var(--primary)/0.4)] transition-shadow duration-300">
              <Coins className="h-5 w-5 text-primary" />
            </div>
            <span className="font-bold text-xl bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text text-transparent">
              ZOE CRYPTO
            </span>
          </Link>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto custom-scrollbar px-3 py-4 space-y-1">
          {/* Sitku Chat Button */}
          <Link
            to="/sitku"
            className={cn(
              "flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 group",
              isActive("/sitku")
                ? "bg-primary/10 text-primary border border-primary/20 shadow-[0_0_15px_hsl(var(--primary)/0.15)]"
                : "text-muted-foreground hover:text-foreground hover:bg-white/5"
            )}
          >
            <Bot
              className={cn(
                "h-5 w-5 transition-all duration-200",
                isActive("/sitku") ? "text-primary drop-shadow-[0_0_8px_hsl(var(--primary)/0.5)]" : "group-hover:scale-110"
              )}
            />
            <span className="font-medium flex-1">Sitku</span>
            <span className="text-[10px] bg-primary/20 text-primary px-1.5 py-0.5 rounded-full font-medium">
              Agentic AI
            </span>
          </Link>

          <div className="my-1 border-t border-white/5" />

          {visibleNavItems.map((item) => {
            const Icon = item.icon;
            const active = isActive(item.path);
            const featureKey = item.featureKey;
            const isEnabled = featureKey ? isFeatureEnabled(featureKey) : true;
            const status = featureKey ? getFeatureStatus(featureKey) : null;
            const isDisabled = !isEnabled && featureKey;

            return isDisabled ? (
              <button
                key={item.path}
                onClick={() => handleDisabledClick(featureKey)}
                className={cn(
                  "w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 group relative",
                  "text-muted-foreground/50 cursor-pointer hover:bg-white/5"
                )}
              >
                <Wrench className="h-5 w-5 text-orange-500/50" />
                <span className="font-medium flex-1 text-left">{item.label}</span>
                <span className="text-[10px] text-orange-500/70 font-medium">
                  ပြုပြင်နေ
                </span>
              </button>
            ) : (
              <Link
                key={item.path}
                to={item.path}
                className={cn(
                  "flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 group relative",
                  active
                    ? "bg-primary/10 text-primary border border-primary/20 shadow-[0_0_15px_hsl(var(--primary)/0.15)]"
                    : "text-muted-foreground hover:text-foreground hover:bg-white/5",
                )}
                style={{ willChange: active ? "auto" : "transform" }}
              >
                <Icon
                  className={cn(
                    "h-5 w-5 transition-all duration-200",
                    active ? "text-primary drop-shadow-[0_0_8px_hsl(var(--primary)/0.5)]" : "group-hover:scale-110",
                  )}
                />
                <span className="font-medium flex-1">{item.label}</span>
                {status && status !== "active" && (
                  <FeatureStatusBadge status={status} size="sm" />
                )}
              </Link>
            );
          })}
        </nav>

        {/* Bottom Section */}
        <div className="px-3 py-4 border-t border-white/5 space-y-1">
          {user && (
            <div className="mt-4 p-3 rounded-xl bg-white/5 border border-white/5">
              <div className="flex items-center gap-3">
                <Avatar className="h-9 w-9 ring-2 ring-primary/20">
                  <AvatarFallback className="bg-primary/10 text-primary text-sm">
                    {userInitials}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{userName}</p>
                  <p className="text-xs text-muted-foreground truncate">{userEmail}</p>
                </div>
              </div>
              <button
                onClick={() => signOut()}
                className="w-full mt-3 flex items-center justify-center gap-2 px-3 py-2 text-sm text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-lg transition-all duration-200"
              >
                <LogOut className="h-4 w-4" />
                Sign Out
              </button>
            </div>
          )}
        </div>

      </aside>

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

MainSidebar.displayName = "MainSidebar";
