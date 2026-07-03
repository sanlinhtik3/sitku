import { CheckCircle2, Clock, AlertCircle } from "lucide-react";

interface EmbeddingHealthMonitorProps {
  stats: {
    synced: number;
    pending: number;
    failed: number;
  };
}

export const EmbeddingHealthMonitor = ({ stats }: EmbeddingHealthMonitorProps) => {
  const total = stats.synced + stats.pending + stats.failed;
  const healthPercent = total > 0 ? Math.round((stats.synced / total) * 100) : 100;

  return (
    <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-xl bg-card/30 backdrop-blur-xl border border-white/[0.06] text-[10px]">
      {/* Progress ring */}
      <div className="relative h-5 w-5">
        <svg className="h-5 w-5 -rotate-90" viewBox="0 0 20 20">
          <circle cx="10" cy="10" r="8" fill="none" stroke="hsl(var(--muted))" strokeWidth="2" />
          <circle
            cx="10" cy="10" r="8" fill="none"
            stroke={healthPercent === 100 ? "hsl(var(--success))" : healthPercent > 60 ? "hsl(40, 90%, 55%)" : "hsl(var(--destructive))"}
            strokeWidth="2"
            strokeDasharray={`${(healthPercent / 100) * 50.27} 50.27`}
            strokeLinecap="round"
          />
        </svg>
        <span className="absolute inset-0 flex items-center justify-center text-[7px] font-bold text-foreground/70">
          {healthPercent}
        </span>
      </div>

      {/* Counts */}
      <div className="flex items-center gap-1.5">
        <span className="flex items-center gap-0.5 text-emerald-400">
          <CheckCircle2 className="h-2.5 w-2.5" /> {stats.synced}
        </span>
        {stats.pending > 0 && (
          <span className="flex items-center gap-0.5 text-amber-400">
            <Clock className="h-2.5 w-2.5" /> {stats.pending}
          </span>
        )}
        {stats.failed > 0 && (
          <span className="flex items-center gap-0.5 text-destructive">
            <AlertCircle className="h-2.5 w-2.5" /> {stats.failed}
          </span>
        )}
      </div>
    </div>
  );
};
