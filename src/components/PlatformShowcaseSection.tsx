import { Link } from "react-router-dom";
import { Brain, Wallet, GraduationCap, Users, Lightbulb, Gift, ArrowRight } from "lucide-react";

const categories = [
  {
    name: "AI Tools",
    desc: "Smart automation for creators",
    icon: Brain,
    description: "လူတစ်ယောက်လိုခံစားချက်နဲ့ ကိုယ့်လိုအပ်ချက်ကို ကူညီပေးတဲ့ BeeBot",
    link: "/auth",
  },
  {
    name: "Finance",
    desc: "Track, plan, and grow",
    icon: Wallet,
    description: "ဝင်ငွေ၊ ထွက်ငွေ၊ ဘတ်ဂျက် -- FlowState နဲ့ ချိတ်ဆက်ပြီး ခြေရာခံပါ။",
    link: "/auth",
  },
  {
    name: "Learning",
    desc: "Learn at your own pace",
    icon: GraduationCap,
    description: "သင်တန်း ၅၀ ကျော်၊ လက်မှတ်များနဲ့ level up လုပ်ပါ။",
    link: "/courses",
  },
  {
    name: "Teamwork",
    desc: "Collaborate and achieve",
    icon: Users,
    description: "Workspace မှာ Task စီမံ၊ အဖွဲ့သားတွေနဲ့ ပူးပေါင်းပါ။",
    link: "/auth",
  },
  {
    name: "Knowledge",
    desc: "Discover and explore",
    icon: Lightbulb,
    description: "နည်းပညာ၊ စီးပွားရေး၊ ဖန်တီးမှု -- အသိပညာသစ်တွေ ရှာဖွေပါ။",
    link: "/learn",
  },
  {
    name: "Rewards",
    desc: "Earn while you learn",
    icon: Gift,
    description: "Referral ပို့၊ Credit ရယူ၊ Leaderboard တက်ပါ။",
    link: "/auth",
  },
];

export const PlatformShowcaseSection = () => {
  return (
    <section className="py-16 lg:py-24 relative overflow-hidden section-fade-top">
      <div className="absolute -top-20 -left-20 w-[250px] h-[250px] bg-primary/10 rounded-full blur-[100px] pointer-events-none" />
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        <div className="mb-8 sm:mb-10">
          <h2 className="text-xl sm:text-2xl lg:text-3xl font-bold">
            <span className="text-primary mr-2">&gt;</span>
            What You Get
          </h2>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
          {categories.map((cat, i) => (
            <div
              key={cat.name}
              className="animate-[fadeInUp_0.4s_ease-out_both]"
              style={{ animationDelay: `${i * 60}ms` }}
            >
              <Link
                to={cat.link}
                className="group relative flex flex-col bg-white/[0.03] backdrop-blur-sm border border-white/[0.08] rounded-2xl p-4 sm:p-5 transition-all duration-300 hover:bg-white/[0.05] hover:border-primary/20 hover:-translate-y-0.5 h-full shadow-[0_0_20px_hsl(var(--primary)/0.06)] hover:shadow-[0_0_30px_hsl(var(--primary)/0.12)]"
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <cat.icon className="h-5 w-5 text-primary flex-shrink-0" />
                    <span className="text-sm font-semibold text-foreground">{cat.name}</span>
                  </div>
                  <ArrowRight className="h-3.5 w-3.5 text-primary opacity-0 group-hover:opacity-100 group-hover:translate-x-1 transition-all" />
                </div>
                <p className="text-xs text-muted-foreground/80 mb-1">{cat.desc}</p>
                <p className="text-[11px] leading-relaxed text-muted-foreground/50">{cat.description}</p>
              </Link>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};
