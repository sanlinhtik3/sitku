import { useState, useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { Brain, Wallet, FileText, ListChecks, Compass, Sparkles, ArrowRight, Check } from "lucide-react";
import { Button } from "@/components/ui/button";

const chatMessages = [
  { role: "bot", text: "မင်္ဂလာပါ! 🌸 ကျွန်တော်က Sitku ပါ။ ဘာကူညီပေးရမလဲ?" },
  { role: "user", text: "ယနေ့ စားသောက်ဖို့ 5000 ကျခဲ့တယ်" },
  { role: "bot", text: "✅ Food category မှာ 5,000 MMK expense record လုပ်ပြီးပါပြီ။ ဒီလအတွက် Food မှာ 45,000 MMK သုံးထားပါပြီ။" },
];

const capabilities = [
  { icon: Brain, text: "Answer questions intelligently" },
  { icon: Wallet, text: "Manage your finances" },
  { icon: FileText, text: "Create AI content" },
  { icon: ListChecks, text: "Organize tasks & workspaces" },
  { icon: Compass, text: "Navigate app features" },
  { icon: Sparkles, text: "Learn from your preferences" },
];

export const BeeBotShowcaseSection = () => {
  const [visibleMessages, setVisibleMessages] = useState(0);
  const sectionRef = useRef<HTMLElement>(null);
  const [isVisible, setIsVisible] = useState(false);

  // Visibility guard
  useEffect(() => {
    const el = sectionRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => setIsVisible(entry.isIntersecting),
      { threshold: 0.1 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Timer only runs when visible
  useEffect(() => {
    if (!isVisible) return;

    const timeout = setTimeout(() => {
      setVisibleMessages(prev => {
        if (prev < chatMessages.length) return prev + 1;
        return 0; // reset cycle
      });
    }, 1500);

    return () => clearTimeout(timeout);
  }, [isVisible, visibleMessages]);

  return (
    <section ref={sectionRef} className="py-16 lg:py-24 relative overflow-hidden section-elevated section-fade-top">
      <div className="absolute top-1/3 right-0 w-[200px] sm:w-[300px] h-[200px] sm:h-[300px] bg-primary/8 rounded-full blur-[120px]" />
      
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        <div className="mb-8 sm:mb-10">
          <h2 className="text-xl sm:text-2xl lg:text-3xl font-bold">
            <span className="text-primary mr-2">&gt;</span>
            Meet Sitku
          </h2>
          <p className="text-muted-foreground text-xs sm:text-sm mt-1 ml-6">
            Your personal AI assistant that thinks step-by-step
          </p>
        </div>

        <div className="grid lg:grid-cols-2 gap-6 lg:gap-10 items-center">
          {/* Chat Preview */}
          <div className="animate-[fadeInLeft_0.5s_ease-out_both]">
            <div className="bg-white/[0.03] backdrop-blur-sm border border-white/[0.08] rounded-2xl overflow-hidden shadow-[0_0_30px_hsl(var(--primary)/0.1)] hover:scale-[1.01] transition-transform duration-300">
              {/* Chat Header */}
              <div className="flex items-center gap-3 p-3 border-b border-white/[0.06]">
                <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-base">🌸</div>
                <div className="flex-1 min-w-0">
                  <h4 className="font-semibold text-sm text-foreground">Sitku</h4>
                  <p className="text-[10px] text-muted-foreground">Agentic AI • Online</p>
                </div>
              </div>

              {/* Chat Messages */}
              <div className="p-3 space-y-2 min-h-[150px]">
                {chatMessages.slice(0, visibleMessages).map((message, index) => (
                  <div
                    key={index}
                    className={`flex animate-[fadeInUp_0.3s_ease-out_both] ${message.role === "user" ? "justify-end" : "justify-start"}`}
                  >
                    <div className={`max-w-[85%] px-3 py-2 rounded-xl text-xs sm:text-sm ${
                      message.role === "user"
                        ? "bg-primary text-primary-foreground rounded-br-sm"
                        : "bg-white/[0.04] text-foreground rounded-bl-sm border border-white/[0.06]"
                    }`}>
                      {message.text}
                    </div>
                  </div>
                ))}
                {visibleMessages < chatMessages.length && (
                  <div className="flex gap-1 px-3 py-2">
                    <span className="w-1.5 h-1.5 bg-primary/60 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                    <span className="w-1.5 h-1.5 bg-primary/60 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                    <span className="w-1.5 h-1.5 bg-primary/60 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
                  </div>
                )}
              </div>

              {/* Chat Input */}
              <div className="p-3 border-t border-white/[0.06]">
                <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-white/[0.03] border border-white/[0.06]">
                  <span className="text-muted-foreground text-xs sm:text-sm">Ask Sitku anything...</span>
                </div>
              </div>
            </div>

            <div className="flex justify-center mt-4">
              <Link to="/sitku">
                <Button size="sm" className="group h-9 text-xs sm:text-sm">
                  Try Sitku Now
                  <ArrowRight className="h-3.5 w-3.5 ml-2 group-hover:translate-x-1 transition-transform" />
                </Button>
              </Link>
            </div>
          </div>

          {/* Capabilities */}
          <div className="space-y-3 animate-[fadeInRight_0.5s_ease-out_both]">
            <div>
              <h3 className="text-lg sm:text-xl font-bold mb-1">What Sitku Can Do</h3>
              <p className="text-muted-foreground text-xs sm:text-sm">
                One conversation, countless capabilities.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {capabilities.map((capability, index) => (
                <div
                  key={index}
                  className="flex items-center gap-2.5 p-2 sm:p-2.5 rounded-xl bg-white/[0.03] backdrop-blur-sm border border-white/[0.08] hover:border-primary/20 hover:bg-white/[0.05] transition-all shadow-[0_0_15px_hsl(var(--primary)/0.05)] hover:shadow-[0_0_20px_hsl(var(--primary)/0.1)] animate-[fadeInRight_0.3s_ease-out_both]"
                  style={{ animationDelay: `${index * 60}ms` }}
                >
                  <capability.icon className="h-4 w-4 text-primary flex-shrink-0" />
                  <span className="text-xs sm:text-sm font-medium flex-1 min-w-0 truncate">{capability.text}</span>
                  <Check className="h-3.5 w-3.5 text-primary/60 flex-shrink-0" />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
