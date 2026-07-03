import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Activity, Zap, Clock, CheckCircle2, XCircle, RefreshCw,
  BarChart3, TrendingUp, Users, Network, Timer,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useSubAgentStats } from "@/hooks/useSubAgentStats";
import { formatDistanceToNow } from "date-fns";
import { motion, AnimatePresence } from "motion/react";
import { cn } from "@/lib/utils";

export function AdminSubAgentMonitor() {
  const { stats, isLoading, refetch, hasActiveWork } = useSubAgentStats();
  const [activeTab, setActiveTab] = useState("overview");

  // Fetch detailed sub-agent tasks
  const { data: tasks } = useQuery({
    queryKey: ["sub-agent-tasks-admin"],
    queryFn: async () => {
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const { data } = await supabase
        .from("agent_sub_tasks")
        .select("*")
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(100);
      return data || [];
    },
    refetchInterval: 15000,
  });

  const runningTasks = tasks?.filter(t => t.status === "running") || [];
  const completedTasks = tasks?.filter(t => t.status === "completed") || [];
  const failedTasks = tasks?.filter(t => t.status === "failed") || [];

  const successRate = stats && stats.total > 0
    ? ((stats.completed / stats.total) * 100).toFixed(1)
    : "0";

  const formatDuration = (ms: number | null) => {
    if (!ms) return "—";
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(1)}s`;
  };

  return (
    <div className="relative min-h-full">
      {/* Mesh Gradient Background */}
      <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
        <div
          className="absolute -top-1/4 -left-1/4 w-[150%] h-[150%] rounded-full"
          style={{
            background: "radial-gradient(circle at center, rgba(217,119,6,0.08) 0%, transparent 60%)",
            animation: "mesh-drift-1 60s ease-in-out infinite",
            willChange: "transform",
          }}
        />
        <div
          className="absolute -bottom-1/4 -right-1/4 w-[140%] h-[140%] rounded-full"
          style={{
            background: "radial-gradient(circle at center, rgba(147,51,234,0.06) 0%, transparent 55%)",
            animation: "mesh-drift-2 75s ease-in-out infinite",
            willChange: "transform",
          }}
        />
      </div>

      <div className="relative z-10 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-12 w-12 rounded-xl flex items-center justify-center bg-gradient-to-br from-amber-500 via-orange-500 to-yellow-500 shadow-md shadow-orange-500/25 ring-1 ring-orange-500/20">
              <span className="text-2xl">🐝</span>
            </div>
            <div>
              <h1 className="text-2xl font-bold flex items-center gap-2">
                Sub-Agent Swarm
                <Badge className="text-[9px] px-1.5 py-0 h-4 bg-gradient-to-r from-amber-500 via-orange-500 to-red-500 text-white border-0">
                  <Network className="h-2 w-2 mr-0.5" /> Orchestrator
                </Badge>
              </h1>
              <p className="text-sm text-muted-foreground">
                Real-time sub-agent monitoring & orchestration
              </p>
            </div>
          </div>
          <button
            onClick={() => refetch()}
            disabled={isLoading}
            className="h-9 px-3 rounded-xl bg-card/60 backdrop-blur-sm border border-border/30 hover:bg-card/80 transition-colors flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground disabled:opacity-50"
          >
            <RefreshCw className={cn("h-4 w-4", isLoading && "animate-spin")} />
            <span className="hidden sm:inline">Refresh</span>
          </button>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          <GlassStatCard icon={<Users className="h-4 w-4 text-indigo-400" />} label="Total (24h)" value={stats?.total || 0} colorClass="bg-indigo-500/10 border-indigo-500/30" />
          <GlassStatCard icon={<Activity className="h-4 w-4 text-blue-400" />} label="Running" value={stats?.running || 0} colorClass="bg-blue-500/10 border-blue-500/30" />
          <GlassStatCard icon={<Clock className="h-4 w-4 text-amber-400" />} label="Pending" value={stats?.pending || 0} colorClass="bg-amber-500/10 border-amber-500/30" />
          <GlassStatCard icon={<CheckCircle2 className="h-4 w-4 text-green-400" />} label="Completed" value={stats?.completed || 0} colorClass="bg-green-500/10 border-green-500/30" />
          <GlassStatCard icon={<XCircle className="h-4 w-4 text-red-400" />} label="Failed" value={stats?.failed || 0} colorClass="bg-red-500/10 border-red-500/30" />
          <GlassStatCard icon={<Timer className="h-4 w-4 text-purple-400" />} label="Avg Duration" value={formatDuration(stats?.avgDurationMs || null)} colorClass="bg-purple-500/10 border-purple-500/30" />
        </div>

        {/* Success Rate Bar */}
        <div className="space-y-1.5 px-1">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground flex items-center gap-1.5">
              <TrendingUp className="h-3.5 w-3.5" /> Success Rate
            </span>
            <span className={cn(
              "font-medium tabular-nums",
              Number(successRate) >= 80 ? "text-green-500" :
              Number(successRate) >= 60 ? "text-yellow-500" : "text-destructive"
            )}>
              {successRate}%
            </span>
          </div>
          <div className="h-2 bg-muted/50 rounded-full overflow-hidden">
            <motion.div
              className={cn(
                "h-full rounded-full",
                Number(successRate) >= 80 ? "bg-green-500" :
                Number(successRate) >= 60 ? "bg-yellow-500" : "bg-destructive"
              )}
              initial={{ width: 0 }}
              animate={{ width: `${successRate}%` }}
              transition={{ duration: 0.5, ease: "easeOut" }}
            />
          </div>
        </div>

        {/* Task Tabs */}
        <Card className="border-white/[0.06] bg-card/20 backdrop-blur-xl">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">Worker Bee Activity</CardTitle>
            <CardDescription>Sub-agent tasks from the last 24 hours</CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <TabsList className="w-full justify-start mb-4 bg-transparent border border-border/30">
                <TabsTrigger value="overview" className="text-xs data-[state=active]:bg-blue-500/10">
                  <BarChart3 className="h-3 w-3 mr-1" /> Overview
                </TabsTrigger>
                <TabsTrigger value="running" className="text-xs data-[state=active]:bg-amber-500/10">
                  <Zap className="h-3 w-3 mr-1" /> Running ({runningTasks.length})
                </TabsTrigger>
                <TabsTrigger value="completed" className="text-xs data-[state=active]:bg-emerald-500/10">
                  <CheckCircle2 className="h-3 w-3 mr-1" /> Completed ({completedTasks.length})
                </TabsTrigger>
                <TabsTrigger value="failed" className="text-xs data-[state=active]:bg-red-500/10">
                  <XCircle className="h-3 w-3 mr-1" /> Failed ({failedTasks.length})
                </TabsTrigger>
              </TabsList>

              <ScrollArea className="h-[400px]">
                <TabsContent value="overview" className="space-y-3 m-0">
                  {(tasks || []).slice(0, 20).map(task => (
                    <SubAgentCard key={task.id} task={task} />
                  ))}
                  {(!tasks || tasks.length === 0) && <EmptyState message="No sub-agent activity yet" />}
                </TabsContent>
                <TabsContent value="running" className="space-y-3 m-0">
                  {runningTasks.length === 0 ? <EmptyState message="No running tasks" /> : runningTasks.map(t => <SubAgentCard key={t.id} task={t} />)}
                </TabsContent>
                <TabsContent value="completed" className="space-y-3 m-0">
                  {completedTasks.length === 0 ? <EmptyState message="No completed tasks" /> : completedTasks.slice(0, 30).map(t => <SubAgentCard key={t.id} task={t} />)}
                </TabsContent>
                <TabsContent value="failed" className="space-y-3 m-0">
                  {failedTasks.length === 0 ? <EmptyState message="No failed tasks" /> : failedTasks.map(t => <SubAgentCard key={t.id} task={t} />)}
                </TabsContent>
              </ScrollArea>
            </Tabs>
          </CardContent>
        </Card>

        {/* Active Worker Indicator */}
        <AnimatePresence>
          {hasActiveWork && (
            <motion.div
              initial={{ opacity: 0, y: 10, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -10, scale: 0.95 }}
              className="flex items-center gap-3 px-4 py-3 rounded-2xl bg-card/20 backdrop-blur-xl border border-amber-500/15"
            >
              <div className="relative">
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                  className="absolute inset-0 rounded-full bg-gradient-to-r from-amber-500/30 to-orange-500/30 blur-sm"
                />
                <div className="relative h-10 w-10 rounded-full bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center">
                  <Network className="h-5 w-5 text-white" />
                </div>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-amber-400">Worker Bees Active</p>
                <p className="text-xs text-muted-foreground">{stats?.running || 0} sub-agents currently executing tasks</p>
              </div>
              <div className="flex items-center gap-1">
                {[0, 1, 2].map(i => (
                  <motion.div
                    key={i}
                    animate={{ scale: [1, 1.3, 1], opacity: [0.4, 1, 0.4] }}
                    transition={{ duration: 1, repeat: Infinity, delay: i * 0.2 }}
                    className="h-1.5 w-1.5 rounded-full bg-amber-500"
                  />
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

function SubAgentCard({ task }: { task: any }) {
  const statusConfig: Record<string, { color: string; icon: React.ReactNode; bg: string }> = {
    running: { color: "text-blue-400", icon: <Zap className="h-3 w-3" />, bg: "bg-blue-500/10 border-blue-500/20" },
    completed: { color: "text-green-400", icon: <CheckCircle2 className="h-3 w-3" />, bg: "bg-green-500/10 border-green-500/20" },
    failed: { color: "text-red-400", icon: <XCircle className="h-3 w-3" />, bg: "bg-red-500/10 border-red-500/20" },
    pending: { color: "text-amber-400", icon: <Clock className="h-3 w-3" />, bg: "bg-amber-500/10 border-amber-500/20" },
  };

  const config = statusConfig[task.status] || statusConfig.pending;
  const duration = task.completed_at && task.created_at
    ? new Date(task.completed_at).getTime() - new Date(task.created_at).getTime()
    : null;

  const resultPreview = task.result
    ? typeof task.result === "string"
      ? task.result.slice(0, 120)
      : JSON.stringify(task.result).slice(0, 120)
    : null;

  return (
    <div className={cn("rounded-xl border p-4 transition-colors", config.bg)}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <Badge variant="outline" className={cn("text-[10px] px-1.5 py-0 h-5 gap-1", config.color)}>
              {config.icon}
              {task.status}
            </Badge>
            {duration !== null && (
              <span className="text-[10px] text-muted-foreground tabular-nums">
                {duration < 1000 ? `${duration}ms` : `${(duration / 1000).toFixed(1)}s`}
              </span>
            )}
          </div>
          <p className="text-sm font-medium truncate">{task.task_description}</p>
          {task.tools_used && task.tools_used.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-2">
              {task.tools_used.map((tool: string, i: number) => (
                <Badge key={i} variant="secondary" className="text-[9px] px-1.5 py-0 h-4">
                  {tool}
                </Badge>
              ))}
            </div>
          )}
          {resultPreview && (
            <p className="text-xs text-muted-foreground mt-2 line-clamp-2">{resultPreview}</p>
          )}
        </div>
        <span className="text-[10px] text-muted-foreground whitespace-nowrap">
          {formatDistanceToNow(new Date(task.created_at), { addSuffix: true })}
        </span>
      </div>
    </div>
  );
}

function GlassStatCard({ icon, label, value, colorClass }: { icon: React.ReactNode; label: string; value: string | number; colorClass: string }) {
  return (
    <div className={cn("rounded-xl border p-4", colorClass)}>
      <div className="flex items-center gap-2 mb-1">
        {icon}
        <span className="text-2xl font-bold">{value}</span>
      </div>
      <p className="text-[10px] text-muted-foreground">{label}</p>
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="text-center py-8 text-muted-foreground">
      <Network className="h-8 w-8 mx-auto mb-2 opacity-50" />
      <p className="text-sm">{message}</p>
      <p className="text-xs mt-1">Sub-agents spawned by BeeBot will appear here</p>
    </div>
  );
}
