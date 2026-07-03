import { Link, useLocation } from "react-router-dom";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { AlertCircle, Bot } from "lucide-react";

const NotFound = () => {
  const location = useLocation();

  useEffect(() => {
    console.error("404 Error: User attempted to access non-existent route:", location.pathname);
  }, [location.pathname]);

  return (
    <div className="min-h-screen bg-black text-foreground flex items-center justify-center px-4">
      <main className="w-full max-w-md text-center space-y-6">
        <div className="mx-auto h-16 w-16 rounded-full border border-primary/25 bg-primary/10 flex items-center justify-center">
          <AlertCircle className="h-8 w-8 text-primary" />
        </div>
        <div className="space-y-2">
          <p className="text-sm font-semibold tracking-[0.3em] text-primary/80">404</p>
          <h1 className="text-3xl font-bold">Page not found</h1>
          <p className="text-sm text-muted-foreground">
            This BeeBot build only keeps the agent surface. The route you opened is no longer available.
          </p>
          <p className="text-xs text-muted-foreground/70 font-mono break-all">{location.pathname}</p>
        </div>
        <Link to="/beebot">
          <Button className="gap-2">
            <Bot className="h-4 w-4" />
            Open BeeBot
          </Button>
        </Link>
      </main>
    </div>
  );
};

export default NotFound;
