import { useState, useMemo } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  ReferenceLine,
} from "recharts";
import {
  TrendingUp,
  TrendingDown,
  Minus,
  Calendar,
  CalendarDays,
  ChevronUp,
  ChevronDown,
  CheckCircle2,
} from "lucide-react";
import { format, parseISO, startOfMonth, endOfMonth, eachDayOfInterval, isSameMonth, getWeek, startOfWeek, endOfWeek, isWithinInterval, min } from "date-fns";

interface Task {
  id: string;
  title: string;
  points: number;
  status: string;
}

interface Completion {
  id: string;
  task_id: string;
  points_earned: number;
  completed_at: string;
  week_number: number;
  year: number;
}

interface PerformanceChartProps {
  completions: Completion[];
  tasks: Task[];
  isSoloMode?: boolean;
  selectedMonth?: Date;
}

type ViewMode = "daily" | "weekly";

interface DailyDataPoint {
  date: string;
  dateLabel: string;
  fullDate: string;
  actual: number;
  planned: number;
  trend: "up" | "down" | "neutral";
  trendValue: number;
  completedTasks: {
    id: string;
    title: string;
    points: number;
  }[];
}

interface WeeklyDataPoint {
  week: string;
  actual: number;
  planned: number;
  trend: "up" | "down" | "neutral";
  trendValue: number;
  completedTasks: {
    id: string;
    title: string;
    points: number;
  }[];
}

