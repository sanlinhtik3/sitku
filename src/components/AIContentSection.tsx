import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import { Sparkles, CheckCircle, ArrowRight, Zap } from "lucide-react";
import { AnimatedCounter } from "@/components/ui/animated-counter";
import { useState, useEffect, useRef } from "react";
import { Progress } from "@/components/ui/progress";

const aiPrompts = [
  {
    prompt: "Creating a blog post about DeFi basics for beginners...",
    output: "Decentralized Finance (DeFi) is revolutionizing how we interact with money. Unlike traditional banking..."
  },
  {
    prompt: "Generating social media caption for BeeBot launch...",
    output: "🐝 Meet BeeBot — your personal Agentic AI that learns, adapts, and works for you 24/7..."
  },
  {
    prompt: "Writing course description for Blockchain 101...",
    output: "Master the fundamentals of blockchain technology in this comprehensive beginner-friendly course..."
  },
];

export const AIContentSection = () => {
  const navigate = useNavigate();
  const [activeIndex, setActiveIndex] = useState(0);
  const [progress, setProgress] = useState(0);
  const sectionRef = useRef<HTMLElement>(null);
  const [isVisible, setIsVisible] = useState(false);

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

  // Cycle prompt index — only when visible
  useEffect(() => {
    if (!isVisible) return;
    const interval = setInterval(() => {
      setActiveIndex((prev) => (prev + 1) % aiPrompts.length);
      setProgress(0);
    }, 4500);
    return () => clearInterval(interval);
  }, [isVisible]);

  // Progress bar — only when visible
  useEffect(() => {
    if (!isVisible) return;
    const timer = setTimeout(() => setProgress(92), 300);
    return () => clearTimeout(timer);
  }, [activeIndex, isVisible]);

  const features = [
    "Advanced AI learning from your content library",
    "Multiple languages and tones supported",
    "Quality scoring and improvement suggestions",
    "Save time and maintain consistency",
  ];

  return (
    <section ref={sectionRef} className="py-16 lg:py-24 relative overflow-hidden section-elevated section-fade-top">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,hsl(var(--primary)/0.06),transparent_70%)] pointer-events-none" />

      <div className="container mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        <div className="grid lg:grid-cols-2 gap-8 lg:gap-12 items-center">
          {/* LEFT: Content */}
          <div className="animate-[fadeInUp_0.5s_ease-out_both]">
            <div className="mb-8 sm:mb-10">
              <h2 className="text-xl sm:text-2xl lg:text-3xl font-bold">
                <span className="text-primary mr-2">&gt;</span>
                AI Content Writer
              </h2>
            </div>

            <p className="text-sm sm:text-base text-muted-foreground mb-6 max-w-lg">
              Our advanced AI content writer learns from your knowledge base to create high-quality,
              on-brand content that matches your style and voice.
            </p>

            {/* Stats */}
            <div className="grid grid-cols-3 gap-2 sm:gap-3 mb-6">
              {[
                { end: 10, suffix: "x", label: "Faster" },
                { end: 95, suffix: "%", label: "Quality", live: true },
                { end: 50, suffix: "+", label: "Types" },
              ].map((stat, i) => (
                <div
                  key={stat.label}
                  className="text-center p-3 rounded-xl bg-white/[0.03] backdrop-blur-sm border border-white/[0.08] shadow-[0_0_20px_hsl(var(--primary)/0.08)] animate-[fadeInUp_0.4s_ease-out_both]"
                  style={{ animationDelay: `${i * 100}ms` }}
                >
                  <div className="flex items-center justify-center gap-1 text-lg sm:text-xl font-bold text-primary mb-0.5">
                    <AnimatedCounter end={stat.end} suffix={stat.suffix} />
                    {stat.live && (
                      <span className="relative flex h-2 w-2 ml-1">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75" />
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-primary" />
                      </span>
                    )}
                  </div>
                  <p className="text-[10px] sm:text-xs text-muted-foreground">{stat.label}</p>
                </div>
              ))}
            </div>

            {/* Features */}
            <div className="space-y-2 mb-6">
              {features.map((feature, index) => (
                <div
                  key={index}
                  className="flex items-center gap-2.5 group animate-[fadeInLeft_0.3s_ease-out_both]"
                  style={{ animationDelay: `${index * 60}ms` }}
                >
                  <CheckCircle className="w-4 h-4 text-primary flex-shrink-0" />
                  <span className="text-xs sm:text-sm text-muted-foreground group-hover:text-foreground transition-colors">
                    {feature}
                  </span>
                </div>
              ))}
            </div>

            <div className="hover:scale-[1.02] transition-transform">
              <Button
                size="sm"
                onClick={() => navigate("/ai-content-pricing")}
                className="group h-9 text-xs sm:text-sm shadow-[0_0_20px_hsl(var(--primary)/0.3)] hover:shadow-[0_0_30px_hsl(var(--primary)/0.5)] transition-shadow"
              >
                <Sparkles className="w-3.5 h-3.5 mr-1.5" />
                See AI Pricing
                <ArrowRight className="w-3.5 h-3.5 ml-1.5 group-hover:translate-x-1 transition-transform" />
              </Button>
            </div>
          </div>

          {/* RIGHT: AI Preview Card */}
          <div className="relative animate-[fadeInRight_0.6s_ease-out_0.2s_both]">
            <div className="absolute -top-10 -right-10 w-[200px] h-[200px] sm:w-[300px] sm:h-[300px] bg-primary/15 rounded-full blur-[80px] pointer-events-none" />

            <div className="relative bg-white/[0.03] backdrop-blur-sm border border-white/[0.08] rounded-2xl p-5 sm:p-6 overflow-hidden shadow-[0_0_30px_hsl(var(--primary)/0.1)] hover:scale-[1.01] transition-transform duration-300">
              {/* Card Header */}
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <div className="h-8 w-8 rounded-lg bg-primary/20 flex items-center justify-center">
                    <Zap className="h-4 w-4 text-primary" />
                  </div>
                  <span className="text-sm font-semibold text-foreground">AI Writer</span>
                </div>
                <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-primary/10 border border-primary/20">
                  <span className="relative flex h-1.5 w-1.5">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75" />
                    <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-primary" />
                  </span>
                  <span className="text-[10px] font-medium text-primary">Live</span>
                </div>
              </div>

              {/* Prompt Area */}
              <div className="mb-3 p-3 rounded-xl bg-white/[0.03] border border-white/[0.05]">
                <p className="text-[10px] text-muted-foreground/60 mb-1.5 uppercase tracking-wider">Prompt</p>
                <p key={activeIndex + "-prompt"} className="text-xs sm:text-sm text-foreground/80 animate-[fadeInUp_0.3s_ease-out_both]">
                  {aiPrompts[activeIndex].prompt}
                </p>
              </div>

              {/* Progress */}
              <div className="mb-3">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[10px] text-muted-foreground/60 uppercase tracking-wider">Generating</span>
                  <span className="text-[10px] text-primary font-medium">{progress}%</span>
                </div>
                <Progress value={progress} className="h-1.5" />
              </div>

              {/* Output Area */}
              <div className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.04]">
                <p className="text-[10px] text-muted-foreground/60 mb-1.5 uppercase tracking-wider">Output</p>
                <p key={activeIndex + "-output"} className="text-xs text-muted-foreground leading-relaxed animate-[fadeIn_0.4s_ease-out_0.5s_both]">
                  {aiPrompts[activeIndex].output}
                </p>
              </div>

              <div className="absolute -bottom-3 -right-3 opacity-10 animate-[spin_8s_linear_infinite]">
                <Sparkles className="h-16 w-16 text-primary" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
