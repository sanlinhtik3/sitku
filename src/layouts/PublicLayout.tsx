import { ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";
import { Home, BookOpen, Newspaper, CreditCard, User } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import { Navbar } from "@/components/Navbar";

interface PublicLayoutProps {
  children: ReactNode;
}

export function PublicLayout({ children }: PublicLayoutProps) {
  const location = useLocation();
  const { user } = useAuth();

  const publicNavItems = [
    { path: "/", icon: Home, label: "Home" },
    { path: "/courses", icon: BookOpen, label: "Courses" },
    { path: "/learn", icon: Newspaper, label: "Learn" },
    { path: "/ai-content-pricing", icon: CreditCard, label: "Pricing" },
  ];

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Main Navbar */}
      <Navbar />

      {/* Spacer for fixed navbar */}
      <div className="h-16" style={{ marginTop: 'env(safe-area-inset-top, 0px)' }} />

      {/* Main Content */}
      <main className="min-h-[calc(100vh-4rem)]">
        {children}
      </main>

      {/* Mobile Bottom Nav for Public Pages */}
      <nav className="fixed bottom-0 left-0 right-0 z-50 md:hidden border-t border-white/5 bg-background/90 backdrop-blur-xl pb-[env(safe-area-inset-bottom,0px)]">
        <div className="grid grid-cols-5 h-16">
          {[...publicNavItems, user 
            ? { path: "/dashboard", icon: User, label: "Dashboard" }
            : { path: "/auth", icon: User, label: "Sign In" }
          ].map((item) => {
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

      {/* Bottom padding for mobile nav */}
      <div className="h-16 md:hidden" />
    </div>
  );
}
