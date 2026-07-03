import { useState } from "react";
import { PublicLayout } from "@/layouts/PublicLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { 
  Crown, Sparkles, Zap, Check, X, Star, Infinity,
  Bot, FileText, DollarSign, Video, Briefcase, Key, ChevronRight
} from "lucide-react";
import { motion } from "motion/react";
import { PaymentModal } from "@/components/PaymentModal";
import { useAuth } from "@/hooks/useAuth";
import { useProPlan } from "@/hooks/useProPlan";
import { ProBadge } from "@/components/ProBadge";
import { toast } from "sonner";

// Plan configurations
const PLANS = {
  pro: {
    id: 'pro-plan',
    name: 'Pro Plan',
    price: 9900,
    duration: 30,
    description: 'Full access to all AI features for 30 days'
  },
  pro_plus: {
    id: 'pro-plus-plan',
    name: 'Pro+ Plan',
    price: 14900,
    duration: 30,
    description: 'Ultimate AI power with unlimited access'
  }
};

const AIContentPricing = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { isPro, isProPlus, planType, daysRemaining } = useProPlan();
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<'pro' | 'pro_plus'>('pro');
  
  const { data: paymentMethods } = useQuery({
    queryKey: ["payment-methods"],
    queryFn: async () => {
      const { data, error } = await supabase.from("payment_methods").select("*").eq("is_active", true).order("display_order");
      if (error) throw error;
      return data;
    }
  });
  
  const handleSubscribe = (plan: 'pro' | 'pro_plus') => {
    if (!user) {
      toast.error("Please log in to subscribe");
      navigate("/auth");
      return;
    }
    setSelectedPlan(plan);
    setIsPaymentModalOpen(true);
  };
  
  const handlePaymentSubmit = async (paymentData: any) => {
    if (!user) return;
    const plan = PLANS[selectedPlan];
    
    try {
      const receiptFile = paymentData.receiptFile;
      const fileExt = receiptFile.name.split('.').pop();
      const fileName = `${selectedPlan}_${Date.now()}.${fileExt}`;
      const filePath = `${user.id}/${fileName}`;
      
      const { error: uploadError } = await supabase.storage.from('payment-receipts').upload(filePath, receiptFile);
      if (uploadError) throw uploadError;
      
      const { data: { publicUrl } } = supabase.storage.from('payment-receipts').getPublicUrl(filePath);
      
      const { error } = await supabase.from("pro_subscriptions").insert({
        user_id: user.id,
        plan_type: selectedPlan,
        amount_paid: plan.price,
        duration_days: plan.duration,
        payment_method_id: paymentData.paymentMethodId,
        payment_receipt_url: publicUrl,
        payment_notes: paymentData.notes,
        status: "pending"
      });
      
      if (error) throw error;
      
      toast.success(`${plan.name} request submitted! Awaiting admin approval.`);
      setIsPaymentModalOpen(false);
    } catch (error) {
      console.error("Error submitting order:", error);
      toast.error("Failed to submit order");
    }
  };
  
  const features = [
    { icon: Bot, name: "BeeBot Agentic AI", description: "Intelligent AI assistant with tool execution" },
    { icon: FileText, name: "AI Content Writer", description: "Generate articles, posts, and marketing copy" },
    { icon: Briefcase, name: "Studio Hub", description: "Team collaboration workspaces" },
    { icon: DollarSign, name: "FlowState", description: "Personal finance tracking" },
    { icon: Video, name: "Easy Burmese SRT", description: "Video subtitle generation" },
    
  ];
  
  const comparisonTable = [
    { feature: "Daily AI Credits", free: "3 Credits", pro: "5-15 Credits", proPlus: "10+ / Unlimited" },
    { feature: "Personal API Key", free: false, pro: true, proPlus: true },
    { feature: "With API Key Limit", free: "N/A", pro: "+10 Credits", proPlus: "Unlimited" },
    { feature: "BeeBot AI Assistant", free: true, pro: true, proPlus: true },
    { feature: "AI Content Writer", free: true, pro: true, proPlus: true },
    { feature: "Studio Hub", free: true, pro: true, proPlus: true },
    { feature: "FlowState Finance", free: true, pro: true, proPlus: true },
    { feature: "Easy SRT", free: true, pro: true, proPlus: true },
    { feature: "Priority Processing", free: false, pro: true, proPlus: true },
    { feature: "VIP Support", free: false, pro: false, proPlus: true },
  ];
  
  const faqs = [
    {
      question: "Pro Plan နှင့် Pro+ Plan ဘာကွာသလဲ?",
      answer: "Pro Plan သည် နေ့စဉ် 5 Credits (Personal API Key ထည့်ရင် +10 = 15 Credits) ရပါသည်။ Pro+ Plan သည် နေ့စဉ် 10 Credits ရပြီး Personal API Key ထည့်ထားရင် Unlimited Access ရပါသည်။"
    },
    {
      question: "Credit System က ဘယ်လိုအလုပ်လုပ်လဲ?",
      answer: "နေ့စဉ် Credits များသည် midnight တွင် reset ကျပါသည်။ Free users = 3 Credits၊ Pro = 5-15 Credits၊ Pro+ = 10 Credits (API Key နဲ့ Unlimited)။"
    },
    {
      question: "Personal Gemini API Key ဆိုတာဘာလဲ?",
      answer: "Google Gemini API Key ကို ကိုယ်တိုင် register လုပ်ပြီး ထည့်သွင်းအသုံးပြုနိုင်ပါသည်။ Pro Plan မှာ +10 extra Credits ရပြီး Pro+ Plan မှာ Unlimited Access ရပါသည်။"
    },
    {
      question: "Plan သက်တမ်းကုန်ရင်ဘာဖြစ်မလဲ?",
      answer: "၃၀ ရက် ပြည့်သွားရင် Free plan သို့ပြန်ကျသွားမည်ဖြစ်ပြီး နေ့စဉ် 3 Credits သာ အသုံးပြုနိုင်မည်ဖြစ်ပါသည်။"
    },
    {
      question: "Credits တွေက carry over ဖြစ်သလား?",
      answer: "နေ့စဉ် Credits များသည် midnight တွင် reset ကျပြီး carry over မဖြစ်ပါ။ သို့သော် Pro Bonus Credits (50 credits) နှင့် ဝယ်ယူထားသော Credit Balance များမှာ carry over ဖြစ်ပါသည်။"
    }
  ];

  const currentPlan = PLANS[selectedPlan];
  
  return (
    <PublicLayout>
      <div className="min-h-screen bg-background pb-20 md:pb-8">
        {/* Hero Section */}
        <section className="relative pt-8 pb-12 sm:pt-10 sm:pb-16 md:pt-20 md:pb-20 px-4 overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-background to-primary/5" />
          <div className="absolute top-20 left-10 w-72 h-72 bg-primary/20 rounded-full blur-3xl" />
          <div className="absolute bottom-10 right-10 w-96 h-96 bg-primary/10 rounded-full blur-3xl" />
          
          <motion.div 
            initial={{ opacity: 0, y: 20 }} 
            animate={{ opacity: 1, y: 0 }} 
            transition={{ duration: 0.6 }} 
            className="container mx-auto text-center relative z-10"
          >
            <Badge className="mb-3 px-3 py-1.5 sm:mb-4 sm:px-4 sm:py-2 bg-gradient-to-r from-primary/20 to-primary/10 border-primary/30 text-primary">
              <Crown className="w-3 h-3 sm:w-4 sm:h-4 mr-1.5 sm:mr-2 fill-primary" />
              Pro Plans - Unlock Everything
            </Badge>
            
            <h1 className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-bold mb-4 sm:mb-6">
              <span className="bg-gradient-to-r from-primary to-primary/80 bg-clip-text text-transparent">
                AI Power
              </span>
              {" "}ကို Unlock လုပ်ပါ
            </h1>
            
            <p className="text-sm sm:text-base lg:text-xl text-muted-foreground max-w-3xl mx-auto mb-6 sm:mb-8">
              App ရှိ AI feature အားလုံးကို နေ့စဉ် ပိုမိုအသုံးပြုနိုင်ခွင့်ရယူပါ။ 
              BeeBot, AI Content, Studio Hub နှင့် အခြား feature အားလုံးအတွက်။
            </p>
            
            {(isPro || isProPlus) && (
              <div className="inline-flex items-center gap-3 px-6 py-3 rounded-xl bg-gradient-to-r from-primary/20 to-primary/10 border border-primary/30">
                <ProBadge size="lg" showDaysRemaining />
                <span className="text-sm text-muted-foreground">
                  You're on {isProPlus ? 'Pro+' : 'Pro'} Plan
                </span>
              </div>
            )}
          </motion.div>
        </section>

        {/* Pricing Cards */}
        <section className="py-10 sm:py-12 lg:py-16 px-4">
          <div className="container mx-auto max-w-5xl">
            <div className="grid md:grid-cols-3 gap-6">
              {/* Free Plan */}
              <Card className="border-muted">
                <CardHeader className="p-6">
                  <div className="flex items-center gap-2 mb-2">
                    <Sparkles className="h-5 w-5 text-muted-foreground" />
                    <CardTitle>Free Plan</CardTitle>
                  </div>
                  <CardDescription>အခြေခံအသုံးပြုသူများအတွက်</CardDescription>
                </CardHeader>
                <CardContent className="p-6 pt-0">
                  <div className="mb-6">
                    <div className="text-4xl font-bold">Free</div>
                    <p className="text-sm text-muted-foreground">Forever</p>
                  </div>
                  
                  <ul className="space-y-3 mb-6">
                    <li className="flex items-center gap-2 text-sm">
                      <div className="w-5 h-5 rounded-full bg-primary/20 flex items-center justify-center">
                        <Check className="h-3 w-3 text-primary" />
                      </div>
                      <span>နေ့စဉ် <strong>3</strong> Credits</span>
                    </li>
                    <li className="flex items-center gap-2 text-sm">
                      <div className="w-5 h-5 rounded-full bg-primary/20 flex items-center justify-center">
                        <Check className="h-3 w-3 text-primary" />
                      </div>
                      <span>AI Feature အားလုံး Access ရ</span>
                    </li>
                    <li className="flex items-center gap-2 text-sm text-muted-foreground">
                      <div className="w-5 h-5 rounded-full bg-muted flex items-center justify-center">
                        <X className="h-3 w-3" />
                      </div>
                      <span>Personal API Key မရ</span>
                    </li>
                    <li className="flex items-center gap-2 text-sm text-muted-foreground">
                      <div className="w-5 h-5 rounded-full bg-muted flex items-center justify-center">
                        <X className="h-3 w-3" />
                      </div>
                      <span>Priority Processing မရ</span>
                    </li>
                  </ul>
                  
                  <Button variant="outline" className="w-full" onClick={() => navigate('/auth')}>
                    Get Started Free
                  </Button>
                </CardContent>
              </Card>

              {/* Pro Plan */}
              <Card className="border-primary/50 bg-gradient-to-br from-primary/5 to-primary/10 relative overflow-hidden">
                <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-primary/20 to-primary/10 rounded-full blur-2xl" />
                <Badge className="absolute top-4 right-4 bg-gradient-to-r from-primary to-primary/80">
                  Popular
                </Badge>
                
                <CardHeader className="p-6">
                  <div className="flex items-center gap-2 mb-2">
                    <Crown className="h-5 w-5 text-primary fill-primary" />
                    <CardTitle className="text-primary">Pro Plan</CardTitle>
                  </div>
                  <CardDescription>Professional creators အတွက်</CardDescription>
                </CardHeader>
                <CardContent className="p-6 pt-0 relative z-10">
                  <div className="mb-6">
                    <div className="flex items-baseline gap-1">
                      <div className="text-4xl font-bold">{PLANS.pro.price.toLocaleString()}</div>
                      <span className="text-lg text-muted-foreground">MMK</span>
                    </div>
                    <p className="text-sm text-muted-foreground">30 ရက်အတွက်</p>
                  </div>
                  
                  <ul className="space-y-3 mb-6">
                    <li className="flex items-center gap-2 text-sm">
                      <div className="w-5 h-5 rounded-full bg-primary/20 flex items-center justify-center">
                        <Zap className="h-3 w-3 text-primary" />
                      </div>
                      <span>နေ့စဉ် <strong>5</strong> Credits (System)</span>
                    </li>
                    <li className="flex items-center gap-2 text-sm">
                      <div className="w-5 h-5 rounded-full bg-primary/20 flex items-center justify-center">
                        <Key className="h-3 w-3 text-primary" />
                      </div>
                      <span>+ <strong>10</strong> Credits (Personal API Key)</span>
                    </li>
                    <li className="flex items-center gap-2 text-sm">
                      <div className="w-5 h-5 rounded-full bg-primary/20 flex items-center justify-center">
                        <Check className="h-3 w-3 text-primary" />
                      </div>
                      <span>AI Feature အားလုံး Full Access</span>
                    </li>
                    <li className="flex items-center gap-2 text-sm">
                      <div className="w-5 h-5 rounded-full bg-primary/20 flex items-center justify-center">
                        <Check className="h-3 w-3 text-primary" />
                      </div>
                      <span>Priority Processing</span>
                    </li>
                  </ul>
                  
                  {isPro && planType === 'pro' ? (
                    <Button disabled className="w-full bg-primary/20 text-primary">
                      <Check className="h-4 w-4 mr-2" />
                      Already Subscribed
                    </Button>
                  ) : (
                    <Button 
                      className="w-full bg-gradient-to-r from-primary to-primary/80 hover:from-primary/90 hover:to-primary/70"
                      onClick={() => handleSubscribe('pro')}
                      disabled={isProPlus}
                    >
                      <Crown className="h-4 w-4 mr-2" />
                      Subscribe Now
                    </Button>
                  )}
                </CardContent>
              </Card>

              {/* Pro+ Plan */}
              <Card className="border-amber-500/50 bg-gradient-to-br from-amber-500/10 to-orange-500/10 relative overflow-hidden">
                <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-amber-500/20 to-orange-500/20 rounded-full blur-2xl" />
                <Badge className="absolute top-4 right-4 bg-gradient-to-r from-amber-500 to-orange-500 text-white">
                  <Star className="h-3 w-3 mr-1 fill-white" />
                  Best Value
                </Badge>
                
                <CardHeader className="p-6">
                  <div className="flex items-center gap-2 mb-2">
                    <Star className="h-5 w-5 text-amber-500 fill-amber-500" />
                    <CardTitle className="text-amber-600 dark:text-amber-400">Pro+ Plan</CardTitle>
                  </div>
                  <CardDescription>Power users & creators အတွက်</CardDescription>
                </CardHeader>
                <CardContent className="p-6 pt-0 relative z-10">
                  <div className="mb-6">
                    <div className="flex items-baseline gap-1">
                      <div className="text-4xl font-bold text-amber-600 dark:text-amber-400">{PLANS.pro_plus.price.toLocaleString()}</div>
                      <span className="text-lg text-muted-foreground">MMK</span>
                    </div>
                    <p className="text-sm text-muted-foreground">30 ရက်အတွက်</p>
                  </div>
                  
                  <ul className="space-y-3 mb-6">
                    <li className="flex items-center gap-2 text-sm">
                      <div className="w-5 h-5 rounded-full bg-amber-500/20 flex items-center justify-center">
                        <Zap className="h-3 w-3 text-amber-500" />
                      </div>
                      <span>နေ့စဉ် <strong>10</strong> Credits (System)</span>
                    </li>
                    <li className="flex items-center gap-2 text-sm font-semibold text-amber-600 dark:text-amber-400">
                      <div className="w-5 h-5 rounded-full bg-amber-500/20 flex items-center justify-center">
                        <Infinity className="h-3 w-3 text-amber-500" />
                      </div>
                      <span>Unlimited (Personal API Key)</span>
                    </li>
                    <li className="flex items-center gap-2 text-sm">
                      <div className="w-5 h-5 rounded-full bg-amber-500/20 flex items-center justify-center">
                        <Check className="h-3 w-3 text-amber-500" />
                      </div>
                      <span>AI Feature အားလုံး Full Access</span>
                    </li>
                    <li className="flex items-center gap-2 text-sm">
                      <div className="w-5 h-5 rounded-full bg-amber-500/20 flex items-center justify-center">
                        <Check className="h-3 w-3 text-amber-500" />
                      </div>
                      <span>VIP Priority + Support</span>
                    </li>
                  </ul>
                  
                  {isProPlus ? (
                    <Button disabled className="w-full bg-amber-500/20 text-amber-600">
                      <Check className="h-4 w-4 mr-2" />
                      Already Subscribed
                    </Button>
                  ) : (
                    <Button 
                      className="w-full bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white"
                      onClick={() => handleSubscribe('pro_plus')}
                    >
                      <Star className="h-4 w-4 mr-2 fill-white" />
                      Subscribe Now
                    </Button>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        </section>

        {/* Features Grid */}
        <section className="py-10 sm:py-12 lg:py-16 px-4 bg-muted/30">
          <div className="container mx-auto">
            <div className="text-center mb-8 sm:mb-12">
              <h2 className="text-xl sm:text-2xl lg:text-3xl font-bold mb-3">
                Pro Plans ဖြင့် Access ရနိုင်သော Features များ
              </h2>
              <p className="text-muted-foreground text-sm sm:text-base">
                All AI-powered features with increased daily limits
              </p>
            </div>
            
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4 max-w-4xl mx-auto">
              {features.map((feature, index) => (
                <motion.div
                  key={index}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.1 }}
                  viewport={{ once: true }}
                >
                  <Card className="h-full hover:border-primary/50 transition-colors">
                    <CardContent className="p-4">
                      <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center mb-3">
                        <feature.icon className="h-5 w-5 text-primary" />
                      </div>
                      <h3 className="font-medium text-sm mb-1">{feature.name}</h3>
                      <p className="text-xs text-muted-foreground">{feature.description}</p>
                    </CardContent>
                  </Card>
                </motion.div>
              ))}
            </div>
          </div>
        </section>

        {/* Comparison Table */}
        <section className="py-10 sm:py-12 lg:py-16 px-4">
          <div className="container mx-auto max-w-4xl">
            <div className="text-center mb-8 sm:mb-12">
              <h2 className="text-xl sm:text-2xl lg:text-3xl font-bold mb-3">Plan Comparison</h2>
              <p className="text-muted-foreground text-sm sm:text-base">Compare features and choose your plan</p>
            </div>
            
            <Card>
              <CardContent className="p-0 overflow-x-auto">
                <div className="min-w-[500px]">
                  <div className="grid grid-cols-4 border-b bg-muted/50">
                    <div className="p-4 font-medium text-sm">Feature</div>
                    <div className="p-4 font-medium text-sm text-center border-l">Free</div>
                    <div className="p-4 font-medium text-sm text-center border-l bg-primary/10">
                      <div className="flex items-center justify-center gap-1">
                        <Crown className="h-4 w-4 text-primary" />
                        Pro
                      </div>
                    </div>
                    <div className="p-4 font-medium text-sm text-center border-l bg-amber-500/10">
                      <div className="flex items-center justify-center gap-1">
                        <Star className="h-4 w-4 text-amber-500 fill-amber-500" />
                        Pro+
                      </div>
                    </div>
                  </div>
                  {comparisonTable.map((row, index) => (
                    <div key={index} className="grid grid-cols-4 border-b last:border-b-0">
                      <div className="p-4 text-sm">{row.feature}</div>
                      <div className="p-4 text-center border-l">
                        {typeof row.free === 'boolean' ? (
                          row.free ? (
                            <Check className="h-4 w-4 text-primary mx-auto" />
                          ) : (
                            <X className="h-4 w-4 text-muted-foreground mx-auto" />
                          )
                        ) : (
                          <span className="text-sm">{row.free}</span>
                        )}
                      </div>
                      <div className="p-4 text-center border-l bg-primary/5">
                        {typeof row.pro === 'boolean' ? (
                          row.pro ? (
                            <Check className="h-4 w-4 text-primary mx-auto" />
                          ) : (
                            <X className="h-4 w-4 text-muted-foreground mx-auto" />
                          )
                        ) : (
                          <span className="text-sm font-medium text-primary">{row.pro}</span>
                        )}
                      </div>
                      <div className="p-4 text-center border-l bg-amber-500/5">
                        {typeof row.proPlus === 'boolean' ? (
                          row.proPlus ? (
                            <Check className="h-4 w-4 text-amber-500 mx-auto" />
                          ) : (
                            <X className="h-4 w-4 text-muted-foreground mx-auto" />
                          )
                        ) : (
                          <span className="text-sm font-medium text-amber-600 dark:text-amber-400">{row.proPlus}</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </section>

        {/* FAQ */}
        <section className="py-10 sm:py-12 lg:py-16 px-4 bg-muted/30">
          <div className="container mx-auto max-w-3xl">
            <div className="text-center mb-8 sm:mb-12">
              <h2 className="text-xl sm:text-2xl lg:text-3xl font-bold mb-3">မေးလေ့ရှိသောမေးခွန်းများ</h2>
            </div>
            
            <div className="space-y-4">
              {faqs.map((faq, index) => (
                <motion.div
                  key={index}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.1 }}
                  viewport={{ once: true }}
                >
                  <Card>
                    <CardHeader className="p-4 pb-2">
                      <CardTitle className="text-sm sm:text-base">{faq.question}</CardTitle>
                    </CardHeader>
                    <CardContent className="p-4 pt-0">
                      <p className="text-xs sm:text-sm text-muted-foreground">{faq.answer}</p>
                    </CardContent>
                  </Card>
                </motion.div>
              ))}
            </div>
          </div>
        </section>

        {/* Final CTA */}
        {!isPro && !isProPlus && (
          <section className="py-10 sm:py-12 lg:py-16 px-4">
            <div className="container mx-auto text-center">
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                whileInView={{ opacity: 1, scale: 1 }}
                viewport={{ once: true }}
                className="max-w-2xl mx-auto p-6 sm:p-8 rounded-2xl bg-gradient-to-br from-primary/10 to-primary/5 border border-primary/30"
              >
                <Crown className="h-12 w-12 text-primary mx-auto mb-4" />
                <h2 className="text-xl sm:text-2xl font-bold mb-3">
                  Ready to Go Pro?
                </h2>
                <p className="text-sm sm:text-base text-muted-foreground mb-6">
                  Unlock the full potential of AI features with Pro or Pro+ Plan
                </p>
                <div className="flex flex-col sm:flex-row gap-3 justify-center">
                  <Button 
                    size="lg"
                    className="bg-gradient-to-r from-primary to-primary/80 hover:from-primary/90 hover:to-primary/70"
                    onClick={() => handleSubscribe('pro')}
                  >
                    <Crown className="h-5 w-5 mr-2" />
                    Pro - {PLANS.pro.price.toLocaleString()} MMK
                  </Button>
                  <Button 
                    size="lg"
                    className="bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white"
                    onClick={() => handleSubscribe('pro_plus')}
                  >
                    <Star className="h-5 w-5 mr-2 fill-white" />
                    Pro+ - {PLANS.pro_plus.price.toLocaleString()} MMK
                  </Button>
                </div>
              </motion.div>
            </div>
          </section>
        )}

        {paymentMethods && (
          <PaymentModal 
            isOpen={isPaymentModalOpen} 
            onClose={() => setIsPaymentModalOpen(false)} 
            courseTitle={`${currentPlan.name} (30 Days)`} 
            finalPrice={currentPlan.price} 
            paymentMethods={paymentMethods} 
            onSubmitPayment={handlePaymentSubmit} 
            isLoading={false} 
          />
        )}
      </div>
    </PublicLayout>
  );
};

export default AIContentPricing;
