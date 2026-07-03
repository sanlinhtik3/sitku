import { useRef, useEffect } from "react";
import { X, Zap, Timer, Cpu, Activity, Layers, Thermometer, Gauge, Monitor, Smartphone, Wifi, WifiOff, Signal } from "lucide-react";
import { cn } from "@/lib/utils";
import { Progress } from "@/components/ui/progress";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import type { CompletedToolStep, ToolCallState, TelemetryData } from "@/hooks/agent-chat/types";

interface ResourceTelemetryPanelProps {
  isOpen: boolean;
  onClose: () => void;
  isStreaming: boolean;
  currentStep?: number;
  totalSteps?: number;
  completedToolSteps: CompletedToolStep[];
  toolCalls: ToolCallState[];
  telemetry: TelemetryData;
  
}

import { formatTokens } from "./format-utils";

export function ResourceTelemetryPanel({
  isOpen, onClose, isStreaming, currentStep, totalSteps,
  completedToolSteps, toolCalls, telemetry,
}: ResourceTelemetryPanelProps) {
  const timerRef = useRef<HTMLSpanElement>(null);
  const liveOnline = useOnlineStatus();

  useEffect(() => {
    if (!isOpen || !isStreaming || !telemetry.streamStartTime) return;
    const interval = setInterval(() => {
      if (timerRef.current) {
        const elapsed = ((Date.now() - (telemetry.streamStartTime || Date.now())) / 1000).toFixed(0);
        timerRef.current.textContent = `${elapsed}s`;
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [isOpen, isStreaming, telemetry.streamStartTime]);

  useEffect(() => {
    if (!isStreaming && telemetry.streamStartTime && timerRef.current) {
      const elapsed = ((Date.now() - telemetry.streamStartTime) / 1000).toFixed(1);
      timerRef.current.textContent = `${elapsed}s`;
    }
  }, [isStreaming, telemetry.streamStartTime]);

  if (!isOpen) return null;

  const hasStepInfo = currentStep !== undefined && totalSteps !== undefined;
  const activeTools = toolCalls.filter(t => t.status === "running");
  const latencyDisplay = telemetry.lastLatencyMs !== null ? `${telemetry.lastLatencyMs}ms` : "—";
  const tokensIn = telemetry.lastTokenUsage?.input ?? 0;
  const tokensOut = telemetry.lastTokenUsage?.output ?? 0;
  const totalIn = telemetry.totalTokens.input;
  const totalOut = telemetry.totalTokens.output;

  const connType = telemetry.connectionType || "unknown";
  const isSlow = connType === "2g" || connType === "slow-2g";

  const getHardwareImpact = () => {
    if (isSlow && isStreaming) {
      return { label: "HIGH", color: "text-red-400", bg: "bg-red-400/10 border-red-400/20" };
    }
    if (!isStreaming && activeTools.length === 0) {
      return { label: "LOW", color: "text-emerald-400", bg: "bg-emerald-400/10 border-emerald-400/20" };
    }
    if (isStreaming && activeTools.length > 1) {
      return { label: "HIGH", color: "text-red-400", bg: "bg-red-400/10 border-red-400/20" };
    }
    if (isStreaming) {
      return { label: "MED", color: "text-amber-400", bg: "bg-amber-400/10 border-amber-400/20" };
    }
    return { label: "LOW", color: "text-emerald-400", bg: "bg-emerald-400/10 border-emerald-400/20" };
  };

  const impact = getHardwareImpact();

  const getToolsPerMin = () => {
    if (!telemetry.streamStartTime || telemetry.toolExecutionCount === 0) return "—";
    const elapsedMin = (Date.now() - telemetry.streamStartTime) / 60000;
    if (elapsedMin < 0.01) return "—";
    return (telemetry.toolExecutionCount / elapsedMin).toFixed(1);
  };

  const platformStr = telemetry.platform || "unknown";
  const isMobile = /android|iphone|ipad|mobile/i.test(platformStr) || (telemetry.screenWidth ?? 1920) < 768;
  const PlatformIcon = isMobile ? Smartphone : Monitor;
  const resolution = telemetry.screenWidth && telemetry.screenHeight
    ? `${telemetry.screenWidth}×${telemetry.screenHeight}`
    : "—";

  const getConnBadge = () => {
    if (connType === "4g") return { label: "4G", color: "text-emerald-400 bg-emerald-400/10 border-emerald-400/20" };
    if (connType === "3g") return { label: "3G", color: "text-amber-400 bg-amber-400/10 border-amber-400/20" };
    if (connType === "2g" || connType === "slow-2g") return { label: connType.toUpperCase(), color: "text-red-400 bg-red-400/10 border-red-400/20" };
    return { label: connType, color: "text-muted-foreground bg-muted/20 border-border/30" };
  };
  const connBadge = getConnBadge();

  return (
    <div className="absolute top-12 right-2 z-20 w-72 rounded-xl border border-border/40 bg-card/80 backdrop-blur-xl shadow-2xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border/30 bg-muted/20">
        <div className="flex items-center gap-2">
          <Activity className="h-3.5 w-3.5 text-primary" />
          <span className="text-xs font-semibold tracking-wider text-foreground/80 uppercase">
            System Telemetry
          </span>
        </div>
        <button onClick={onClose} aria-label="Close telemetry" className="h-6 w-6 rounded-full flex items-center justify-center hover:bg-muted/50 transition-colors text-muted-foreground hover:text-foreground relative before:absolute before:-inset-2.5 before:content-[''] touch-manipulation">
          <X className="h-3 w-3" />
        </button>
      </div>

      {/* Metrics Grid */}
      <div className="p-3 space-y-3">
        {/* API Latency */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Zap className="h-3 w-3 text-amber-400" />
            <span>API Latency</span>
          </div>
          <span className={cn(
            "text-xs font-mono font-medium",
            telemetry.lastLatencyMs !== null && telemetry.lastLatencyMs < 500
              ? "text-emerald-400"
              : telemetry.lastLatencyMs !== null && telemetry.lastLatencyMs < 2000
              ? "text-amber-400"
              : "text-muted-foreground"
          )}>
            {latencyDisplay}
          </span>
        </div>

        {/* Stream Duration */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Timer className="h-3 w-3 text-blue-400" />
            <span>Stream Time</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span ref={timerRef} className="text-xs font-mono font-medium text-foreground/80">
              {telemetry.streamStartTime
                ? `${((Date.now() - telemetry.streamStartTime) / 1000).toFixed(0)}s`
                : "—"}
            </span>
            {isStreaming && (
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
            )}
          </div>
        </div>

        {/* Token Usage (last message) */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Cpu className="h-3 w-3 text-violet-400" />
            <span>Tokens (Last)</span>
          </div>
          <span className="text-xs font-mono text-foreground/80">
            {tokensIn > 0 || tokensOut > 0
              ? `${formatTokens(tokensIn)} / ${formatTokens(tokensOut)}`
              : "—"
            }
          </span>
        </div>

        {/* Total Token Throughput */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Gauge className="h-3 w-3 text-cyan-400" />
            <span>Total Throughput</span>
          </div>
          <span className="text-xs font-mono text-foreground/80">
            {totalIn > 0 || totalOut > 0
              ? `${formatTokens(totalIn + totalOut)}`
              : "—"
            }
          </span>
        </div>

        {/* Hardware Impact */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Thermometer className="h-3 w-3 text-orange-400" />
            <span>HW Impact</span>
          </div>
          <span className={cn(
            "text-[10px] px-2 py-0.5 rounded-full font-bold border",
            impact.bg, impact.color
          )}>
            {impact.label}
          </span>
        </div>

        {/* Tools/Min Rate + Error Rate */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Layers className="h-3 w-3 text-primary" />
            <span>Tools/Min</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-mono text-foreground/80">
              {getToolsPerMin()}
            </span>
            {completedToolSteps.length > 0 && (() => {
              const errors = completedToolSteps.filter(s => s.status === 'error').length;
              const rate = Math.round((errors / completedToolSteps.length) * 100);
              if (rate === 0) return null;
              return (
                <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-red-400/10 text-red-400 border border-red-400/20 font-mono font-bold">
                  {rate}% err
                </span>
              );
            })()}
          </div>
        </div>

        {/* Step Progress */}
        {hasStepInfo && (
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Layers className="h-3 w-3 text-primary" />
                <span>Step</span>
              </div>
              <span className="text-xs font-mono text-foreground/80">
                {currentStep}/{totalSteps}
              </span>
            </div>
            <Progress
              value={((currentStep ?? 0) / (totalSteps ?? 1)) * 100}
              className="h-1 bg-muted/20"
            />
          </div>
        )}

        {/* Active Tools */}
        {activeTools.length > 0 && (
          <div className="border-t border-border/20 pt-2 space-y-1">
            <span className="text-[10px] text-muted-foreground/60 uppercase tracking-wider">Active Tools</span>
            {activeTools.map((tool, idx) => (
              <div key={idx} className="flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
                <span className="text-[11px] font-mono text-foreground/70">{tool.name}</span>
              </div>
            ))}
          </div>
        )}

        {/* Completed Tools Count */}
        {completedToolSteps.length > 0 && activeTools.length === 0 && (
          <div className="text-[10px] text-muted-foreground/50 text-center pt-1">
            {completedToolSteps.length} tool{completedToolSteps.length > 1 ? "s" : ""} executed
          </div>
        )}

        {/* ═══ DEVICE TELEMETRY ═══ */}
        <div className="border-t border-border/20 pt-2.5 space-y-2.5">
          <span className="text-[10px] text-muted-foreground/60 uppercase tracking-wider font-semibold">
            Device Telemetry
          </span>

          {/* Platform */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <PlatformIcon className="h-3 w-3 text-sky-400" />
              <span>Platform</span>
            </div>
            <span className="text-xs font-mono text-foreground/80 truncate max-w-[120px]">
              {platformStr}
            </span>
          </div>

          {/* Screen Resolution */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Monitor className="h-3 w-3 text-indigo-400" />
              <span>Screen</span>
            </div>
            <span className="text-xs font-mono text-foreground/80">
              {resolution}
            </span>
          </div>

          {/* Online Status (live) */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              {liveOnline ? <Wifi className="h-3 w-3 text-emerald-400" /> : <WifiOff className="h-3 w-3 text-red-400" />}
              <span>Status</span>
            </div>
            <span className={cn(
              "text-[10px] px-2 py-0.5 rounded-full font-bold border",
              liveOnline
                ? "text-emerald-400 bg-emerald-400/10 border-emerald-400/20"
                : "text-red-400 bg-red-400/10 border-red-400/20"
            )}>
              {liveOnline ? "ONLINE" : "OFFLINE"}
            </span>
          </div>

          {/* Connection Type */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Signal className="h-3 w-3 text-purple-400" />
              <span>Connection</span>
            </div>
            <span className={cn(
              "text-[10px] px-2 py-0.5 rounded-full font-bold border",
              connBadge.color
            )}>
              {connBadge.label}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
