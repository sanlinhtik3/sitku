import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useNavigate } from "react-router-dom";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Coins, Check } from "lucide-react";
import { PaymentModal } from "@/components/PaymentModal";
import { toast } from "sonner";

interface BuyCreditsModalProps {
  open: boolean;
  onClose: () => void;
}

interface CreditPlan {
  id: string;
  name: string;
  description: string;
  credits: number;
  price: number;
  display_order: number;
}

export const BuyCreditsModal = ({ open, onClose }: BuyCreditsModalProps) => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [selectedPlan, setSelectedPlan] = useState<CreditPlan | null>(null);
  const [selectedPlans, setSelectedPlans] = useState<Set<string>>(new Set());
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [isBulkPurchase, setIsBulkPurchase] = useState(false);

  const { data: plans, isLoading } = useQuery({
    queryKey: ["credit-plans-modal"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("credit_plans")
        .select("*")
        .eq("is_active", true)
        .order("display_order");

      if (error) throw error;
      return data as CreditPlan[];
    },
    enabled: open,
  });

  const { data: orderHistory } = useQuery({
    queryKey: ["credit-orders-history", user?.id],
    queryFn: async () => {
      if (!user) return [];
      const { data, error } = await supabase
        .from("credit_orders")
        .select("*, credit_plans(name)")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(5);

      if (error) throw error;
      return data;
    },
    enabled: open && !!user,
  });

  const { data: paymentMethods } = useQuery({
    queryKey: ["payment-methods-modal"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("payment_methods")
        .select("*")
        .eq("is_active", true)
        .order("display_order");

      if (error) throw error;
      return data;
    },
    enabled: open,
  });

  const handleSinglePurchase = (plan: CreditPlan) => {
    if (!user) {
      toast.error("Please log in to purchase credits");
      navigate("/auth");
      return;
    }
    setSelectedPlan(plan);
    setIsBulkPurchase(false);
    setIsPaymentModalOpen(true);
  };

  const handleBulkPurchase = () => {
    if (!user) {
      toast.error("Please log in to purchase credits");
      navigate("/auth");
      return;
    }
    if (selectedPlans.size === 0) {
      toast.error("Please select at least one plan");
      return;
    }
    setIsBulkPurchase(true);
    setIsPaymentModalOpen(true);
  };

  const togglePlanSelection = (planId: string) => {
    const newSelection = new Set(selectedPlans);
    if (newSelection.has(planId)) {
      newSelection.delete(planId);
    } else {
      newSelection.add(planId);
    }
    setSelectedPlans(newSelection);
  };

  const getBulkDiscount = (planCount: number) => {
    if (planCount >= 3) return 0.15; // 15% off for 3+ plans
    if (planCount >= 2) return 0.10; // 10% off for 2+ plans
    return 0;
  };

  const getBonusCredits = (totalCredits: number) => {
    if (totalCredits >= 300) return Math.floor(totalCredits * 0.20); // 20% bonus
    if (totalCredits >= 150) return Math.floor(totalCredits * 0.10); // 10% bonus
    return 0;
  };

  const calculateBulkPurchase = () => {
    if (!plans || selectedPlans.size === 0) return null;
    
    const selected = plans.filter(p => selectedPlans.has(p.id));
    const totalPrice = selected.reduce((sum, plan) => sum + plan.price, 0);
    const totalCredits = selected.reduce((sum, plan) => sum + plan.credits, 0);
    const discount = getBulkDiscount(selected.length);
    const bonusCredits = getBonusCredits(totalCredits);
    const finalPrice = totalPrice * (1 - discount);
    
    return {
      plans: selected,
      totalPrice,
      totalCredits,
      discount,
      discountAmount: totalPrice * discount,
      bonusCredits,
      finalPrice,
      finalTotalCredits: totalCredits + bonusCredits,
    };
  };

  const bulkSummary = calculateBulkPurchase();

  const getBestValuePlanId = () => {
    if (!plans || plans.length === 0) return null;
    const bestPlan = plans.reduce((best, current) => {
      const bestRatio = best.price / best.credits;
      const currentRatio = current.price / current.credits;
      return currentRatio < bestRatio ? current : best;
    });
    return bestPlan.id;
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "completed":
        return "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200";
      case "pending":
        return "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200";
      case "rejected":
        return "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200";
      default:
        return "bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200";
    }
  };

  const handlePaymentSubmit = async (paymentData: any) => {
    if (!user) return;

    try {
      const receiptFile = paymentData.receiptFile;
      const fileExt = receiptFile.name.split('.').pop();
      const fileName = `${user.id}_${Date.now()}.${fileExt}`;
      const filePath = `${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('payment-receipts')
        .upload(filePath, receiptFile);

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('payment-receipts')
        .getPublicUrl(filePath);

      if (isBulkPurchase && bulkSummary) {
        // Create a bulk order reference ID
        const bulkOrderId = crypto.randomUUID();
        
        // Insert orders for each selected plan
        const orders = bulkSummary.plans.map(plan => ({
          user_id: user.id,
          plan_id: plan.id,
          credits_purchased: plan.credits,
          amount_paid: (plan.price * (1 - bulkSummary.discount)),
          payment_method_id: paymentData.paymentMethodId,
          payment_receipt_url: publicUrl,
          payment_notes: `Bulk purchase (${bulkSummary.plans.length} plans, ${bulkSummary.discount * 100}% discount, ${bulkSummary.bonusCredits} bonus credits) - ${paymentData.notes || ''}`,
          status: "pending",
        }));

        const { error } = await supabase.from("credit_orders").insert(orders);
        if (error) throw error;

        toast.success(`Bulk order submitted! ${bulkSummary.plans.length} plans with ${bulkSummary.discount * 100}% discount + ${bulkSummary.bonusCredits} bonus credits. Awaiting admin approval.`);
      } else if (selectedPlan) {
        // Single purchase
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
      }

      setIsPaymentModalOpen(false);
      setSelectedPlans(new Set());
      onClose();
    } catch (error) {
      console.error("Error submitting order:", error);
      toast.error("Failed to submit order");
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onClose}>
        <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-2xl">Buy AI Credits</DialogTitle>
            <DialogDescription>
              Select single or multiple plans for bulk discounts
            </DialogDescription>
          </DialogHeader>
          
          {selectedPlans.size > 0 && bulkSummary && (
            <Card className="bg-primary/5 border-primary">
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="font-semibold text-lg">Bulk Purchase Summary</h3>
                  <Badge className="bg-primary">{selectedPlans.size} Plans Selected</Badge>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                  <div>
                    <p className="text-muted-foreground">Total Credits</p>
                    <p className="font-bold text-lg">{bulkSummary.totalCredits.toLocaleString()}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Bonus Credits</p>
                    <p className="font-bold text-lg text-green-600">+{bulkSummary.bonusCredits.toLocaleString()}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Discount ({bulkSummary.discount * 100}%)</p>
                    <p className="font-bold text-lg text-green-600">-${bulkSummary.discountAmount.toFixed(2)}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Final Price</p>
                    <p className="font-bold text-lg">${bulkSummary.finalPrice.toFixed(2)}</p>
                  </div>
                </div>
                <div className="mt-3 flex items-center justify-between">
                  <p className="text-sm text-primary font-medium">
                    Total: {bulkSummary.finalTotalCredits.toLocaleString()} credits for ${bulkSummary.finalPrice.toFixed(2)}
                  </p>
                  <Button onClick={handleBulkPurchase}>
                    Proceed with Bulk Purchase
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {isLoading ? (
            <p className="text-center py-8">Loading plans...</p>
          ) : (
            <>
              <div className="grid md:grid-cols-3 gap-4 mt-4">
                {plans?.map((plan, index) => {
                  const isBestValue = plan.id === getBestValuePlanId();
                  const isSelected = selectedPlans.has(plan.id);
                  return (
                    <Card
                      key={plan.id}
                      className={`relative cursor-pointer transition-all ${
                        isBestValue ? "border-primary shadow-lg" : ""
                      } ${isSelected ? "ring-2 ring-primary bg-primary/5" : ""}`}
                      onClick={() => togglePlanSelection(plan.id)}
                    >
                      {isBestValue && (
                        <Badge className="absolute -top-3 left-1/2 -translate-x-1/2 bg-primary">
                          Best Value
                        </Badge>
                      )}
                      <CardHeader>
                        <CardTitle className="text-xl">{plan.name}</CardTitle>
                        <CardDescription>{plan.description}</CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <div className="text-center">
                          <div className="flex items-center justify-center gap-2 mb-2">
                            <Coins className="h-6 w-6 text-primary" />
                            <span className="text-3xl font-bold">{plan.credits.toLocaleString()}</span>
                          </div>
                          <p className="text-sm text-muted-foreground">Credits</p>
                          <p className="text-xs text-primary font-medium mt-1">
                            = {plan.credits.toLocaleString()} AI Generations
                          </p>
                        </div>

                        <div className="text-center">
                          <p className="text-2xl font-bold">${plan.price.toFixed(2)}</p>
                          <p className="text-sm text-muted-foreground mt-1">
                            ${(plan.price / plan.credits).toFixed(3)} per credit
                          </p>
                        </div>

                        <ul className="space-y-2">
                          <li className="flex items-center gap-2">
                            <Check className="h-4 w-4 text-green-600" />
                            <span className="text-sm">{plan.credits.toLocaleString()} AI generations</span>
                          </li>
                          <li className="flex items-center gap-2">
                            <Check className="h-4 w-4 text-green-600" />
                            <span className="text-sm">Save generated content</span>
                          </li>
                          <li className="flex items-center gap-2">
                            <Check className="h-4 w-4 text-green-600" />
                            <span className="text-sm">Access to knowledge base</span>
                          </li>
                        </ul>

                        <div className="flex gap-2">
                          <Button
                            className="flex-1"
                            variant={isBestValue ? "default" : "outline"}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleSinglePurchase(plan);
                            }}
                          >
                            Buy Now
                          </Button>
                          <Button
                            variant={isSelected ? "default" : "outline"}
                            size="icon"
                            onClick={(e) => {
                              e.stopPropagation();
                              togglePlanSelection(plan.id);
                            }}
                          >
                            {isSelected ? <Check className="h-4 w-4" /> : "+"}
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>

              {orderHistory && orderHistory.length > 0 && (
                <div className="mt-8">
                  <h3 className="text-lg font-semibold mb-4">Recent Purchase History</h3>
                  <div className="space-y-3">
                    {orderHistory.map((order: any) => (
                      <Card key={order.id}>
                        <CardContent className="p-4">
                          <div className="flex items-center justify-between">
                            <div className="flex-1">
                              <p className="font-medium">{order.credit_plans?.name}</p>
                              <p className="text-sm text-muted-foreground">
                                {order.credits_purchased.toLocaleString()} credits - ${order.amount_paid.toFixed(2)}
                              </p>
                              <p className="text-xs text-muted-foreground mt-1">
                                {new Date(order.created_at).toLocaleDateString()}
                              </p>
                            </div>
                            <Badge className={getStatusColor(order.status)}>
                              {order.status.charAt(0).toUpperCase() + order.status.slice(1)}
                            </Badge>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>

      {paymentMethods && (
        <PaymentModal
          isOpen={isPaymentModalOpen}
          onClose={() => setIsPaymentModalOpen(false)}
          courseTitle={isBulkPurchase && bulkSummary ? `Bulk Purchase (${bulkSummary.plans.length} plans)` : selectedPlan?.name || ""}
          finalPrice={isBulkPurchase && bulkSummary ? bulkSummary.finalPrice : selectedPlan?.price || 0}
          paymentMethods={paymentMethods}
          onSubmitPayment={handlePaymentSubmit}
          isLoading={false}
        />
      )}
    </>
  );
};
