import { InfiniteMovingCards } from "@/components/ui/infinite-moving-cards";

const testimonialsRow1 = [
  { quote: "BeeBot က ငါ့ဘဝကို ပြောင်းလဲပစ်တယ်။ ငွေကြေးစီမံခန့်ခွဲမှုကို အလိုအလျောက် track လုပ်ပေးတယ်။", name: "Kyaw Min", title: "@kyawmin_mm" },
  { quote: "ZOE CRYPTO transformed my understanding of blockchain. The courses are comprehensive and easy to follow!", name: "Sarah Johnson", title: "@sarah_crypto" },
  { quote: "FlowState Finance က ငါ့ရဲ့ ဝင်ငွေ ထွက်ငွေကို အရမ်းလွယ်ကူစွာ ခြေရာခံပေးတယ်။", name: "Thiri Aung", title: "@thiri_dev" },
  { quote: "As a developer, the AI content writer saved me hours of work. 10x faster content creation is real.", name: "Michael Chen", title: "@mchen_dev" },
  { quote: "Workspace feature က team management အတွက် အရမ်းကောင်းတယ်။ Leaderboard က motivation ပေးတယ်။", name: "Zaw Lin", title: "@zawlin_tech" },
  { quote: "The instructors are world-class. I went from knowing nothing about crypto to managing my own portfolio.", name: "Emma Williams", title: "@emma_invest" },
];

const testimonialsRow2 = [
  { quote: "Easy SRT tool က subtitle generate လုပ်တာ အရမ်းမြန်တယ်။ Creator တွေအတွက် must-have tool ပဲ။", name: "Htet Aung", title: "@htetaung_creator" },
  { quote: "Pro Plan worth every kyat. The personal API key integration is seamless and powerful.", name: "David Park", title: "@dpark_ai" },
  { quote: "BeeBot ရဲ့ step-by-step reasoning က တကယ့် human-like ပဲ။ ဘယ် chatbot နဲ့မှ မတူဘူး။", name: "Nay Chi", title: "@naychi_mm" },
  { quote: "Referral system က အရမ်းကောင်းတယ်။ Friends တွေကို invite လုပ်ပြီး credits ရတယ်။ Win-win!", name: "Phyo Wai", title: "@phyowai_crypto" },
  { quote: "50+ courses with certificates - this platform is seriously underrated. Best crypto education in Myanmar.", name: "Alex Rivera", title: "@alex_blockchain" },
  { quote: "BeeBot ရဲ့ autonomous agent system က တကယ့်ကို impressive ပဲ။ Channel management အတွက် best tool!", name: "Su Myat", title: "@sumyat_design" },
];

export const TestimonialsSection = () => {
  return (
    <section className="py-16 lg:py-24 relative overflow-hidden section-elevated section-fade-top">
      
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 mb-8 sm:mb-10 relative z-10">
        <h2 className="text-xl sm:text-2xl lg:text-3xl font-bold">
          <span className="text-primary mr-2">&gt;</span>
          What People Say
        </h2>
      </div>

      <div className="space-y-4 max-w-7xl mx-auto">
        <InfiniteMovingCards items={testimonialsRow1} direction="left" speed="slow" />
        <InfiniteMovingCards items={testimonialsRow2} direction="right" speed="slow" />
      </div>
    </section>
  );
};