// Custom Tooltip Component
const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload || !payload.length) return null;

  const data = payload[0]?.payload;
  if (!data) return null;

  const actualPayload = payload.find((p: any) => p.dataKey === "actual");
  const plannedPayload = payload.find((p: any) => p.dataKey === "planned");

  return (
    <div className="bg-card border border-border rounded-lg p-3 sm:p-4 shadow-xl backdrop-blur-sm min-w-[180px] sm:min-w-[220px]">
      {/* Header */}
      <div className="flex items-center justify-between mb-3 pb-2 border-b border-border">
        <span className="font-semibold text-foreground">
          {data.fullDate || data.week}
        </span>
        {data.trend && data.trendValue !== 0 && (
          <Badge
            variant="outline"
            className={`text-xs gap-1 ${
              data.trend === "up"
                ? "text-emerald-500 border-emerald-500/30 bg-emerald-500/10"
                : data.trend === "down"
                ? "text-red-500 border-red-500/30 bg-red-500/10"
                : "text-muted-foreground"
            }`}
          >
            {data.trend === "up" ? (
              <ChevronUp className="h-3 w-3" />
            ) : data.trend === "down" ? (
              <ChevronDown className="h-3 w-3" />
            ) : (
              <Minus className="h-3 w-3" />
            )}
            {data.trend === "up" ? "+" : ""}
            {data.trendValue}
          </Badge>
        )}
      </div>

      {/* Points Summary */}
      <div className="space-y-2 mb-3">
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground flex items-center gap-2">
            <div
              className="w-3 h-3 rounded-full"
              style={{ backgroundColor: actualPayload?.stroke }}
            />
            Actual
          </span>
          <span className="font-bold text-foreground">
            {actualPayload?.value || 0} pts
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground flex items-center gap-2">
            <div
              className="w-3 h-3 rounded-full border-2 border-dashed"
              style={{ borderColor: plannedPayload?.stroke }}
            />
            Target
          </span>
          <span className="font-medium text-muted-foreground">
            {plannedPayload?.value || 0} pts
          </span>
        </div>
      </div>

      {/* Completed Tasks */}
      {data.completedTasks && data.completedTasks.length > 0 && (
        <div className="pt-2 border-t border-border">
          <p className="text-xs text-muted-foreground mb-2 flex items-center gap-1">
            <CheckCircle2 className="h-3 w-3" />
            Completed Tasks ({data.completedTasks.length})
          </p>
          <div className="space-y-1 max-h-[120px] overflow-y-auto">
            {data.completedTasks.map((task: any, index: number) => (
              <div
                key={task.id || index}
                className="flex items-center justify-between text-xs bg-muted/50 rounded px-2 py-1.5"
              >
                <span className="text-foreground truncate max-w-[140px]">
                  {task.title}
                </span>
                <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                  +{task.points}
                </Badge>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* No tasks message */}
      {(!data.completedTasks || data.completedTasks.length === 0) && (
        <div className="pt-2 border-t border-border">
          <p className="text-xs text-muted-foreground text-center py-2">
            No tasks completed
          </p>
        </div>
      )}
    </div>
  );
};

// Custom Dot Component for showing trend indicators
const CustomDot = (props: any) => {
  const { cx, cy, payload, dataKey } = props;

  if (dataKey !== "actual" || !payload) return null;

  const dotColor =
    payload.trend === "up"
      ? "hsl(var(--chart-2))"
      : payload.trend === "down"
      ? "hsl(var(--destructive))"
      : "hsl(var(--primary))";

  return (
    <g>
      {/* Outer glow for trend */}
      {payload.trend !== "neutral" && payload.actual > 0 && (
        <circle
          cx={cx}
          cy={cy}
          r={8}
          fill={dotColor}
          opacity={0.2}
        />
      )}
      {/* Main dot */}
      <circle
        cx={cx}
        cy={cy}
        r={5}
        fill={dotColor}
        stroke="hsl(var(--background))"
        strokeWidth={2}
      />
    </g>
  );
};

export function PerformanceChart({
  completions,
  tasks,
  isSoloMode = false,
  selectedMonth = new Date(),
}: PerformanceChartProps) {
  const [viewMode, setViewMode] = useState<ViewMode>("daily");

  // Create a map of task_id to task details
  const taskMap = useMemo(() => {
    const map = new Map<string, Task>();
    tasks.forEach((task) => {
      map.set(task.id, task);
    });
    return map;
  }, [tasks]);

  // Get month label for display
  const monthLabel = format(selectedMonth, "MMMM yyyy");

  // Process daily data based on selected month
  const dailyData = useMemo((): DailyDataPoint[] => {
    const today = new Date();
    const monthStart = startOfMonth(selectedMonth);
    const monthEnd = endOfMonth(selectedMonth);
    const isCurrentMonth = isSameMonth(selectedMonth, today);
    
    // For current month, only show days up to today
    // For past months, show all days
    const endDate = isCurrentMonth ? min([today, monthEnd]) : monthEnd;
    
    const days = eachDayOfInterval({
      start: monthStart,
      end: endDate,
    });

    // Group completions by date
    const completionsByDate = new Map<string, Completion[]>();
    completions.forEach((completion) => {
      const dateKey = format(parseISO(completion.completed_at), "yyyy-MM-dd");
      const existing = completionsByDate.get(dateKey) || [];
      completionsByDate.set(dateKey, [...existing, completion]);
    });

    // Calculate daily planned (average points per day based on total tasks)
    const totalTaskPoints = tasks.reduce((sum, task) => sum + (task.points || 0), 0);
    const daysInMonth = days.length || 1;
    const dailyPlanned = Math.round(totalTaskPoints / daysInMonth);

    let previousActual = 0;

    return days.map((day) => {
      const dateKey = format(day, "yyyy-MM-dd");
      const dayCompletions = completionsByDate.get(dateKey) || [];
      const actual = dayCompletions.reduce((sum, c) => sum + c.points_earned, 0);

      // Calculate trend
      const trendValue = actual - previousActual;
      const trend: "up" | "down" | "neutral" =
        trendValue > 0 ? "up" : trendValue < 0 ? "down" : "neutral";

      previousActual = actual;

      // Get completed task details
      const completedTasks = dayCompletions.map((c) => {
        const task = taskMap.get(c.task_id);
        return {
          id: c.task_id,
          title: task?.title || "Unknown Task",
          points: c.points_earned,
        };
      });

      return {
        date: dateKey,
        dateLabel: format(day, "d"),
        fullDate: format(day, "EEEE, MMM d"),
        actual,
        planned: dailyPlanned,
        trend,
        trendValue,
        completedTasks,
      };
    });
  }, [completions, tasks, taskMap, selectedMonth]);

  // Process weekly data based on selected month
  const weeklyData = useMemo((): WeeklyDataPoint[] => {
    const monthStart = startOfMonth(selectedMonth);
    const monthEnd = endOfMonth(selectedMonth);
    
    // Group completions by week within the selected month
    const weeklyMap = new Map<string, { completions: Completion[]; actual: number; weekNum: number }>();

    completions.forEach((completion) => {
      const completedDate = parseISO(completion.completed_at);
      // Only include completions within the selected month
      if (completedDate >= monthStart && completedDate <= monthEnd) {
        const weekNum = getWeek(completedDate);
        const weekKey = `W${weekNum}`;
        const existing = weeklyMap.get(weekKey) || { completions: [], actual: 0, weekNum };
        weeklyMap.set(weekKey, {
          completions: [...existing.completions, completion],
          actual: existing.actual + completion.points_earned,
          weekNum,
        });
      }
    });

    // Calculate planned points
    const totalTaskPoints = tasks.reduce((sum, task) => sum + (task.points || 0), 0);
    const weeksCount = weeklyMap.size || 1;
    const avgPlanned = Math.round(totalTaskPoints / weeksCount);

    let previousActual = 0;
    const result: WeeklyDataPoint[] = [];

    // Sort by week number
    const sortedWeeks = Array.from(weeklyMap.entries()).sort((a, b) => {
      return a[1].weekNum - b[1].weekNum;
    });

    sortedWeeks.forEach(([weekKey, data]) => {
      const trendValue = data.actual - previousActual;
      const trend: "up" | "down" | "neutral" =
        trendValue > 0 ? "up" : trendValue < 0 ? "down" : "neutral";

      previousActual = data.actual;

      const completedTasks = data.completions.map((c) => {
        const task = taskMap.get(c.task_id);
        return {
          id: c.task_id,
          title: task?.title || "Unknown Task",
          points: c.points_earned,
        };
      });

      result.push({
        week: `W${data.weekNum}`,
        actual: data.actual,
        planned: avgPlanned,
        trend,
        trendValue,
        completedTasks,
      });
    });

    return result;
  }, [completions, tasks, taskMap, selectedMonth]);

  const chartData = viewMode === "daily" ? dailyData : weeklyData;

  // Calculate overall trend
  const overallTrend = useMemo(() => {
    if (chartData.length < 2) return { trend: "neutral", percentage: 0 };

    const recentHalf = chartData.slice(-Math.floor(chartData.length / 2));
    const olderHalf = chartData.slice(0, Math.floor(chartData.length / 2));

    const recentAvg =
      recentHalf.reduce((sum, d) => sum + d.actual, 0) / (recentHalf.length || 1);
    const olderAvg =
      olderHalf.reduce((sum, d) => sum + d.actual, 0) / (olderHalf.length || 1);

    if (olderAvg === 0) return { trend: "up", percentage: 100 };

    const percentage = Math.round(((recentAvg - olderAvg) / olderAvg) * 100);
    const trend: "up" | "down" | "neutral" =
      percentage > 5 ? "up" : percentage < -5 ? "down" : "neutral";

    return { trend, percentage: Math.abs(percentage) };
  }, [chartData]);

  return (
    <Card className="p-3 sm:p-4 bg-card/50 backdrop-blur-sm border-border/50">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 sm:gap-3 mb-3 sm:mb-4">
        <div className="flex items-center gap-2">
          <div className="h-7 w-7 sm:h-8 sm:w-8 rounded-lg bg-gradient-to-br from-primary/30 to-primary/50 flex items-center justify-center">
            <TrendingUp className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-primary" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-sm sm:text-base font-semibold">
                {isSoloMode ? "My Progress" : "Performance Trends"}
              </h3>
              {overallTrend.trend !== "neutral" && (
                <Badge
                  variant="outline"
                  className={`text-[10px] sm:text-xs gap-1 ${
                    overallTrend.trend === "up"
                      ? "text-emerald-500 border-emerald-500/30 bg-emerald-500/10"
                      : "text-red-500 border-red-500/30 bg-red-500/10"
                  }`}
                >
                  {overallTrend.trend === "up" ? (
                    <TrendingUp className="h-2.5 w-2.5 sm:h-3 sm:w-3" />
                  ) : (
                    <TrendingDown className="h-2.5 w-2.5 sm:h-3 sm:w-3" />
                  )}
                  {overallTrend.percentage}%
                </Badge>
              )}
            </div>
            <p className="text-xs sm:text-sm text-muted-foreground">
              {monthLabel} • Hover for details
            </p>
          </div>
        </div>

        {/* View Mode Toggle */}
        <div className="flex items-center gap-0.5 sm:gap-1 bg-muted/50 rounded-lg p-0.5 sm:p-1">
          <Button
            variant={viewMode === "daily" ? "secondary" : "ghost"}
            size="sm"
            onClick={() => setViewMode("daily")}
            className="gap-1 sm:gap-1.5 h-7 sm:h-8 text-xs sm:text-sm px-2 sm:px-3"
          >
            <Calendar className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
            Daily
          </Button>
          <Button
            variant={viewMode === "weekly" ? "secondary" : "ghost"}
            size="sm"
            onClick={() => setViewMode("weekly")}
            className="gap-1 sm:gap-1.5 h-7 sm:h-8 text-xs sm:text-sm px-2 sm:px-3"
          >
            <CalendarDays className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
            Weekly
          </Button>
        </div>
      </div>

      <div className="h-[180px] sm:h-[240px]">
        {chartData.length === 0 ? (
          <div className="h-full flex items-center justify-center">
            <div className="text-center text-muted-foreground">
              <TrendingUp className="h-8 w-8 sm:h-12 sm:w-12 mx-auto mb-2 opacity-30" />
              <p className="text-sm sm:text-base">No performance data yet</p>
              <p className="text-xs sm:text-sm">Complete tasks to see your progress</p>
            </div>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="hsl(var(--border))"
                opacity={0.3}
                vertical={false}
              />
              <XAxis
                dataKey={viewMode === "daily" ? "dateLabel" : "week"}
                stroke="hsl(var(--muted-foreground))"
                fontSize={11}
                tickLine={false}
                axisLine={false}
                dy={10}
              />
              <YAxis
                stroke="hsl(var(--muted-foreground))"
                fontSize={11}
                tickLine={false}
                axisLine={false}
                dx={-10}
                tickFormatter={(value) => `${value}`}
              />
              <Tooltip content={<CustomTooltip />} />
              <Legend
                wrapperStyle={{ paddingTop: "20px" }}
                formatter={(value) => (
                  <span className="text-sm text-muted-foreground">{value}</span>
                )}
              />
              {/* Reference line at 0 */}
              <ReferenceLine y={0} stroke="hsl(var(--border))" />
              {/* Planned line (dashed) */}
              <Line
                type="monotone"
                dataKey="planned"
                stroke="hsl(var(--muted-foreground))"
                strokeWidth={2}
                strokeDasharray="5 5"
                dot={false}
                name="Target"
              />
              {/* Actual line with custom dots */}
              <Line
                type="monotone"
                dataKey="actual"
                stroke="hsl(var(--primary))"
                strokeWidth={3}
                dot={<CustomDot />}
                activeDot={{
                  r: 6,
                  fill: "hsl(var(--primary))",
                  stroke: "hsl(var(--background))",
                  strokeWidth: 2,
                }}
                name="Actual"
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Summary Stats */}
      {chartData.length > 0 && (
        <div className="grid grid-cols-3 gap-2 sm:gap-4 mt-3 sm:mt-4 pt-3 sm:pt-4 border-t border-border/50">
          <div className="text-center">
            <p className="text-lg sm:text-2xl font-bold text-foreground">
              {chartData.reduce((sum, d) => sum + d.actual, 0)}
            </p>
            <p className="text-[10px] sm:text-xs text-muted-foreground">Total Points</p>
          </div>
          <div className="text-center">
            <p className="text-lg sm:text-2xl font-bold text-foreground">
              {chartData.reduce((sum, d) => sum + d.completedTasks.length, 0)}
            </p>
            <p className="text-[10px] sm:text-xs text-muted-foreground">Tasks Done</p>
          </div>
          <div className="text-center">
            <p className="text-lg sm:text-2xl font-bold text-foreground">
              {chartData.length > 0
                ? Math.round(
                    chartData.reduce((sum, d) => sum + d.actual, 0) / chartData.length
                  )
                : 0}
            </p>
            <p className="text-[10px] sm:text-xs text-muted-foreground">
              Avg/{viewMode === "daily" ? "Day" : "Wk"}
            </p>
          </div>
        </div>
      )}
    </Card>
  );
}
