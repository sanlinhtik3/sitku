import { Link, useLocation } from "react-router-dom";
import { useState, lazy, Suspense } from "react";
import { Home, BookOpen, Newspaper, CreditCard, User, Bot } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
const AgentChatDialog = lazy(() => import("@/components/agent-chat/AgentChatDialog").then(m => ({ default: m.AgentChatDialog })));

export const PublicMobileNav = () => {
  const location = useLocation();
  const { user } = useAuth();
  const [beebotOpen, setBeebotOpen] = useState(false);

  const publicNavItems = user
    ? [
        { icon: Home, label: "Home", path: "/" },
        { icon: Newspaper, label: "Learn", path: "/learn" },
        { icon: CreditCard, label: "Pricing", path: "/ai-content-pricing" },
      ]
    : [
        { icon: Home, label: "Home", path: "/" },
        { icon: BookOpen, label: "Courses", path: "/courses" },
        { icon: Newspaper, label: "Learn", path: "/learn" },
        { icon: CreditCard, label: "Pricing", path: "/ai-content-pricing" },
      ];

  const authNavItem = user 
    ? { icon: User, label: "Dashboard", path: "/dashboard" }
    : { icon: User, label: "Sign In", path: "/auth" };

  const navItems = [...publicNavItems, authNavItem];
  const totalCols = user ? 5 : 5;

  return (
    <>
      <nav className="fixed bottom-0 left-0 right-0 z-50 md:hidden border-t border-white/5 bg-background/90 backdrop-blur-xl safe-area-pb">
        <div className={cn("grid h-16", `grid-cols-${totalCols}`)}>
          {/* BeeBot button - first position when logged in */}
          {user && (
            <button
              onClick={() => setBeebotOpen(true)}
              className={cn(
                "flex flex-col items-center justify-center gap-0.5 transition-all duration-200 touch-manipulation active:scale-95 relative",
                beebotOpen
                  ? "text-primary"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <Bot className={cn(
                "h-5 w-5 transition-all duration-200",
                beebotOpen && "drop-shadow-[0_0_8px_hsl(var(--primary)/0.5)]"
              )} />
              <span className="text-[9px] font-medium">BeeBot</span>
            </button>
          )}

          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = location.pathname === item.path;
            
            return (
              <Link
                key={item.path}
                to={item.path}
                className={cn(
                  "flex flex-col items-center justify-center gap-0.5 transition-all duration-200 touch-manipulation active:scale-95 relative",
                  isActive 
                    ? "text-primary" 
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                <Icon className={cn(
                  "h-5 w-5 transition-all duration-200",
                  isActive && "drop-shadow-[0_0_8px_hsl(var(--primary)/0.5)]"
                )} />
                <span className="text-[9px] font-medium">{item.label}</span>
                {isActive && (
                  <div className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-0.5 bg-primary rounded-full shadow-[0_0_10px_hsl(var(--primary)/0.5)]" />
                )}
              </Link>
            );
          })}
        </div>
      </nav>
      <Suspense fallback={null}>
        {user && beebotOpen && (
          <AgentChatDialog open={beebotOpen} onOpenChange={setBeebotOpen} userId={user.id} />
        )}
      </Suspense>
    </>
  );
};
