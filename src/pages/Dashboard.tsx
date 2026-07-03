// Dashboard page - user's personalized learning hub
import { useState, useEffect, useCallback, lazy, Suspense } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useCourseProgress } from "@/hooks/useCourseProgress";
import { useUserCredits } from "@/hooks/useUserCredits";
import { useDashboardStats } from "@/hooks/useDashboardStats";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { usePullToRefreshRegister } from "@/contexts/PullToRefreshContext";
import { supabase } from "@/integrations/supabase/client";
import { useSearchParams, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Users, Activity, GraduationCap, LayoutDashboard, Wrench, Lock, EyeOff } from "lucide-react";
import { EmailVerificationBanner } from "@/components/EmailVerificationBanner";
import { OnboardingModal } from "@/components/OnboardingModal";
import { DashboardWidget } from "@/components/dashboard/DashboardWidget";
import { GlobalSearch } from "@/components/dashboard/GlobalSearch";

import { GlassmorphicCard, PageHeader } from "@/components/ui/FuturisticElements";

import { FlowStateWidget } from "@/components/dashboard/FlowStateWidget";

import { EasySRTWidget } from "@/components/dashboard/EasySRTWidget";
import { AgentChatWidget } from "@/components/dashboard/AgentChatWidget";
import { useFeatureFlags } from "@/hooks/useFeatureFlags";
import { FeatureStatusBadge } from "@/components/FeatureStatusBadge";
import { FeatureUnavailableDialog } from "@/components/FeatureUnavailableDialog";
import { Badge } from "@/components/ui/badge";
import type { FeatureStatus } from "@/hooks/useFeatureFlags";

// Heavy dialogs — lazy loaded, only mount when open
const CourseHubDialog = lazy(() => import("@/components/dashboard/CourseHubDialog").then(m => ({ default: m.CourseHubDialog })));
const ActivityDialog = lazy(() => import("@/components/dashboard/ActivityDialog").then(m => ({ default: m.ActivityDialog })));
const ReferralDialog = lazy(() => import("@/components/dashboard/ReferralDialog").then(m => ({ default: m.ReferralDialog })));

const FlowStateDialog = lazy(() => import("@/components/dashboard/FlowStateDialog").then(m => ({ default: m.FlowStateDialog })));

const EasySRTDialog = lazy(() => import("@/components/easy-srt/EasySRTDialog").then(m => ({ default: m.EasySRTDialog })));
const AgentChatDialog = lazy(() => import("@/components/agent-chat/AgentChatDialog").then(m => ({ default: m.AgentChatDialog })));

// Prefetch helpers — trigger chunk download without mounting
const prefetchMap: Record<string, () => Promise<unknown>> = {
  agentChat: () => import("@/components/agent-chat/AgentChatDialog"),
  flowState: () => import("@/components/dashboard/FlowStateDialog"),
  courseHub: () => import("@/components/dashboard/CourseHubDialog"),
  activity: () => import("@/components/dashboard/ActivityDialog"),
  referral: () => import("@/components/dashboard/ReferralDialog"),
  
  
  easySrt: () => import("@/components/easy-srt/EasySRTDialog"),
};

const prefetched = new Set<string>();
const prefetch = (key: string) => {
  if (prefetched.has(key)) return;
  prefetched.add(key);
  prefetchMap[key]?.();
};

