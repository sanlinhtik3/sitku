import { lazy, Suspense, useState, useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import {
  consultantRangeForPreset,
  type ConsultantRangePreset,
  useConsultantDashboard,
} from "@/hooks/useConsultantData";
import { WelcomeHeader } from "./parts/WelcomeHeader";
import { OverviewKpiGrid } from "./parts/OverviewKpiGrid";
import { TopPerformersList } from "./parts/TopPerformersList";
import { AddRecordDrawer } from "./parts/AddRecordDrawer";
import { ConsultantThreadRail } from "./parts/ConsultantThreadRail";
import { CfoProductivityPanel } from "./parts/CfoProductivityPanel";
import { DailyPostList } from "./parts/DailyPostList";

// Recharts (~499KB) lazy-loaded — pulled in only when the consultant panel is open.
const SalesBarChart = lazy(() => import("./parts/SalesBarChart").then((m) => ({ default: m.SalesBarChart })));
const ActivityInsightsCard = lazy(() => import("./parts/ActivityInsightsCard").then((m) => ({ default: m.ActivityInsightsCard })));
const KpiIntelligenceChart = lazy(() => import("./parts/KpiIntelligenceChart").then((m) => ({ default: m.KpiIntelligenceChart })));
const ChannelMixDonut = lazy(() => import("./parts/ChannelMixDonut").then((m) => ({ default: m.ChannelMixDonut })));

const ChartSkeleton = ({ h = 220 }: { h?: number }) => <div className="animate-pulse rounded-xl bg-[#0e0e0e]" style={{ height: h }} aria-label="Loading chart" />;

interface Props {
  userId: string;
  onClose: () => void;
}

interface UserMetadata {
  display_name?: string;
  full_name?: string;
  name?: string;
}

export function AgentConsultantPanel({ userId, onClose }: Props) {
  const { user } = useAuth();
  const qc = useQueryClient();

  const [rangePreset, setRangePreset] = useState<ConsultantRangePreset>("this_week");
  const rangeSelection = useMemo(() => consultantRangeForPreset(rangePreset), [rangePreset]);
  const range = rangeSelection.range;
  const dash = useConsultantDashboard(range);

  const [addOpen, setAddOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);

  const meta = (user?.user_metadata ?? {}) as UserMetadata;
  const userName =
    meta.display_name || meta.full_name || meta.name ||
    user?.email?.split("@")[0] || "there";

  const refresh = () => qc.invalidateQueries({ queryKey: ["agentic"] });

  return (
    <div className="consultant-shell relative flex-1 min-h-0 m-1 sm:m-1.5 rounded-glass-container overflow-hidden flex flex-col">
      <div className="consultant-grid-bg pointer-events-none absolute inset-0 opacity-25" />
      <div className="relative z-10 flex flex-col min-h-0 flex-1">
        <WelcomeHeader
          userName={userName}
          rangePreset={rangePreset}
          onRangePresetChange={setRangePreset}
          rangeLabel={rangeSelection.label}
          onAddRecord={() => setAddOpen(true)}
          onRefresh={refresh}
          onClose={onClose}
          chatOpen={chatOpen}
          onToggleChat={() => setChatOpen((open) => !open)}
        />

        <div className={`flex-1 min-h-0 grid grid-cols-1 gap-3 p-3 overflow-hidden ${chatOpen ? "lg:grid-cols-[1fr_minmax(360px,38%)]" : "lg:grid-cols-1"}`}>
          {/* DASHBOARD COLUMN */}
          <div className="min-h-0 overflow-y-auto pr-1 space-y-3">
            <OverviewKpiGrid data={dash.data} periodLabel={rangeSelection.label} />
            <Suspense fallback={<ChartSkeleton />}>
              <KpiIntelligenceChart range={range} dashboard={dash.data} periodLabel={rangeSelection.label} />
            </Suspense>
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
              <Suspense fallback={<ChartSkeleton />}>
                <ChannelMixDonut dashboard={dash.data} periodLabel={rangeSelection.label} />
              </Suspense>
              <CfoProductivityPanel range={range} dashboard={dash.data} periodLabel={rangeSelection.label} />
            </div>
            <Suspense fallback={<ChartSkeleton />}>
              <SalesBarChart range={range} periodLabel={rangeSelection.label} />
            </Suspense>
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
              <DailyPostList onAddPost={() => setAddOpen(true)} />
              <TopPerformersList range={range} periodLabel={rangeSelection.label} />
            </div>
            <Suspense fallback={<ChartSkeleton />}>
              <ActivityInsightsCard range={range} periodLabel={rangeSelection.label} />
            </Suspense>
          </div>

          {/* CHAT RAIL */}
          {chatOpen && (
            <div className="min-h-0 lg:h-full">
              <ConsultantThreadRail
                userId={userId}
                range={range}
                periodLabel={rangeSelection.label}
                onClose={() => setChatOpen(false)}
              />
            </div>
          )}
        </div>
      </div>

      <AddRecordDrawer open={addOpen} onOpenChange={setAddOpen} />
    </div>
  );
}
