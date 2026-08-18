import React from "react";
import { cn } from "@/lib/utils";
import type { FuiPanelTone, FuiStatusTone } from "./theme";

export interface FuiPanelProps extends React.HTMLAttributes<HTMLDivElement> {
  tone?: FuiPanelTone;
}

export function FuiPanel({ tone = "secondary", className, ...props }: FuiPanelProps) {
  return <div data-fui-panel={tone} className={cn("fui-panel", className)} {...props} />;
}

export function FuiLabel({ className, ...props }: React.HTMLAttributes<HTMLSpanElement>) {
  return <span className={cn("fui-label", className)} {...props} />;
}

export function FuiMetric({ className, ...props }: React.HTMLAttributes<HTMLSpanElement>) {
  return <span className={cn("fui-metric tabular-nums", className)} {...props} />;
}

export interface FuiSectionHeaderProps {
  eyebrow?: React.ReactNode;
  title: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}

export function FuiSectionHeader({ eyebrow, title, description, action, className }: FuiSectionHeaderProps) {
  return (
    <header className={cn("fui-section-header", className)}>
      <div className="min-w-0">
        {eyebrow ? <FuiLabel className="block">{eyebrow}</FuiLabel> : null}
        <h3 className="fui-section-title">{title}</h3>
        {description ? <p className="fui-section-description">{description}</p> : null}
      </div>
      {action ? <div className="fui-section-action">{action}</div> : null}
    </header>
  );
}

export interface FuiBadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  tone?: FuiStatusTone;
}

export function FuiBadge({ tone = "info", className, children, ...props }: FuiBadgeProps) {
  return <span data-fui-badge={tone} className={cn("fui-badge", className)} {...props}>{children}</span>;
}

export interface FuiStatusProps {
  status?: FuiStatusTone;
  label: string;
  className?: string;
}

export function FuiStatus({ status = "info", label, className }: FuiStatusProps) {
  return (
    <span className={cn("fui-status", className)} data-status={status} role="status">
      <span className="fui-status-dot" aria-hidden="true" />
      <span>{label}</span>
    </span>
  );
}

export interface FuiProgressProps {
  value: number;
  label: string;
  valueLabel?: React.ReactNode;
  detail?: React.ReactNode;
  tone?: FuiStatusTone;
  className?: string;
}

export function FuiProgress({ value, label, valueLabel, detail, tone = "info", className }: FuiProgressProps) {
  const normalized = Math.max(0, Math.min(100, Number.isFinite(value) ? value : 0));
  return (
    <div className={cn("fui-progress", className)} data-status={tone}>
      <div className="fui-progress-meta">
        <span>{label}</span>
        <FuiMetric>{valueLabel ?? `${Math.round(normalized)}%`}</FuiMetric>
      </div>
      <div
        className="fui-progress-track"
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(normalized)}
      >
        <span className="fui-progress-value" style={{ width: `${normalized}%` }} />
      </div>
      {detail ? <div className="fui-progress-detail">{detail}</div> : null}
    </div>
  );
}

export interface FuiWidgetProps extends React.HTMLAttributes<HTMLElement> {
  eyebrow?: React.ReactNode;
  title: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
  tone?: FuiPanelTone;
  bodyClassName?: string;
}

/** A single information shell for CFO charts, progress views, and compact lists. */
export function FuiWidget({
  eyebrow,
  title,
  description,
  action,
  tone = "secondary",
  className,
  bodyClassName,
  children,
  ...props
}: FuiWidgetProps) {
  return (
    <section data-fui-panel={tone} className={cn("fui-panel fui-widget", className)} {...props}>
      <FuiSectionHeader eyebrow={eyebrow} title={title} description={description} action={action} />
      <div className={cn("fui-widget-body", bodyClassName)}>{children}</div>
    </section>
  );
}

export interface FuiChartLegendItem {
  label: string;
  color: string;
  dashed?: boolean;
}

export function FuiChartLegend({ items, className }: { items: FuiChartLegendItem[]; className?: string }) {
  return (
    <div className={cn("fui-chart-legend", className)} aria-label="Chart legend">
      {items.map((item) => (
        <span key={item.label}>
          <i style={{ backgroundColor: item.color }} data-dashed={item.dashed || undefined} />
          {item.label}
        </span>
      ))}
    </div>
  );
}

export interface FuiMetricTileProps extends FuiPanelProps {
  label: React.ReactNode;
  value: React.ReactNode;
  detail?: React.ReactNode;
  status?: FuiStatusTone;
  statusLabel?: string;
  icon?: React.ReactNode;
}

/** Compact, reusable one-metric widget for CFO, Consultant, and future rooms. */
export function FuiMetricTile({
  label,
  value,
  detail,
  status,
  statusLabel,
  icon,
  tone = "secondary",
  className,
  ...props
}: FuiMetricTileProps) {
  return (
    <FuiPanel tone={tone} className={cn("fui-metric-tile", className)} {...props}>
      <div className="fui-metric-tile-heading">
        <FuiLabel>{label}</FuiLabel>
        {icon ? <span className="fui-metric-tile-icon" aria-hidden="true">{icon}</span> : null}
      </div>
      <FuiMetric className="fui-metric-tile-value">{value}</FuiMetric>
      {detail ? <div className="fui-metric-tile-detail">{detail}</div> : null}
      {status && statusLabel ? <FuiStatus status={status} label={statusLabel} /> : null}
    </FuiPanel>
  );
}