const Dashboard = () => {
  const { user, isAdmin } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { isFeatureEnabled, getFeatureStatus, getFeature, getMaintenanceMessage } = useFeatureFlags();

  // Show success toast when user arrives after email verification
  useEffect(() => {
    if (searchParams.get("verified") === "true") {
      toast.success("Email verified successfully! Welcome to your dashboard.");
      searchParams.delete("verified");
      setSearchParams(searchParams, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  // Idle prefetch top 3 dialog chunks after mount
  useEffect(() => {
    const idle = typeof requestIdleCallback === "function" ? requestIdleCallback : (cb: () => void) => setTimeout(cb, 2000);
    const id = idle(() => {
      prefetch("agentChat");
      prefetch("flowState");
      prefetch("courseHub");
    });
    return () => {
      if (typeof cancelIdleCallback === "function") cancelIdleCallback(id as number);
    };
  }, []);

  // Hover/touch prefetch handler factory
  const hoverPrefetch = useCallback((key: string) => () => prefetch(key), []);

  const credits = useUserCredits(user?.id);
  const { data: courseProgress = [] } = useCourseProgress(user?.id);
  const { data: dashStats, isLoading: statsLoading } = useDashboardStats(user?.id);

  const { balance, isTrialUser } = credits;

  // Pull-to-refresh: refetch every dashboard-relevant query when user pulls down.
  const queryClient = useQueryClient();
  const handleRefresh = useCallback(async () => {
    await queryClient.invalidateQueries();
  }, [queryClient]);
  usePullToRefreshRegister(handleRefresh);

  // Dialog states
  const [courseHubDialogOpen, setCourseHubDialogOpen] = useState(false);
  const [referralsDialogOpen, setReferralsDialogOpen] = useState(false);
  const [activityDialogOpen, setActivityDialogOpen] = useState(false);
  
  const [flowStateDialogOpen, setFlowStateDialogOpen] = useState(false);
  
  const [easySrtDialogOpen, setEasySrtDialogOpen] = useState(false);
  const [agentChatDialogOpen, setAgentChatDialogOpen] = useState(false);
  // Feature unavailable dialog state
  const [featureDialogOpen, setFeatureDialogOpen] = useState(false);
  const [selectedDisabledFeature, setSelectedDisabledFeature] = useState<{
    name: string;
    nameMy: string | null;
    status: FeatureStatus;
    message: string | null;
    messageMy: string | null;
  } | null>(null);

  // Check if referral program is enabled
  const { data: referralSettings } = useQuery({
    queryKey: ["referral-settings"],
    queryFn: async () => {
      const { data } = await supabase.from("referral_settings").select("is_enabled").single();
      return data;
    },
  });

  // Fetch referral stats
  const { data: referralStats } = useQuery({
    queryKey: ["referral-stats", user?.id],
    queryFn: async () => {
      if (!user?.id) return null;
      const { data } = await supabase
        .from("referral_codes")
        .select("total_referrals, total_credits_earned")
        .eq("user_id", user.id)
        .maybeSingle();
      return data;
    },
    enabled: !!user?.id && referralSettings?.is_enabled,
  });

  // Handle click on disabled feature widget
  const handleDisabledFeatureClick = (featureKey: string) => {
    const feature = getFeature(featureKey);
    const status = getFeatureStatus(featureKey);
    if (feature && status) {
      setSelectedDisabledFeature({
        name: feature.feature_name,
        nameMy: feature.feature_name_my,
        status,
        message: getMaintenanceMessage(featureKey, false),
        messageMy: getMaintenanceMessage(featureKey, true),
      });
      setFeatureDialogOpen(true);
    }
  };

  // Dashboard widget wrapper
  const DashboardWidgetWrapper = ({ featureKey, children }: { featureKey: string; children: React.ReactNode }) => {
    const feature = getFeature(featureKey);
    const status = getFeatureStatus(featureKey);
    const isEnabled = isFeatureEnabled(featureKey);
    const showOnDashboard = feature?.show_on_dashboard !== false;

    if (!showOnDashboard) {
      if (!isAdmin) return null;
      return (
        <div className="relative opacity-50">
          <div className="absolute -top-1 -right-1 z-10">
            <Badge variant="outline" className="text-[9px] px-1.5 py-0 bg-muted/80 text-muted-foreground border-muted-foreground/30">
              <EyeOff className="h-2.5 w-2.5 mr-0.5" />
              Hidden
            </Badge>
          </div>
          <div className="pointer-events-none grayscale">{children}</div>
        </div>
      );
    }

    if (isEnabled) return <>{children}</>;

    return (
      <div className="relative">
        <div className="opacity-40 pointer-events-none grayscale">{children}</div>
        <button
          onClick={() => handleDisabledFeatureClick(featureKey)}
          className="absolute inset-0 flex flex-col items-center justify-center bg-black/60 backdrop-blur-[2px] rounded-xl cursor-pointer hover:bg-black/70 transition-colors"
        >
          {status === "maintenance" ? (
            <Wrench className="h-6 w-6 text-orange-500 mb-1" />
          ) : status === "coming_soon" ? (
            <Lock className="h-6 w-6 text-purple-500 mb-1" />
          ) : (
            <Lock className="h-6 w-6 text-muted-foreground mb-1" />
          )}
          <span className="text-xs font-medium text-white/80">
            {status === "maintenance" ? "ပြုပြင်နေ" : status === "coming_soon" ? "မကြာမီ" : "Disabled"}
          </span>
        </button>
      </div>
    );
  };

  return (
    <div className="relative p-3 sm:p-4 lg:p-6 pb-24 lg:pb-6 overflow-hidden">
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-primary/[0.03] via-transparent to-violet-500/[0.03]" />
      <div className="pointer-events-none absolute top-0 left-1/4 w-96 max-w-full h-96 bg-primary/[0.04] rounded-full blur-[120px]" />
      <div className="pointer-events-none absolute bottom-0 right-1/4 w-80 max-w-full h-80 bg-violet-500/[0.03] rounded-full blur-[100px]" />

      <div className="relative z-10">
      <EmailVerificationBanner />
      <OnboardingModal isTrialUser={isTrialUser} balance={balance} />

      <div className="mb-4 sm:mb-6">
        <PageHeader
          icon={LayoutDashboard}
          title={`Hi, ${user?.email?.split("@")[0] || "there"}`}
          subtitle="Your personalized learning dashboard"
          actions={<GlobalSearch />}
        />
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
        {user && (
          <div onMouseEnter={hoverPrefetch("agentChat")} onTouchStart={hoverPrefetch("agentChat")}>
            <AgentChatWidget userId={user.id} onClick={() => setAgentChatDialogOpen(true)} delay={0} totalSessions={dashStats?.agentChat.totalSessions} todayMessages={dashStats?.agentChat.todayMessages} isLoading={statsLoading} />
          </div>
        )}
        <DashboardWidgetWrapper featureKey="courses">
          <div className="relative" onMouseEnter={hoverPrefetch("courseHub")} onTouchStart={hoverPrefetch("courseHub")}>
            {getFeatureStatus("courses") === "beta" && isFeatureEnabled("courses") && (
              <div className="absolute -top-1 -right-1 z-10"><FeatureStatusBadge status="beta" size="sm" /></div>
            )}
            <DashboardWidget title="Learning Hub" subtitle="Courses, Progress & More" value={`${courseProgress.length} Courses`} icon={GraduationCap} gradient="bg-gradient-to-br from-blue-500 to-indigo-600" onClick={() => setCourseHubDialogOpen(true)} delay={0} />
          </div>
        </DashboardWidgetWrapper>

        {referralSettings?.is_enabled && (
          <DashboardWidgetWrapper featureKey="referrals">
            <div className="relative" onMouseEnter={hoverPrefetch("referral")} onTouchStart={hoverPrefetch("referral")}>
              {getFeatureStatus("referrals") === "beta" && isFeatureEnabled("referrals") && (
                <div className="absolute -top-1 -right-1 z-10"><FeatureStatusBadge status="beta" size="sm" /></div>
              )}
              <DashboardWidget title="Referrals" subtitle="Invite & earn" value={referralStats?.total_referrals || 0} icon={Users} gradient="bg-gradient-to-br from-purple-500 to-pink-500" onClick={() => setReferralsDialogOpen(true)} delay={0.1} />
            </div>
          </DashboardWidgetWrapper>
        )}

        <div onMouseEnter={hoverPrefetch("activity")} onTouchStart={hoverPrefetch("activity")}>
          <DashboardWidget title="Activity" subtitle="See what's new" value="Recent" icon={Activity} gradient="bg-gradient-to-br from-pink-500 to-rose-500" onClick={() => setActivityDialogOpen(true)} delay={referralSettings?.is_enabled ? 0.2 : 0.1} />
        </div>



        {user && (
          <DashboardWidgetWrapper featureKey="flowstate">
            <div className="relative" onMouseEnter={hoverPrefetch("flowState")} onTouchStart={hoverPrefetch("flowState")}>
              {getFeatureStatus("flowstate") === "beta" && isFeatureEnabled("flowstate") && (
                <div className="absolute -top-1 -right-1 z-10"><FeatureStatusBadge status="beta" size="sm" /></div>
              )}
              <FlowStateWidget userId={user.id} onClick={() => setFlowStateDialogOpen(true)} delay={referralSettings?.is_enabled ? 0.4 : 0.3} net={dashStats?.flowState.net} isLoading={statsLoading} />
            </div>
          </DashboardWidgetWrapper>
        )}


        {user && (
          <DashboardWidgetWrapper featureKey="easy_srt">
            <div className="relative" onMouseEnter={hoverPrefetch("easySrt")} onTouchStart={hoverPrefetch("easySrt")}>
              {getFeatureStatus("easy_srt") === "beta" && isFeatureEnabled("easy_srt") && (
                <div className="absolute -top-1 -right-1 z-10"><FeatureStatusBadge status="beta" size="sm" /></div>
              )}
              <EasySRTWidget userId={user.id} onClick={() => setEasySrtDialogOpen(true)} delay={referralSettings?.is_enabled ? 0.6 : 0.5} completedCount={dashStats?.easySrt.completedCount} isLoading={statsLoading} />
            </div>
          </DashboardWidgetWrapper>
        )}
      </div>

      {/* Dialogs — conditional mount + lazy loaded */}
      <Suspense fallback={null}>
        {user && (
          <>
            {courseHubDialogOpen && <CourseHubDialog open={courseHubDialogOpen} onOpenChange={setCourseHubDialogOpen} userId={user.id} />}
            {activityDialogOpen && <ActivityDialog open={activityDialogOpen} onOpenChange={setActivityDialogOpen} />}
            {referralSettings?.is_enabled && referralsDialogOpen && <ReferralDialog open={referralsDialogOpen} onOpenChange={setReferralsDialogOpen} />}
            
            {flowStateDialogOpen && <FlowStateDialog open={flowStateDialogOpen} onOpenChange={setFlowStateDialogOpen} userId={user.id} />}
            
            {easySrtDialogOpen && <EasySRTDialog open={easySrtDialogOpen} onOpenChange={setEasySrtDialogOpen} userId={user.id} />}
            {agentChatDialogOpen && <AgentChatDialog open={agentChatDialogOpen} onOpenChange={setAgentChatDialogOpen} userId={user.id} />}
          </>
        )}
      </Suspense>

      {selectedDisabledFeature && (
        <FeatureUnavailableDialog
          open={featureDialogOpen}
          onOpenChange={setFeatureDialogOpen}
          featureName={selectedDisabledFeature.name}
          featureNameMy={selectedDisabledFeature.nameMy}
          status={selectedDisabledFeature.status}
          message={selectedDisabledFeature.message}
          messageMy={selectedDisabledFeature.messageMy}
        />
      )}
      </div>
    </div>
  );
};

export default Dashboard;
