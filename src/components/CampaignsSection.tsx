import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { ExpandableCampaignCard } from "@/components/ui/expandable-campaign-card";
import { Skeleton } from "@/components/ui/skeleton";
import { useInViewport } from "@/hooks/useInViewport";

const CampaignsSection = () => {
  const { ref, isVisible } = useInViewport();

  const { data: campaigns, isLoading } = useQuery({
    queryKey: ["active-campaigns"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("campaigns")
        .select("*")
        .eq("is_active", true)
        .or("expires_at.is.null,expires_at.gt.now()")
        .order("display_order", { ascending: true });

      if (error) throw error;
      return data;
    },
    enabled: isVisible,
  });

  if (!isVisible) {
    return <div ref={ref} className="min-h-[200px]" />;
  }

  if (!isLoading && (!campaigns || campaigns.length === 0)) return null;

  return (
    <section ref={ref} className="py-16 lg:py-24 relative overflow-hidden section-fade-top">
      <div className="absolute bottom-0 left-1/4 w-[200px] h-[200px] bg-primary/[0.06] rounded-full blur-[100px] pointer-events-none" />
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        <div className="mb-8 sm:mb-10">
          <h2 className="text-xl sm:text-2xl lg:text-3xl font-bold">
            <span className="text-primary mr-2">&gt;</span>
            Exclusive Rewards
          </h2>
          <p className="text-muted-foreground text-xs sm:text-sm mt-1 ml-6">
            Register through our special links and claim your exclusive bonuses
          </p>
        </div>

        {isLoading ? (
          <div className="max-w-2xl mx-auto space-y-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex items-center gap-4 p-4 rounded-2xl bg-white/[0.03] backdrop-blur-lg border border-white/[0.08] shadow-[0_0_15px_hsl(var(--primary)/0.05)]">
                <Skeleton className="h-14 w-14 rounded-xl" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-3 w-1/2" />
                </div>
                <Skeleton className="h-10 w-20 rounded-full" />
              </div>
            ))}
          </div>
        ) : (
          <ExpandableCampaignCard campaigns={campaigns || []} />
        )}
      </div>
    </section>
  );
};

export default CampaignsSection;
