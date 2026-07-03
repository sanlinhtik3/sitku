import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Check, Crown, Sparkles, Building2, Zap } from "lucide-react";
import { useNavigate } from "react-router-dom";

interface UpgradePlanDialogProps {
  open: boolean;
  onClose: () => void;
  feature: "workspaces" | "members";
  currentPlan?: string;
}

interface Plan {
  id: string;
  name: string;
  description: string;
  price: number;
  credits: number;
  max_workspaces: number;
  max_members_per_workspace: number;
}

export function UpgradePlanDialog({ open, onClose, feature, currentPlan }: UpgradePlanDialogProps) {
  const navigate = useNavigate();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (open) {
      fetchPlans();
    }
  }, [open]);

  const fetchPlans = async () => {
    try {
      const { data, error } = await supabase
        .from("credit_plans")
        .select("*")
        .eq("is_active", true)
        .order("price", { ascending: true });

      if (error) throw error;
      setPlans(data || []);
    } catch (error) {
      console.error("Error fetching plans:", error);
    } finally {
      setLoading(false);
    }
  };

  const getPlanIcon = (name: string) => {
    const lower = name.toLowerCase();
    if (lower.includes("business") || lower.includes("enterprise")) return Building2;
    if (lower.includes("creator")) return Crown;
    if (lower.includes("pro")) return Sparkles;
    return Zap;
  };

  const formatLimit = (value: number) => {
    if (value === -1) return "Unlimited";
    return value.toString();
  };

  const handleSelectPlan = (plan: Plan) => {
    onClose();
    navigate("/buy-credits", { state: { selectedPlanId: plan.id } });
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[700px] bg-gradient-to-br from-card to-card/95 border-border/50 max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-2xl flex items-center gap-2">
            <Crown className="h-6 w-6 text-primary" />
            Upgrade Your Plan
          </DialogTitle>
          <DialogDescription>
            {feature === "workspaces"
              ? "Unlock more workspaces to manage multiple teams"
              : "Invite more team members to collaborate"}
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
            {plans.map((plan) => {
              const Icon = getPlanIcon(plan.name);
              const isCurrentPlan = currentPlan?.toLowerCase() === plan.name.toLowerCase();
              const hasMoreWorkspaces = plan.max_workspaces === -1 || plan.max_workspaces > 1;
              const hasTeamMembers = plan.max_members_per_workspace !== 0;

              return (
                <Card
                  key={plan.id}
                  className={`relative p-5 bg-background/50 border-border/50 hover:border-primary/50 transition-all ${
                    isCurrentPlan ? "border-primary/30 bg-primary/5" : ""
                  }`}
                >
                  {isCurrentPlan && (
                    <Badge className="absolute top-3 right-3 bg-primary/20 text-primary">
                      Current
                    </Badge>
                  )}

                  <div className="flex items-center gap-3 mb-4">
                    <div className="h-10 w-10 rounded-lg bg-gradient-to-br from-primary/20 to-primary/40 flex items-center justify-center">
                      <Icon className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <h3 className="font-semibold">{plan.name}</h3>
                      <p className="text-2xl font-bold text-primary">
                        {plan.price.toLocaleString()} <span className="text-sm font-normal text-muted-foreground">MMK</span>
                      </p>
                    </div>
                  </div>

                  <div className="space-y-2 mb-4">
                    <div className="flex items-center gap-2 text-sm">
                      <Check className={`h-4 w-4 ${hasMoreWorkspaces ? "text-green-500" : "text-muted-foreground"}`} />
                      <span className={hasMoreWorkspaces ? "" : "text-muted-foreground"}>
                        {formatLimit(plan.max_workspaces)} Workspace{plan.max_workspaces !== 1 ? "s" : ""}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-sm">
                      <Check className={`h-4 w-4 ${hasTeamMembers ? "text-green-500" : "text-muted-foreground"}`} />
                      <span className={hasTeamMembers ? "" : "text-muted-foreground"}>
                        {formatLimit(plan.max_members_per_workspace)} Team Member{plan.max_members_per_workspace !== 1 ? "s" : ""}/workspace
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-sm">
                      <Check className="h-4 w-4 text-green-500" />
                      <span>{plan.credits} AI Credits</span>
                    </div>
                  </div>

                  <Button
                    onClick={() => handleSelectPlan(plan)}
                    disabled={isCurrentPlan}
                    className={`w-full ${
                      isCurrentPlan
                        ? "bg-muted text-muted-foreground"
                        : "bg-gradient-to-r from-primary to-primary/80 hover:from-primary/90 hover:to-primary/70"
                    }`}
                  >
                    {isCurrentPlan ? "Current Plan" : "Select Plan"}
                  </Button>
                </Card>
              );
            })}
          </div>
        )}

        {plans.length === 0 && !loading && (
          <div className="text-center py-8 text-muted-foreground">
            No plans available. Please contact support.
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
