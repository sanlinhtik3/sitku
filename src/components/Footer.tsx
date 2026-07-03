import { Link } from "react-router-dom";
import { Coins, Download, ArrowRight } from "lucide-react";
import { Button } from "./ui/button";
import { usePWAInstall } from "@/hooks/usePWAInstall";
import { useState } from "react";
import { toast } from "sonner";

export const Footer = () => {
  const { isInstallable } = usePWAInstall();
  const [email, setEmail] = useState("");

  const handleSubscribe = (e: React.FormEvent) => {
    e.preventDefault();
    if (email) {
      toast.success("Thanks for subscribing!");
      setEmail("");
    }
  };
  
  return (
    <footer className="border-t border-white/[0.06] bg-white/[0.02] relative overflow-hidden section-fade-top">
      <div className="absolute -top-20 left-1/3 w-[200px] h-[200px] bg-primary/[0.05] rounded-full blur-[100px] pointer-events-none" />
      {/* Newsletter CTA */}
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-10 sm:py-14 relative z-10">
        <div className="mb-8 sm:mb-10">
          <h2 className="text-xl sm:text-2xl font-bold mb-1">
            <span className="text-primary mr-2">&gt;</span>
            Stay Updated
          </h2>
          <p className="text-muted-foreground text-xs sm:text-sm ml-6">
            Get the latest crypto insights and platform updates
          </p>
        </div>

        <form onSubmit={handleSubscribe} className="flex flex-col sm:flex-row gap-2 max-w-md mb-10">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Enter your email"
            className="flex-1 h-10 px-4 text-sm rounded-xl bg-white/[0.03] border border-white/[0.08] text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/40 focus:shadow-[0_0_20px_hsl(var(--primary)/0.15)] transition-all"
          />
          <Button type="submit" size="sm" className="h-10 px-5 text-sm group">
            Subscribe
            <ArrowRight className="h-3.5 w-3.5 ml-1.5 group-hover:translate-x-1 transition-transform" />
          </Button>
        </form>

        <div className="grid grid-cols-2 md:grid-cols-3 gap-6 sm:gap-8">
          {/* Brand */}
          <div className="col-span-2 md:col-span-1 space-y-3">
            <Link to="/" className="flex items-center gap-2">
              <Coins className="h-5 w-5 text-primary" />
              <span className="text-lg font-bold text-foreground">ZOE CRYPTO</span>
            </Link>
            <p className="text-muted-foreground text-xs max-w-xs">
              Master blockchain technology and cryptocurrency trading with expert-led courses and AI tools.
            </p>
            {isInstallable && (
              <Link to="/install">
                <Button variant="outline" size="sm" className="gap-2 h-8 text-xs border-white/[0.08] hover:bg-white/[0.05]">
                  <Download className="h-3.5 w-3.5" />
                  Install App
                </Button>
              </Link>
            )}
          </div>
          
          {/* Links */}
          <div>
            <h3 className="font-semibold text-foreground text-sm mb-3">Platform</h3>
            <ul className="space-y-2 text-xs">
              <li><Link to="/courses" className="text-muted-foreground hover:text-primary transition-colors">Courses</Link></li>
              <li><Link to="/ai-content-pricing" className="text-muted-foreground hover:text-primary transition-colors">AI Content</Link></li>
              <li><Link to="/auth" className="text-muted-foreground hover:text-primary transition-colors">Dashboard</Link></li>
              <li><Link to="/learn" className="text-muted-foreground hover:text-primary transition-colors">Blog</Link></li>
            </ul>
          </div>
          
          {/* Tools */}
          <div>
            <h3 className="font-semibold text-foreground text-sm mb-3">Tools</h3>
            <ul className="space-y-2 text-xs">
              <li><Link to="/sitku" className="text-muted-foreground hover:text-primary transition-colors">🌸 Sitku AI</Link></li>
              <li><Link to="/auth" className="text-muted-foreground hover:text-primary transition-colors">FlowState</Link></li>
              <li><Link to="/auth" className="text-muted-foreground hover:text-primary transition-colors">Workspaces</Link></li>
              <li><Link to="/ai-content-pricing" className="text-muted-foreground hover:text-primary transition-colors">Pricing</Link></li>
            </ul>
          </div>
        </div>
        
        <div className="border-t border-white/[0.06] mt-8 pt-6 text-center">
          <p className="text-muted-foreground text-xs">
            © {new Date().getFullYear()} ZOE CRYPTO. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  );
};
