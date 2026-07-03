/**
 * useSystemHealth — Lightweight system health aggregator
 *
 * Composes existing signals (online status, Supabase realtime, API latency)
 * into a single health status. Zero new network calls or intervals.
 */

import { useMemo, useEffect, useState } from 'react';
import { useOnlineStatus } from './useOnlineStatus';
import type { SupabaseClient } from '@supabase/supabase-js';

export type HealthStatus = 'healthy' | 'degraded' | 'offline';

export interface SystemHealthState {
  status: HealthStatus;
  isOnline: boolean;
  isRealtimeConnected: boolean;
  lastLatencyMs: number | null;
  statusLabel: string;
  statusColor: string;
}

export function useSystemHealth(
  supabaseClient: SupabaseClient,
  lastLatencyMs?: number | null,
): SystemHealthState {
  const isOnline = useOnlineStatus();
  const [isRealtimeConnected, setIsRealtimeConnected] = useState(true);

  // Check Supabase realtime channel state — reads existing connections, no overhead
  useEffect(() => {
    const checkConnection = () => {
      try {
        const channels = supabaseClient.getChannels();
        const hasJoined = channels.some((ch: any) => ch.state === 'joined');
        setIsRealtimeConnected(channels.length === 0 ? isOnline : hasJoined);
      } catch {
        setIsRealtimeConnected(isOnline);
      }
    };

    checkConnection();

    // Re-check when online status changes (event-driven, not polling)
    if (!isOnline) {
      setIsRealtimeConnected(false);
    }
  }, [supabaseClient, isOnline]);

  const status: HealthStatus = useMemo(() => {
    if (!isOnline) return 'offline';
    if (!isRealtimeConnected) return 'degraded';
    if (lastLatencyMs && lastLatencyMs > 5000) return 'degraded';
    return 'healthy';
  }, [isOnline, isRealtimeConnected, lastLatencyMs]);

  const statusLabel = useMemo(() => {
    switch (status) {
      case 'healthy': return 'Systems Operational';
      case 'degraded': return 'Connection Issues';
      case 'offline': return 'Offline';
    }
  }, [status]);

  const statusColor = useMemo(() => {
    switch (status) {
      case 'healthy': return 'bg-emerald-400';
      case 'degraded': return 'bg-amber-400';
      case 'offline': return 'bg-red-400';
    }
  }, [status]);

  return {
    status,
    isOnline,
    isRealtimeConnected,
    lastLatencyMs: lastLatencyMs ?? null,
    statusLabel,
    statusColor,
  };
}
