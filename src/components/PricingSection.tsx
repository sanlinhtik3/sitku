import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Check, X, Crown, Sparkles, Zap, Key, ChevronRight, Star, Infinity } from "lucide-react";
import { PaymentModal } from "@/components/PaymentModal";
import { useAuth } from "@/hooks/useAuth";
import { useProPlan } from "@/hooks/useProPlan";
import { toast } from "sonner";
import { useInViewport } from "@/hooks/useInViewport";

const PLANS = {
  pro: { id: 'pro-plan', name: 'Pro Plan', price: 9900, duration: 30, description: 'Full access to all AI features for 30 days' },
  pro_plus: { id: 'pro-plus-plan', name: 'Pro+ Plan', price: 14900, duration: 30, description: 'Ultimate AI power with unlimited access' }
};

export const PricingSection = () => {
  const { ref, isVisible } = useInViewport();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { isPro, isProPlus, planType } = useProPlan();
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<'pro' | 'pro_plus'>('pro');

  const { data: paymentMethods } = useQuery({
    queryKey: ["payment-methods"],
    queryFn: async () => {
      const { data, error } = await supabase.from("payment_methods").select("*").eq("is_active", true).order("display_order");
      if (error) throw error;
      return data;
    },
    enabled: isVisible,
  });

  const handleSubscribe = (plan: 'pro' | 'pro_plus') => {
    if (!user) { toast.error("Please log in to subscribe"); navigate("/auth"); return; }
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
        user_id: user.id, plan_type: selectedPlan, amount_paid: plan.price, duration_days: plan.duration,
        payment_method_id: paymentData.paymentMethodId, payment_receipt_url: publicUrl, payment_notes: paymentData.notes, status: "pending",
      });
      if (error) throw error;
      toast.success(`${plan.name} request submitted! Awaiting admin approval.`);
      setIsPaymentModalOpen(false);
    } catch (error) {
      console.error("Error submitting order:", error);
      toast.error("Failed to submit order");
    }
  };

  const currentPlan = PLANS[selectedPlan];

  return (
    <>
        <section ref={ref} className="py-16 lg:py-24 relative overflow-hidden section-fade-top">
          <div className="absolute top-1/2 left-1/3 -translate-y-1/2 w-[300px] h-[300px] bg-primary/[0.08] rounded-full blur-[120px] pointer-events-none" />
          <div className="container mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
          <div className="mb-8 sm:mb-10">
            <h2 className="text-xl sm:text-2xl lg:text-3xl font-bold mb-2">
              <span className="text-primary mr-2">&gt;</span>
              Simple Pricing
            </h2>
            <p className="text-muted-foreground text-xs sm:text-sm ml-6">
              Choose the plan that fits your AI content needs
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-6">
            {/* Free Plan */}
            <div>
              <Card className="h-full border-white/[0.08] bg-white/[0.03] backdrop-blur-sm rounded-2xl shadow-[0_0_20px_hsl(var(--primary)/0.06)]">
                <CardHeader className="p-3 sm:p-5">
                  <div className="flex items-center gap-2 mb-1">
                    <Sparkles className="h-5 w-5 text-muted-foreground" />
                    <CardTitle className="text-base sm:text-lg">Free Plan</CardTitle>
                  </div>
                  <CardDescription className="text-xs sm:text-sm">အခြေခံအသုံးပြုသူများအတွက်</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3 p-3 sm:p-5 pt-0">
                  <div>
                    <div className="text-2xl sm:text-3xl lg:text-4xl font-bold">Free</div>
                    <p className="text-xs text-muted-foreground mt-0.5">Forever</p>
                  </div>
                  <div className="space-y-1.5">
                    {[
                      { ok: true, icon: Check, text: "နေ့စဉ် 3 Credits" },
                      { ok: true, icon: Check, text: "AI Feature အားလုံး Access ရ" },
                      { ok: false, icon: X, text: "Personal API Key မရ" },
                      { ok: false, icon: X, text: "Priority Processing မရ" },
                    ].map((item, i) => (
                      <div key={i} className={`flex items-center gap-2 text-xs sm:text-sm ${!item.ok ? 'text-muted-foreground' : ''}`}>
                        <div className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 ${item.ok ? 'bg-primary/20' : 'bg-muted'}`}>
                          <item.icon className={`w-3 h-3 ${item.ok ? 'text-primary' : ''}`} />
                        </div>
                        <span>{item.text}</span>
                      </div>
                    ))}
                  </div>
                  <Button className="w-full h-9 text-sm" variant="outline" onClick={() => navigate("/auth")}>Get Started Free</Button>
                </CardContent>
              </Card>
            </div>

            {/* Pro Plan */}
            <div>
              <Card className="relative h-full border-primary/50 bg-gradient-to-br from-primary/5 to-primary/10 backdrop-blur-sm rounded-2xl overflow-hidden shadow-[0_0_30px_hsl(var(--primary)/0.15)]">
                <div className="absolute top-0 right-0 w-24 h-24 bg-gradient-to-br from-primary/15 to-primary/5 rounded-full blur-2xl" />
                <Badge className="absolute -top-2.5 left-1/2 -translate-x-1/2 text-xs bg-gradient-to-r from-primary to-primary/80">Popular</Badge>
                <CardHeader className="p-3 sm:p-5">
                  <div className="flex items-center gap-2 mb-1">
                    <Crown className="h-5 w-5 text-primary fill-primary" />
                    <CardTitle className="text-base sm:text-lg text-primary">Pro Plan</CardTitle>
                  </div>
                  <CardDescription className="text-xs sm:text-sm">Professional creators အတွက်</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3 p-3 sm:p-5 pt-0 relative z-10">
                  <div>
                    <div className="flex items-baseline gap-1">
                      <div className="text-2xl sm:text-3xl lg:text-4xl font-bold">{PLANS.pro.price.toLocaleString()}</div>
                      <span className="text-sm text-muted-foreground">MMK</span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">30 ရက်အတွက်</p>
                  </div>
                  <div className="space-y-1.5">
                    {[
                      { icon: Zap, text: "နေ့စဉ် 5 Credits (System)" },
                      { icon: Key, text: "+ 10 Credits (Personal API Key)" },
                      { icon: Check, text: "AI Feature အားလုံး Full Access" },
                      { icon: Check, text: "Priority Processing" },
                    ].map((item, i) => (
                      <div key={i} className="flex items-center gap-2 text-xs sm:text-sm">
                        <div className="w-5 h-5 rounded-full bg-primary/20 flex items-center justify-center shrink-0">
                          <item.icon className="w-3 h-3 text-primary" />
                        </div>
                        <span>{item.text}</span>
                      </div>
                    ))}
                  </div>
                  {isPro && planType === 'pro' ? (
                    <Button disabled className="w-full h-9 text-sm bg-primary/20 text-primary"><Check className="h-4 w-4 mr-2" />Already Subscribed</Button>
                  ) : (
                    <Button className="w-full h-9 text-sm bg-gradient-to-r from-primary to-primary/80" onClick={() => handleSubscribe('pro')} disabled={isProPlus}>
                      <Crown className="h-4 w-4 mr-2" />Subscribe Now<ChevronRight className="h-4 w-4 ml-1" />
                    </Button>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Pro+ Plan */}
            <div>
              <Card className="relative h-full border-amber-500/30 bg-gradient-to-br from-amber-500/5 to-orange-500/5 backdrop-blur-sm rounded-2xl overflow-hidden shadow-[0_0_30px_hsl(40_100%_50%/0.1)]">
                <div className="absolute top-0 right-0 w-24 h-24 bg-gradient-to-br from-amber-500/10 to-orange-500/10 rounded-full blur-2xl" />
                <Badge className="absolute -top-2.5 left-1/2 -translate-x-1/2 text-xs bg-gradient-to-r from-amber-500 to-orange-500 text-white">
                  <Star className="h-3 w-3 mr-1 fill-white" />Best Value
                </Badge>
                <CardHeader className="p-3 sm:p-5">
                  <div className="flex items-center gap-2 mb-1">
                    <Star className="h-5 w-5 text-amber-500 fill-amber-500" />
                    <CardTitle className="text-base sm:text-lg text-amber-600 dark:text-amber-400">Pro+ Plan</CardTitle>
                  </div>
                  <CardDescription className="text-xs sm:text-sm">Power users & creators အတွက်</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3 p-3 sm:p-5 pt-0 relative z-10">
                  <div>
                    <div className="flex items-baseline gap-1">
                      <div className="text-2xl sm:text-3xl lg:text-4xl font-bold text-amber-600 dark:text-amber-400">{PLANS.pro_plus.price.toLocaleString()}</div>
                      <span className="text-sm text-muted-foreground">MMK</span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">30 ရက်အတွက်</p>
                  </div>
                  <div className="space-y-1.5">
                    {[
                      { icon: Zap, text: "နေ့စဉ် 10 Credits (System)", cls: "text-amber-500", bgCls: "bg-amber-500/20" },
                      { icon: Infinity, text: "Unlimited (Personal API Key)", cls: "text-amber-500", bgCls: "bg-amber-500/20", bold: true },
                      { icon: Check, text: "AI Feature အားလုံး Full Access", cls: "text-amber-500", bgCls: "bg-amber-500/20" },
                      { icon: Check, text: "VIP Priority Processing", cls: "text-amber-500", bgCls: "bg-amber-500/20" },
                    ].map((item, i) => (
                      <div key={i} className="flex items-center gap-2 text-xs sm:text-sm">
                        <div className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 ${item.bgCls}`}>
                          <item.icon className={`w-3 h-3 ${item.cls}`} />
                        </div>
                        <span className={item.bold ? "font-semibold text-amber-600 dark:text-amber-400" : ""}>{item.text}</span>
                      </div>
                    ))}
                  </div>
                  {isProPlus ? (
                    <Button disabled className="w-full h-9 text-sm bg-amber-500/20 text-amber-600"><Check className="h-4 w-4 mr-2" />Already Subscribed</Button>
                  ) : (
                    <Button className="w-full h-9 text-sm bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white" onClick={() => handleSubscribe('pro_plus')}>
                      <Star className="h-4 w-4 mr-2 fill-white" />Subscribe Now<ChevronRight className="h-4 w-4 ml-1" />
                    </Button>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>

          <div className="text-center mt-6">
            <Button variant="link" onClick={() => navigate("/ai-content-pricing")} className="text-primary text-xs sm:text-sm">
              View Full Pricing Details<ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          </div>
        </div>
      </section>

      {paymentMethods && (
        <PaymentModal
          isOpen={isPaymentModalOpen} onClose={() => setIsPaymentModalOpen(false)}
          courseTitle={`${currentPlan.name} (30 Days)`} finalPrice={currentPlan.price}
          paymentMethods={paymentMethods} onSubmitPayment={handlePaymentSubmit} isLoading={false}
        />
      )}
    </>
  );
};
