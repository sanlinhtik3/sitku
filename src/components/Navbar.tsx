import { Link, useLocation } from "react-router-dom";
import { useState, lazy, Suspense } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Coins,
  User,
  LogOut,
  LayoutDashboard,
  Crown,
  Menu,
  UserCircle,
  Award,
  Receipt,
  
  Users,
  Shield,
  Briefcase,
  Home,
  BookOpen,
  Newspaper,
  CreditCard,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useProPlan } from "@/hooks/useProPlan";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { NotificationBell } from "@/components/NotificationBell";
const UserProfileDialog = lazy(() => import("@/components/UserProfileDialog").then(m => ({ default: m.UserProfileDialog })));
import { useAgentChatDialog } from "@/providers/AgentChatProvider";
import { cn } from "@/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export const Navbar = ({ onMobileLessonMenuToggle }: { onMobileLessonMenuToggle?: () => void }) => {
  const { user, isAdmin, isCreator, signOut } = useAuth();
  const { isPro, daysRemaining } = useProPlan();
  const location = useLocation();
  const isMobile = useIsMobile();
  const [profileDialogOpen, setProfileDialogOpen] = useState(false);
  const agentChat = useAgentChatDialog();
  const isLessonPage = location.pathname.includes("/lesson/");
  const { data: referralSettings } = useQuery({
    queryKey: ["referral-settings"],
    queryFn: async () => {
      const { data, error } = await supabase.from("referral_settings").select("is_enabled").single();
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });
  return (
    <header
      className={cn(
        "fixed top-0 left-0 right-0 z-50 border-b border-border/50 backdrop-blur-md bg-background/75",
        "transition-all duration-200",
        "pt-[env(safe-area-inset-top,0px)]",
      )}
    >
    <nav aria-label="Main navigation">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div
          className={cn(
            "flex items-center justify-between transition-all duration-200",
            isLessonPage ? "h-14" : "h-16",
          )}
        >
          <div className="flex items-center gap-3">
            {isMobile && isLessonPage && onMobileLessonMenuToggle && (
              <Button
                variant="ghost"
                size="icon"
                onClick={onMobileLessonMenuToggle}
                aria-label="Toggle lesson menu"
                className="h-11 w-11 active:scale-95 touch-manipulation"
              >
                <Menu className="h-5 w-5" />
              </Button>
            )}

            <Link to="/" className="flex items-center gap-2">
              <Coins
                className={cn(
                  "text-primary",
                  isLessonPage ? "h-5 w-5 sm:h-6 sm:w-6" : "h-6 w-6 sm:h-7 sm:w-7 md:h-8 md:w-8",
                )}
              />
              <span
                className={cn(
                  "font-bold bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent transition-all",
                  isLessonPage ? "text-base sm:text-lg md:text-xl" : "text-lg sm:text-xl md:text-2xl",
                )}
              >
                {isMobile && isLessonPage ? "ZOE" : "ZOE CRYPTO"}
              </span>
            </Link>
          </div>

          {!(isMobile && isLessonPage) && (
            <div className="hidden md:flex items-center gap-6">
              <Link to="/" className={cn("text-sm font-medium transition-colors relative pb-1 flex items-center gap-1.5", location.pathname === "/" ? "text-primary after:absolute after:bottom-0 after:left-0 after:right-0 after:h-0.5 after:bg-primary" : "text-muted-foreground hover:text-foreground")}>
                <Home className="h-3.5 w-3.5" />
                Home
              </Link>
              <Link to="/courses" className={cn("text-sm font-medium transition-colors relative pb-1 flex items-center gap-1.5", location.pathname === "/courses" ? "text-primary after:absolute after:bottom-0 after:left-0 after:right-0 after:h-0.5 after:bg-primary" : "text-muted-foreground hover:text-foreground")}>
                <BookOpen className="h-3.5 w-3.5" />
                Courses
              </Link>
              <Link to="/learn" className={cn("text-sm font-medium transition-colors relative pb-1 flex items-center gap-1.5", location.pathname === "/learn" ? "text-primary after:absolute after:bottom-0 after:left-0 after:right-0 after:h-0.5 after:bg-primary" : "text-muted-foreground hover:text-foreground")}>
                <Newspaper className="h-3.5 w-3.5" />
                Learn
              </Link>
              <Link to="/ai-content-pricing" className={cn("text-sm font-medium transition-colors relative pb-1 flex items-center gap-1.5", location.pathname === "/ai-content-pricing" ? "text-primary after:absolute after:bottom-0 after:left-0 after:right-0 after:h-0.5 after:bg-primary" : "text-muted-foreground hover:text-foreground")}>
                <CreditCard className="h-3.5 w-3.5" />
                Pricing
              </Link>

            </div>
          )}

          <div className="flex items-center gap-3">
            {user ? (
              <>
                {isPro && daysRemaining !== null && (
                  <>
                    {!(isMobile && isLessonPage) && (
                      <Badge
                        variant="outline"
                        className={cn(
                          "hidden sm:flex items-center gap-1.5 border-amber-500/50 bg-amber-500/10 text-amber-600 dark:text-amber-400 hover:bg-amber-500/20",
                          daysRemaining < 7 && "animate-pulse",
                        )}
                      >
                        <Crown className="h-3 w-3 fill-amber-500 text-amber-500" />
                        <span className="text-xs font-medium">
                          Pro • {daysRemaining} {daysRemaining === 1 ? "day" : "days"}
                        </span>
                      </Badge>
                    )}

                    <div className="sm:hidden relative">
                      <Crown className={cn("text-amber-500 fill-amber-500", isLessonPage ? "h-4 w-4" : "h-5 w-5")} />
                      <span className="absolute -top-1 -right-1 bg-amber-500 text-white text-[10px] font-bold rounded-full h-3.5 w-3.5 flex items-center justify-center">
                        {daysRemaining}
                      </span>
                    </div>
                  </>
                )}

                <NotificationBell />
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost-light" size="sm" className="gap-2">
                      <Avatar className="h-6 w-6 ring-1 ring-primary/30">
                        <AvatarFallback className="bg-gradient-to-br from-primary/20 to-primary/40 text-primary text-xs">
                          {user.email?.charAt(0).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <span className="hidden sm:inline">Account</span>
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-48">
                    <DropdownMenuItem asChild>
                      <Link to="/dashboard" className="cursor-pointer">
                        <LayoutDashboard className="h-4 w-4 mr-2" />
                        Dashboard
                      </Link>
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setProfileDialogOpen(true)} className="cursor-pointer">
                      <UserCircle className="h-4 w-4 mr-2" />
                      Profile
                    </DropdownMenuItem>
                    {referralSettings?.is_enabled && (
                      <DropdownMenuItem asChild>
                        <Link to="/referrals" className="cursor-pointer">
                          <Users className="h-4 w-4 mr-2" />
                          Referral Program
                        </Link>
                      </DropdownMenuItem>
                    )}
                    {isAdmin && (
                      <DropdownMenuItem asChild>
                        <Link to="/admin" className="cursor-pointer">
                          <LayoutDashboard className="h-4 w-4 mr-2" />
                          Admin Panel
                        </Link>
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={signOut} className="cursor-pointer text-destructive">
                      <LogOut className="h-4 w-4 mr-2" />
                      Sign Out
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
                <Suspense fallback={null}>
                  <UserProfileDialog open={profileDialogOpen} onOpenChange={setProfileDialogOpen} />
                </Suspense>
              </>
            ) : (
              <Link to="/auth">
                <Button
                  size="sm"
                  className="bg-gradient-to-r from-primary to-primary/80 hover:from-primary/90 hover:to-primary/70"
                >
                  Sign In
                </Button>
              </Link>
            )}
          </div>
        </div>
      </div>
    </nav>
    </header>
  );
};
