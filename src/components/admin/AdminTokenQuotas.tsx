import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { IconCoin, IconRefresh } from "@tabler/icons-react";
import { GlobalSettingsEditor } from "./ai-content/GlobalSettingsEditor";
import { IntelligenceStatsCards } from "./intelligence/IntelligenceStatsCards";
import { UnifiedUserTable } from "./intelligence/UnifiedUserTable";
import { IntelligenceAnalytics } from "./intelligence/IntelligenceAnalytics";
import { BeeBotEvalDashboard } from "./ai-content/BeeBotEvalDashboard";
import {
  useUnifiedUsers,
  useIntelligenceStats,
  useIUTrends,
  useProviderDistribution,
  useTopConsumers,
} from "./intelligence/useUnifiedIntelligenceData";

export function AdminTokenQuotas() {
  const { data: users, isLoading, refetch } = useUnifiedUsers();
  const { data: stats } = useIntelligenceStats();
  const { data: trends } = useIUTrends();
  const { data: providerDist } = useProviderDistribution();
  const { data: topConsumers } = useTopConsumers();

  // System settings for Free Tier & Key status
  const { data: systemSettings } = useQuery({
    queryKey: ["admin-system-ai-settings"],
    queryFn: async () => {
      const [{ data: settings }, { data: keyStatus }] = await Promise.all([
        supabase.from("ai_model_settings").select("enable_free_tier").maybeSingle(),
        supabase.rpc("check_system_api_keys_status"),
      ]);
      return {
        enableFreeTier: settings?.enable_free_tier !== false,
        hasSystemKey: !!(keyStatus as any)?.has_google_key,
      };
    },
    retry: 3,
    retryDelay: 1000,
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <IconCoin className="h-7 w-7 text-primary" />
            Apex Intelligence Panel
          </h1>
          <p className="text-muted-foreground mt-1">
            Unified intelligence management — All users, IU tracking & analytics
          </p>
        </div>
        <Button variant="outline" onClick={() => refetch()}>
          <IconRefresh className="h-4 w-4 mr-2" />
          Refresh
        </Button>
      </div>

      {/* Section 1: Global Settings */}
      <GlobalSettingsEditor grantedUsersCount={users?.length || 0} />

      {/* Section 2: Stats Cards */}
      <IntelligenceStatsCards stats={stats} />

      {/* Section 3: Unified User Table */}
      <UnifiedUserTable
        users={users}
        isLoading={isLoading}
        enableFreeTier={systemSettings?.enableFreeTier ?? true}
        hasSystemKey={systemSettings?.hasSystemKey ?? false}
      />

      {/* Section 4: BeeBot Eval Tests */}
      <BeeBotEvalDashboard />

      {/* Section 5: Analytics */}
      <IntelligenceAnalytics
        trends={trends}
        providerDist={providerDist}
        topConsumers={topConsumers}
      />
    </div>
  );
}
