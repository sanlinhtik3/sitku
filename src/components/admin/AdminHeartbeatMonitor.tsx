import { useState, useEffect, useMemo, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { format, formatDistanceToNow } from "date-fns";
import { AlertTriangle } from "lucide-react";
import { Link } from "react-router-dom";

interface HeartbeatRow {
  id: string;
  user_id: string;
  name: string;
  display_name: string;
  cron_expression: string;
  is_active: boolean;
  task_type: string;
  trigger_type: string;
  event_config: Record<string, any>;
  last_run_at: string | null;
  last_status: string | null;
  next_run_at: string | null;
  created_at: string;
  action_count: number;
  skip_count: number;
}

// --- Efficiency Card Component ---
export function EfficiencyCard({ heartbeat }: { heartbeat: HeartbeatRow }) {
  const total = heartbeat.action_count + heartbeat.skip_count;
  if (total === 0) return null;

  const efficiency = Math.round((heartbeat.action_count / total) * 100);
  const isLowEfficiency = efficiency < 40 && total >= 10;
  const progressColor =
    efficiency >= 80
      ? "from-emerald-500 to-emerald-400"
      : efficiency >= 50
        ? "from-amber-500 to-amber-400"
        : "from-red-500 to-red-400";

  const glowColor =
    efficiency >= 80
      ? "text-emerald-400 drop-shadow-[0_0_6px_rgba(52,211,153,0.5)]"
      : efficiency >= 50
        ? "text-amber-400 drop-shadow-[0_0_6px_rgba(251,191,36,0.5)]"
        : "text-red-400 drop-shadow-[0_0_6px_rgba(248,113,113,0.5)]";

  return (
    <div className="rounded-xl bg-card/20 backdrop-blur-xl border border-white/[0.06] p-4 space-y-3">
      <div className="flex items-center justify-between">
        <span className="font-medium text-sm truncate">{heartbeat.display_name}</span>
        <Badge
          variant="outline"
          className={cn(
            "text-[10px] shrink-0",
            heartbeat.trigger_type === "event" && "border-purple-500/30 text-purple-400",
            heartbeat.trigger_type === "hybrid" && "border-amber-500/30 text-amber-400",
            heartbeat.trigger_type === "cron" && "border-blue-500/30 text-blue-400"
          )}
        >
          {heartbeat.trigger_type}
        </Badge>
      </div>

      <div className="flex items-center gap-3">
        <Progress
          value={efficiency}
          className="flex-1 h-2.5"
          style={{
            ["--progress-gradient" as string]: `linear-gradient(to right, var(--tw-gradient-stops))`,
          }}
        />
        <span className={cn("text-lg font-bold tabular-nums", glowColor)}>
          {efficiency}%
        </span>
        {isLowEfficiency && (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <AlertTriangle className="h-4 w-4 text-amber-400 animate-pulse shrink-0" />
              </TooltipTrigger>
              <TooltipContent side="top" className="text-xs max-w-[200px]">
                Low efficiency detected. Consider refining the prompt or schedule.
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}
      </div>

      <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
        <span className="text-emerald-400 font-medium">{heartbeat.action_count}</span>
        <span>Actions</span>
        <span className="opacity-30">|</span>
        <span className="text-amber-400 font-medium">{heartbeat.skip_count}</span>
        <span>Skipped</span>
        <span className="opacity-30">|</span>
        <span className="font-medium">{total}</span>
        <span>Total</span>
      </div>

      {isLowEfficiency && (
        <div className="bg-amber-500/5 border border-amber-500/10 rounded-lg p-2 space-y-1">
          <p className="text-[11px] text-amber-400/80">
            ⚠️ Suggestion: Consider refining the prompt or schedule for better impact.
          </p>
          <Link to="/admin#feature-management" className="text-[11px] text-amber-400 underline hover:text-amber-300 transition-colors">
            Manage Features →
          </Link>
        </div>
      )}
    </div>
  );
}

export function AdminHeartbeatMonitor() {
  const lastToastedRef = useRef<string | null>(null);
  const [filter, setFilter] = useState<"all" | "active" | "inactive">("all");
  const [triggerFilter, setTriggerFilter] = useState<"all" | "cron" | "event" | "hybrid">("all");
  const [hiveActive, setHiveActive] = useState(false);

  const { data: heartbeats = [], refetch } = useQuery({
    queryKey: ["admin-heartbeats"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("agent_heartbeats")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []) as HeartbeatRow[];
    },
    refetchInterval: 10000,
  });

  // Realtime subscription for live updates
  useEffect(() => {
    const channel = supabase
      .channel("heartbeat-monitor")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "agent_heartbeats" },
        (payload) => {
          refetch();
          if (payload.eventType === "UPDATE") {
            const newRow = payload.new as HeartbeatRow;
            if (newRow.last_status === "running" && lastToastedRef.current !== newRow.id) {
              lastToastedRef.current = newRow.id;
              toast.info(`Heartbeat: ${newRow.display_name} is starting...`, {
                icon: "🐝",
                duration: 3000,
              });
              setTimeout(() => { lastToastedRef.current = null; }, 5000);
            }
          }
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [refetch]);

  // Detect if any heartbeat is currently running
  useEffect(() => {
    const now = Date.now();
    const isRunning = heartbeats.some((h) => {
      if (h.last_status === "running") return true;
      if (h.last_run_at) {
        const diff = now - new Date(h.last_run_at).getTime();
        return diff < 60_000;
      }
      return false;
    });
    setHiveActive(isRunning);
  }, [heartbeats]);

  const filtered = useMemo(() => {
    return heartbeats.filter((h) => {
      if (filter === "active" && !h.is_active) return false;
      if (filter === "inactive" && h.is_active) return false;
      if (triggerFilter !== "all" && h.trigger_type !== triggerFilter) return false;
      return true;
    });
  }, [heartbeats, filter, triggerFilter]);

  const stats = useMemo(() => {
    const withRuns = heartbeats.filter((h) => h.action_count + h.skip_count > 0);
    const hiveEfficiency = withRuns.length > 0
      ? Math.round(withRuns.reduce((sum, h) => sum + (h.action_count / (h.action_count + h.skip_count)) * 100, 0) / withRuns.length)
      : null;

    return {
      total: heartbeats.length,
      active: heartbeats.filter((h) => h.is_active).length,
      lastExecution: heartbeats
        .filter((h) => h.last_run_at)
        .sort((a, b) => new Date(b.last_run_at!).getTime() - new Date(a.last_run_at!).getTime())[0]?.last_run_at,
      hiveEfficiency,
    };
  }, [heartbeats]);

  const heartbeatsWithRuns = useMemo(
    () => heartbeats.filter((h) => h.action_count + h.skip_count > 0),
    [heartbeats]
  );

  const statusColor = (status: string | null) => {
    switch (status) {
      case "running": return "text-amber-400";
      case "success": return "text-emerald-400";
      case "skipped": return "text-muted-foreground";
      case "failed": return "text-red-400";
      default: return "text-muted-foreground";
    }
  };

  return (
    <div className="space-y-6">
      {/* Header with Glowing Bee */}
      <div className="flex items-center gap-4">
        <div className="relative">
          <span
            className={cn(
              "text-4xl inline-block transition-all duration-300",
              hiveActive ? "animate-hive-pulse" : "opacity-50 grayscale"
            )}
            style={hiveActive ? {
              filter: "drop-shadow(0 0 8px rgba(251, 191, 36, 0.6)) drop-shadow(0 0 20px rgba(251, 191, 36, 0.3))",
            } : undefined}
          >
            🐝
          </span>
          {hiveActive && (
            <span className="absolute -top-1 -right-1 h-3 w-3 rounded-full bg-amber-400 animate-ping" />
          )}
        </div>
        <div>
          <h2 className="text-xl font-bold">Heartbeat Monitor</h2>
          <p className="text-sm text-muted-foreground">
            {hiveActive ? "🟢 Hive is active — heartbeats executing" : "⚪ Hive idle"}
          </p>
        </div>
      </div>

      {/* Stats Bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="rounded-xl bg-card/30 backdrop-blur-xl border border-white/[0.06] p-4 text-center">
          <p className="text-2xl font-bold">{stats.total}</p>
          <p className="text-xs text-muted-foreground">Total</p>
        </div>
        <div className="rounded-xl bg-card/30 backdrop-blur-xl border border-white/[0.06] p-4 text-center">
          <p className="text-2xl font-bold text-emerald-400">{stats.active}</p>
          <p className="text-xs text-muted-foreground">Active</p>
        </div>
        <div className="rounded-xl bg-card/30 backdrop-blur-xl border border-white/[0.06] p-4 text-center">
          <p className="text-sm font-medium">
            {stats.lastExecution
              ? formatDistanceToNow(new Date(stats.lastExecution), { addSuffix: true })
              : "Never"}
          </p>
          <p className="text-xs text-muted-foreground">Last Execution</p>
        </div>
        <div className="rounded-xl bg-card/30 backdrop-blur-xl border border-white/[0.06] p-4 text-center">
          <p className={cn(
            "text-2xl font-bold",
            stats.hiveEfficiency !== null
              ? stats.hiveEfficiency >= 80 ? "text-emerald-400" : stats.hiveEfficiency >= 50 ? "text-amber-400" : "text-red-400"
              : "text-muted-foreground"
          )}>
            {stats.hiveEfficiency !== null ? `${stats.hiveEfficiency}%` : "—"}
          </p>
          <p className="text-xs text-muted-foreground">Hive Efficiency</p>
        </div>
      </div>

      {/* Efficiency Cards */}
      {heartbeatsWithRuns.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-muted-foreground mb-3">Efficiency Breakdown</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {heartbeatsWithRuns.map((h) => (
              <EfficiencyCard key={h.id} heartbeat={h} />
            ))}
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        {(["all", "active", "inactive"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={cn(
              "px-3 py-1.5 rounded-full text-xs font-medium transition-colors border",
              filter === f
                ? "bg-primary/20 text-primary border-primary/30"
                : "bg-card/20 text-muted-foreground border-white/[0.06] hover:bg-card/40"
            )}
          >
            {f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}
        <span className="w-px bg-border/30 mx-1" />
        {(["all", "cron", "event", "hybrid"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setTriggerFilter(f)}
            className={cn(
              "px-3 py-1.5 rounded-full text-xs font-medium transition-colors border",
              triggerFilter === f
                ? "bg-amber-500/20 text-amber-400 border-amber-500/30"
                : "bg-card/20 text-muted-foreground border-white/[0.06] hover:bg-card/40"
            )}
          >
            {f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}
      </div>

      {/* Heartbeats Table */}
      <div className="rounded-xl bg-card/20 backdrop-blur-xl border border-white/[0.06] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/[0.06] text-muted-foreground text-xs">
                <th className="text-left p-3">Heartbeat</th>
                <th className="text-left p-3">Trigger</th>
                <th className="text-left p-3">Schedule</th>
                <th className="text-left p-3">Status</th>
                <th className="text-left p-3">Last Run</th>
                <th className="text-left p-3">Next Run</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((h) => (
                <tr key={h.id} className="border-b border-white/[0.04] hover:bg-card/30 transition-colors">
                  <td className="p-3">
                    <div className="flex items-center gap-2">
                      <span className={cn("h-2 w-2 rounded-full", h.is_active ? "bg-emerald-400" : "bg-muted-foreground/30")} />
                      <span className="font-medium">{h.display_name}</span>
                    </div>
                    <p className="text-xs text-muted-foreground ml-4">{h.user_id.slice(0, 8)}...</p>
                  </td>
                  <td className="p-3">
                    <Badge variant="outline" className={cn(
                      "text-[10px]",
                      h.trigger_type === "event" && "border-purple-500/30 text-purple-400",
                      h.trigger_type === "hybrid" && "border-amber-500/30 text-amber-400",
                      h.trigger_type === "cron" && "border-blue-500/30 text-blue-400",
                    )}>
                      {h.trigger_type}
                    </Badge>
                  </td>
                  <td className="p-3 text-xs font-mono text-muted-foreground">{h.cron_expression}</td>
                  <td className="p-3">
                    <span className={cn("text-xs font-medium", statusColor(h.last_status))}>
                      {h.last_status || "pending"}
                    </span>
                  </td>
                  <td className="p-3 text-xs text-muted-foreground">
                    {h.last_run_at
                      ? formatDistanceToNow(new Date(h.last_run_at), { addSuffix: true })
                      : "—"}
                  </td>
                  <td className="p-3 text-xs text-muted-foreground">
                    {h.next_run_at && h.trigger_type !== "event"
                      ? format(new Date(h.next_run_at), "MMM d, HH:mm")
                      : h.trigger_type === "event" ? "Event-driven" : "—"}
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={6} className="text-center p-8 text-muted-foreground">No heartbeats found</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
