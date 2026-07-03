import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Coins, Check, Sparkles } from "lucide-react";
import { PaymentModal } from "@/components/PaymentModal";
import { PublicLayout } from "@/layouts/PublicLayout";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import { FuturisticBackground } from "@/components/ui/FuturisticBackground";
import { PageHeader, GlassmorphicCard } from "@/components/ui/FuturisticElements";

interface CreditPlan {
  id: string;
  name: string;
  description: string;
  credits: number;
  price: number;
  display_order: number;
}

export default function BuyCredits() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [selectedPlan, setSelectedPlan] = useState<CreditPlan | null>(null);
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);

  const { data: plans, isLoading } = useQuery({
    queryKey: ["credit-plans-active"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("credit_plans")
        .select("*")
        .eq("is_active", true)
        .order("display_order");

      if (error) throw error;
      return data as CreditPlan[];
    },
  });

  const { data: paymentMethods } = useQuery({
    queryKey: ["payment-methods"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("payment_methods")
        .select("*")
        .eq("is_active", true)
        .order("display_order");

      if (error) throw error;
      return data;
    },
  });

  const handleBuyPlan = (plan: CreditPlan) => {
    if (!user) {
      toast.error("Please log in to purchase credits");
      navigate("/auth");
      return;
    }
    setSelectedPlan(plan);
    setIsPaymentModalOpen(true);
  };

  const handlePaymentSubmit = async (paymentData: any) => {
    if (!selectedPlan || !user) return;

    if (!paymentData.paymentMethodId) {
      toast.error("Please select a payment method");
      return;
    }

    try {
      const receiptFile = paymentData.receiptFile;
      const fileExt = receiptFile.name.split('.').pop();
      const fileName = `receipt_${Date.now()}.${fileExt}`;
      const filePath = `${user.id}/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('payment-receipts')
        .upload(filePath, receiptFile, { upsert: false });

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('payment-receipts')
        .getPublicUrl(filePath);

      const { error } = await supabase.from("credit_orders").insert({
        user_id: user.id,
        plan_id: selectedPlan.id,
        credits_purchased: selectedPlan.credits,
        amount_paid: selectedPlan.price,
        payment_method_id: paymentData.paymentMethodId,
        payment_receipt_url: publicUrl,
        payment_notes: paymentData.notes,
        status: "pending",
      });

      if (error) throw error;

      toast.success("Order submitted! Awaiting admin approval.");
      setIsPaymentModalOpen(false);
      navigate("/dashboard");
    } catch (error: any) {
      if (error.code === '23503') {
        toast.error("Invalid payment method or plan selected. Please try again.");
      } else if (error.message?.includes('storage')) {
        toast.error("Failed to upload receipt. Please try again.");
      } else {
        toast.error(`Failed to submit order: ${error.message || 'Unknown error'}`);
      }
    }
  };

  return (
    <PublicLayout>
      <FuturisticBackground>
        <div className="min-h-screen pb-20 md:pb-8">
          <div className="container mx-auto px-4 py-6 sm:py-8">
          <div className="max-w-6xl mx-auto">
            {/* Header */}
            <div className="text-center mb-6 sm:mb-10 lg:mb-12">
              <PageHeader
                icon={Coins}
                title="Buy AI Credits"
                subtitle="Power your content creation with our AI credits system"
              />
            </div>

            {isLoading ? (
              <div className="text-center py-8 sm:py-12">
                <div className="flex items-center justify-center gap-2">
                  <div className="flex gap-1">
                    <span className="w-2 h-2 bg-primary rounded-full animate-[pulse_1.4s_ease-in-out_infinite]" />
                    <span className="w-2 h-2 bg-primary rounded-full animate-[pulse_1.4s_ease-in-out_0.2s_infinite]" />
                    <span className="w-2 h-2 bg-primary rounded-full animate-[pulse_1.4s_ease-in-out_0.4s_infinite]" />
                  </div>
                  <span className="text-sm text-muted-foreground">Loading plans...</span>
                </div>
              </div>
            ) : (
              <div className="grid md:grid-cols-3 gap-4 sm:gap-6">
                {plans?.map((plan, index) => (
                  <GlassmorphicCard
                    key={plan.id}
                    glow={index === 1}
                    className={`relative transition-all duration-300 ${
                      index === 1 
                        ? "sm:scale-105 border-primary/40 shadow-xl shadow-primary/20" 
                        : "hover:scale-102 hover:border-primary/30"
                    }`}
                  >
                    {index === 1 && (
                      <Badge className="absolute -top-3 left-1/2 -translate-x-1/2 text-[10px] sm:text-xs bg-gradient-to-r from-primary to-primary/80 shadow-lg shadow-primary/30">
                        Most Popular
                      </Badge>
                    )}
                    <CardHeader className="p-4 sm:p-6 pb-2 sm:pb-4">
                      <CardTitle className="text-lg sm:text-xl lg:text-2xl bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text text-transparent">
                        {plan.name}
                      </CardTitle>
                      <CardDescription className="text-xs sm:text-sm">{plan.description}</CardDescription>
                    </CardHeader>
                    <CardContent className="p-4 sm:p-6 pt-0 space-y-4 sm:space-y-6">
                      <div className="text-center">
                        <div className="flex items-center justify-center gap-2 mb-1 sm:mb-2">
                          <div className="p-1.5 sm:p-2 rounded-lg bg-primary/10">
                            <Coins className="h-5 w-5 sm:h-6 sm:w-6 text-primary" />
                          </div>
                          <span className="text-2xl sm:text-3xl lg:text-4xl font-bold bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text text-transparent">
                            {plan.credits.toLocaleString()}
                          </span>
                        </div>
                        <p className="text-xs sm:text-sm text-muted-foreground">Credits</p>
                      </div>

                      <div className="text-center">
                        <p className="text-xl sm:text-2xl lg:text-3xl font-bold bg-gradient-to-r from-primary to-primary/70 bg-clip-text text-transparent">
                          ${plan.price.toFixed(2)}
                        </p>
                        <p className="text-xs sm:text-sm text-muted-foreground mt-1">
                          ${(plan.price / plan.credits).toFixed(3)} per credit
                        </p>
                      </div>

                      <ul className="space-y-1.5 sm:space-y-2">
                        <li className="flex items-center gap-2">
                          <div className="p-1 rounded-full bg-green-500/10">
                            <Check className="h-2.5 w-2.5 sm:h-3 sm:w-3 text-green-500" />
                          </div>
                          <span className="text-xs sm:text-sm">{plan.credits} AI generations</span>
                        </li>
                        <li className="flex items-center gap-2">
                          <div className="p-1 rounded-full bg-green-500/10">
                            <Check className="h-2.5 w-2.5 sm:h-3 sm:w-3 text-green-500" />
                          </div>
                          <span className="text-xs sm:text-sm">Save generated content</span>
                        </li>
                        <li className="flex items-center gap-2">
                          <div className="p-1 rounded-full bg-green-500/10">
                            <Check className="h-2.5 w-2.5 sm:h-3 sm:w-3 text-green-500" />
                          </div>
                          <span className="text-xs sm:text-sm">Access to knowledge base</span>
                        </li>
                      </ul>

                      <Button
                        className={`w-full h-9 sm:h-10 text-xs sm:text-sm transition-all duration-300 ${
                          index === 1 
                            ? "bg-gradient-to-r from-primary to-primary/80 hover:from-primary/90 hover:to-primary/70 shadow-lg shadow-primary/30" 
                            : "bg-background/50 border border-primary/30 hover:bg-primary/10 hover:border-primary/50"
                        }`}
                        variant={index === 1 ? "default" : "outline"}
                        onClick={() => handleBuyPlan(plan)}
                      >
                        <Sparkles className="mr-2 h-3.5 w-3.5 sm:h-4 sm:w-4" />
                        Buy Now
                      </Button>
                    </CardContent>
                  </GlassmorphicCard>
                ))}
              </div>
            )}
          </div>
        </div>

        {selectedPlan && paymentMethods && (
          <PaymentModal
            isOpen={isPaymentModalOpen}
            onClose={() => setIsPaymentModalOpen(false)}
            courseTitle={selectedPlan.name}
            finalPrice={selectedPlan.price}
            paymentMethods={paymentMethods}
            onSubmitPayment={handlePaymentSubmit}
            isLoading={false}
          />
        )}
        </div>
      </FuturisticBackground>
    </PublicLayout>
  );
}
