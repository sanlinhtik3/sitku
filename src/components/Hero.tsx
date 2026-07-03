import { Link } from "react-router-dom";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ArrowRight, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/hooks/useAuth";

import { BeeFireflyButton } from "@/components/ui/BeeFireflyButton";

export const Hero = () => {
  const { user } = useAuth();
  

  return (
    <section className="relative min-h-[80vh] sm:min-h-screen flex items-center justify-center overflow-hidden animate-[fadeIn_0.6s_ease]">

      {/* Pure dark background with subtle glow orbs */}
      <div className="absolute inset-0 bg-background" />
      <div className="absolute top-1/3 left-1/4 w-[200px] sm:w-[300px] lg:w-[400px] h-[200px] sm:h-[300px] lg:h-[400px] bg-primary/15 rounded-full blur-[120px] sm:blur-[150px]" />
      <div className="absolute bottom-1/3 right-1/4 w-[150px] sm:w-[200px] lg:w-[300px] h-[150px] sm:h-[200px] lg:h-[300px] bg-primary/10 rounded-full blur-[100px] sm:blur-[120px]" />

      <div className="container mx-auto relative z-10 px-4 sm:px-6 lg:px-8 py-16 sm:py-24 lg:py-32">
        <div className="max-w-4xl mx-auto text-center space-y-5 sm:space-y-6">
          {/* Pututu Mascot */}
          <div className="animate-[fadeSlideUp_0.5s_ease]">
            <span className="text-5xl sm:text-6xl lg:text-7xl inline-block animate-[float_4s_ease-in-out_infinite]">
              🌸
            </span>
          </div>

          {/* Giant Title */}
          <h1 className="text-5xl sm:text-7xl lg:text-8xl font-bold tracking-[-0.04em] leading-[0.9] text-foreground animate-[fadeSlideUp_0.5s_ease_0.1s_both]">
            ZOE CRYPTO
          </h1>

          {/* Teal Tagline */}
          <p className="text-sm sm:text-base lg:text-lg uppercase tracking-[0.2em] text-primary font-medium animate-[fadeSlideUp_0.5s_ease_0.2s_both]">တွေးလိုက်ရုံနဲ့ အလုပ်က ပြီးနေပြီ</p>

          {/* Burmese Subtitle */}
          <p className="text-sm sm:text-base text-muted-foreground max-w-[520px] mx-auto leading-relaxed animate-[fadeSlideUp_0.5s_ease_0.3s_both]">မိတ်ဆွေရဲ့ စိတ်ကူးကို လက်တွေ့ကမ္ဘာဆီကို ကူညီပြောင်းလဲပေးမယ့် Personal AI Assistance လေး Sitku</p>

          {/* Announcement Pills */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-2 sm:gap-3 pt-2 animate-[fadeSlideUp_0.5s_ease_0.5s_both]">
            {user ?
              <Link to="/sitku">
                <BeeFireflyButton>
                  <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-white/[0.08] bg-white/[0.03] hover:bg-white/[0.06] hover:scale-[1.02] transition-all cursor-pointer group">
                    <span className="text-base">🌸</span>
                    <span className="text-xs sm:text-sm font-medium text-foreground">Meet Sitku</span>
                    <Badge variant="outline" className="border-primary/50 text-primary text-[9px] sm:text-[10px] px-1.5 py-0">NEW</Badge>
                    <ArrowRight className="h-3 w-3 text-primary group-hover:translate-x-1 transition-transform" />
                  </div>
                </BeeFireflyButton>
              </Link> :

              <Link to="/auth">
                <BeeFireflyButton>
                  <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-white/[0.08] bg-white/[0.03] hover:bg-white/[0.06] hover:scale-[1.02] transition-all cursor-pointer group">
                    <span className="text-base">🌸</span>
                    <span className="text-xs sm:text-sm font-medium text-foreground">Meet Sitku</span>
                    <Badge variant="outline" className="border-primary/50 text-primary text-[9px] sm:text-[10px] px-1.5 py-0">NEW</Badge>
                    <ArrowRight className="h-3 w-3 text-primary group-hover:translate-x-1 transition-transform" />
                  </div>
                </BeeFireflyButton>
              </Link>
              }

            <Link to="/ai-content-pricing">
              <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-white/[0.08] bg-white/[0.03] hover:bg-white/[0.06] hover:scale-[1.02] transition-all cursor-pointer group">
                <Sparkles className="h-3 w-3 text-primary" />
                <span className="text-xs sm:text-sm font-medium text-foreground">AI Content 10x Faster</span>
                <ArrowRight className="h-3 w-3 text-primary group-hover:translate-x-1 transition-transform" />
              </div>
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
};
