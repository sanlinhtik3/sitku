import { memo, useState } from 'react';
import { cn } from '@/lib/utils';
import type { SystemHealthState } from '@/hooks/useSystemHealth';

interface SystemHealthDotProps {
  health: SystemHealthState;
  className?: string;
}

export const SystemHealthDot = memo(function SystemHealthDot({ health, className }: SystemHealthDotProps) {
  const [showTooltip, setShowTooltip] = useState(false);

  return (
    <div
      className={cn("relative flex items-center", className)}
      onMouseEnter={() => setShowTooltip(true)}
      onMouseLeave={() => setShowTooltip(false)}
      onClick={() => setShowTooltip(prev => !prev)}
    >
      <div className="flex items-center gap-1.5 px-2 py-1 rounded-full cursor-default">
        <div
          className={cn(
            "h-2 w-2 rounded-full transition-colors duration-500",
            health.statusColor,
            health.status === 'degraded' && 'animate-pulse',
          )}
        />
        {health.status !== 'healthy' && (
          <span className="text-[10px] text-muted-foreground/70 hidden sm:inline">
            {health.statusLabel}
          </span>
        )}
      </div>

      {showTooltip && (
        <div className="absolute top-full right-0 mt-2 z-50 w-48 p-2.5 rounded-lg border border-border/40 bg-card/95 shadow-xl text-xs space-y-1.5">
          <div className="flex items-center gap-2">
            <div className={cn("h-2.5 w-2.5 rounded-full", health.statusColor)} />
            <span className="font-medium text-foreground/90">{health.statusLabel}</span>
          </div>
          <div className="space-y-1 text-muted-foreground">
            <div className="flex justify-between">
              <span>Network</span>
              <span className={health.isOnline ? 'text-emerald-400' : 'text-red-400'}>
                {health.isOnline ? 'Online' : 'Offline'}
              </span>
            </div>
            <div className="flex justify-between">
              <span>Realtime</span>
              <span className={health.isRealtimeConnected ? 'text-emerald-400' : 'text-amber-400'}>
                {health.isRealtimeConnected ? 'Connected' : 'Disconnected'}
              </span>
            </div>
            {health.lastLatencyMs !== null && (
              <div className="flex justify-between">
                <span>API Latency</span>
                <span className={cn(
                  'font-mono',
                  health.lastLatencyMs < 500 ? 'text-emerald-400' :
                  health.lastLatencyMs < 2000 ? 'text-amber-400' : 'text-red-400'
                )}>
                  {health.lastLatencyMs}ms
                </span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
});
