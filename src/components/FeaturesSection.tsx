import { Brain, Wallet, Users, GraduationCap, Gift, Shield } from "lucide-react";
import { HoverEffect } from "@/components/ui/card-hover-effect";
import { ScrollReveal } from "@/components/ui/scroll-reveal";

const features = [
  {
    icon: Brain,
    title: "AI-Powered Tools",
    description: "Sitku, Content Writer, Easy SRT - Smart AI assistants at your fingertips"
  },
  {
    icon: Wallet,
    title: "FlowState Finance",
    description: "Track income, expenses, and subscriptions with beautiful visualizations"
  },
  {
    icon: Users,
    title: "Team Workspaces",
    description: "Collaborate on tasks with gamification, points, and leaderboards"
  },
  {
    icon: GraduationCap,
    title: "50+ Expert Courses",
    description: "Learn crypto, blockchain, and trading with certificates on completion"
  },
  {
    icon: Gift,
    title: "Referral Rewards",
    description: "Earn credits by inviting friends to join the platform"
  },
  {
    icon: Shield,
    title: "Secure & Private",
    description: "Enterprise-grade security protecting your data and progress"
  }
];

export const FeaturesSection = () => {
  return (
    <section className="py-12 sm:py-16 lg:py-24 relative">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <ScrollReveal className="text-center max-w-3xl mx-auto mb-8 sm:mb-12 lg:mb-16">
          <h2 className="text-2xl sm:text-3xl lg:text-4xl font-bold mb-3 sm:mb-4">
            Why Choose <span className="text-primary">ZOE CRYPTO</span>
          </h2>
          <p className="text-muted-foreground text-sm sm:text-base lg:text-lg">
            Everything you need to learn, create, manage, and grow - all in one platform
          </p>
        </ScrollReveal>
        
        <HoverEffect items={features} className="gap-3 sm:gap-4 lg:gap-6" />
      </div>
    </section>
  );
};
