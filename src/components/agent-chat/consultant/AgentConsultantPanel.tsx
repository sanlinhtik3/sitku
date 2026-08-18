import { lazy, Suspense, useState, useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  consultantRangeForPreset,
  type ConsultantRangePreset,
  useConsultantWeeklyAnalysis,
} from "@/hooks/useConsultantData";
import { WelcomeHeader } from "./parts/WelcomeHeader";
import { OverviewKpiGrid } from "./parts/OverviewKpiGrid";
import { TopPerformersList } from "./parts/TopPerformersList";
import { AddRecordDrawer } from "./parts/AddRecordDrawer";
import { ConsultantThreadRail } from "./parts/ConsultantThreadRail";
import { CfoProductivityPanel } from "./parts/CfoProductivityPanel";
import { DailyPostList } from "./parts/DailyPostList";
import { GrowthPulse } from "./parts/GrowthPulse";
import { TeamPerformanceTable } from "./parts/TeamPerformanceTable";

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

export function AgentConsultantPanel({ userId, onClose }: Props) {
  const qc = useQueryClient();

  const [rangePreset, setRangePreset] = useState<ConsultantRangePreset>("this_week");
  const rangeSelection = useMemo(() => consultantRangeForPreset(rangePreset), [rangePreset]);
  const range = rangeSelection.range;
  const analysis = useConsultantWeeklyAnalysis(range);

  const [addOpen, setAddOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);

  const refresh = () => qc.invalidateQueries({ queryKey: ["agentic"] });

  return (
    <div className="consultant-shell relative flex-1 min-h-0 overflow-hidden flex flex-col">
      <div className="consultant-grid-bg pointer-events-none absolute inset-0" />
      <div className="relative z-10 mx-auto flex w-full max-w-[1400px] flex-col min-h-0 flex-1 px-3 py-3 sm:px-5 sm:pb-4 sm:pt-[18px]">
        <WelcomeHeader
          rangePreset={rangePreset}
          onRangePresetChange={setRangePreset}
          rangeLabel={rangeSelection.label}
          onAddRecord={() => setAddOpen(true)}
          onRefresh={refresh}
          onClose={onClose}
          chatOpen={chatOpen}
          onToggleChat={() => setChatOpen((open) => !open)}
        />

        <div className={`flex-1 min-h-0 grid grid-cols-1 gap-[14px] pt-[14px] overflow-hidden ${chatOpen ? "lg:grid-cols-[1fr_minmax(330px,33%)]" : "lg:grid-cols-1"}`}>
          {/* DASHBOARD COLUMN */}
          <div className="consultant-scroll ml-0.5 min-h-0 space-y-[14px] overflow-y-auto pr-1">
            <OverviewKpiGrid analysis={analysis.data} periodLabel={rangeSelection.label} />
            <GrowthPulse analysis={analysis.data} />
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-[14px]">
              <Suspense fallback={<ChartSkeleton />}>
                <KpiIntelligenceChart analysis={analysis.data} periodLabel={rangeSelection.label} />
              </Suspense>
              <Suspense fallback={<ChartSkeleton />}>
                <SalesBarChart analysis={analysis.data} periodLabel={rangeSelection.label} />
              </Suspense>
            </div>
            <div className="grid grid-cols-1 gap-[14px] md:grid-cols-3">
              <CfoProductivityPanel range={range} dashboard={analysis.data?.totals} targets={analysis.data?.targets} periodLabel={rangeSelection.label} />
              <Suspense fallback={<ChartSkeleton />}>
                <ChannelMixDonut platformMix={analysis.data?.platformMix} periodLabel={rangeSelection.label} />
              </Suspense>
            </div>
            <TeamPerformanceTable />
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-[14px]">
              <TopPerformersList posts={analysis.data?.topPosts} periodLabel={rangeSelection.label} isLoading={analysis.isLoading} />
              <DailyPostList lowSignalPosts={analysis.data?.lowSignalPosts ?? []} isLoading={analysis.isLoading} onAddPost={() => setAddOpen(true)} />
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
