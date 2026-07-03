import { useLocation, useNavigate } from "react-router-dom";
import { Separator } from "@/components/ui/separator";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { LayoutDashboard, BookOpen, Users, Sparkles, Settings, Home } from "lucide-react";
import { cn } from "@/lib/utils";
import { AdminSearch } from "./AdminSearch";
import { AdminNotifications } from "./AdminNotifications";

export function SiteHeader() {
  const location = useLocation();
  const navigate = useNavigate();
  const hash = location.hash.replace("#", "");

  const navItems = [
    { label: "Home", icon: Home, path: "/", isExternal: true },
    { label: "Dashboard", icon: LayoutDashboard, hash: "stats" },
    { label: "Content", icon: BookOpen, hash: "courses" },
    { label: "Users", icon: Users, hash: "users" },
    { label: "AI Tools", icon: Sparkles, hash: "ai-content-writer" },
  ];

  const isActive = (item: (typeof navItems)[0]) => {
    if (item.isExternal) return location.pathname === item.path;
    return hash === item.hash;
  };

  const handleNavClick = (item: (typeof navItems)[0]) => {
    if (item.isExternal) {
      navigate(item.path!);
    } else {
      window.location.hash = item.hash!;
    }
  };

  const getPageTitle = () => {
    switch (hash) {
      case "courses":
        return "Courses";
      case "lessons":
        return "Lessons";
      case "posts":
        return "Posts";
      case "users":
        return "All Users";
      case "enrollments":
        return "Enrollments";
      case "coupons":
        return "Coupons";
      case "ai-content-writer":
        return "AI Content Writer";
      case "stats":
      default:
        return "Dashboard Overview";
    }
  };

  return (
    <header className="sticky top-0 z-40 shrink-0 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 w-full overflow-x-hidden">
      {/* Top row with trigger and navigation */}
      <div className="flex h-14 sm:h-16 items-center gap-2 px-2 sm:px-3 md:px-4 max-w-full overflow-x-hidden">
        <SidebarTrigger className="-ml-1 h-11 w-11 sm:h-auto sm:w-auto active:scale-95 transition-transform flex-shrink-0" />
        <Separator orientation="vertical" className="mr-2 h-4 flex-shrink-0" />

        {/* Navigation tabs - hidden on small mobile */}
        <nav className="hidden md:flex items-center gap-1 flex-1 overflow-x-auto scrollbar-hide">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = isActive(item);
            return (
              <Button
                key={item.label}
                variant="ghost"
                size="sm"
                onClick={() => handleNavClick(item)}
                className={cn(
                  "gap-2 transition-colors relative flex-shrink-0",
                  active &&
                    "text-primary after:absolute after:bottom-0 after:left-0 after:right-0 after:h-0.5 after:bg-primary",
                )}
              >
                <Icon className="h-4 w-4" />
                <span className="hidden lg:inline whitespace-nowrap">{item.label}</span>
              </Button>
            );
          })}
        </nav>

        {/* Current page title - visible on mobile */}
        <div className="flex-1 md:hidden min-w-0">
          <h2 className="text-sm font-semibold truncate">{getPageTitle()}</h2>
        </div>

        {/* Quick actions */}
        <div className="flex items-center gap-1.5 sm:gap-2 ml-auto flex-shrink-0">
          <AdminSearch />
          <AdminNotifications />
          <Badge variant="outline" className="hidden sm:flex gap-1 flex-shrink-0">
            <Sparkles className="h-3 w-3" />
            Admin
          </Badge>
        </div>
      </div>
    </header>
  );
}
