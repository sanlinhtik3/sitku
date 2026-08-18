import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, ExternalLink, Loader2, RefreshCw, Unplug } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { NotionMcpConnectionState } from "@/runtime/LocalRuntimeApi";

const EMPTY: NotionMcpConnectionState = {
  state: "not_connected",
  connected: false,
  workspaceName: null,
  grantedScope: null,
  lastSuccessfulCall: null,
  error: null,
  desktopOnly: true,
};

export function NotionMcpControl() {
  const desktop = typeof window !== "undefined" ? window.beebotDesktop : undefined;
  const [status, setStatus] = useState<NotionMcpConnectionState>(EMPTY);
  const [busy, setBusy] = useState(false);
  const isDesktop = Boolean(desktop?.notionMcpStatus);

  const refresh = useCallback(async () => {
    if (!desktop?.notionMcpStatus) return;
    try { setStatus(await desktop.notionMcpStatus()); } catch { /* keep last trustworthy state */ }
  }, [desktop]);

  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => {
    if (!isDesktop) return;
    const timer = window.setInterval(() => { void refresh(); }, busy ? 1_000 : 5_000);
    return () => window.clearInterval(timer);
  }, [busy, isDesktop, refresh]);

  const connect = async () => {
    if (!desktop?.notionMcpConnect) return;
    setBusy(true);
    setStatus((current) => ({ ...current, state: "authorizing", error: null }));
    try { setStatus(await desktop.notionMcpConnect()); }
    catch (error) {
      setStatus((current) => ({
        ...current,
        state: "error",
        connected: false,
        error: { code: "NOTION_MCP_CONNECT_FAILED", message: error instanceof Error ? error.message : String(error) },
      }));
    } finally { setBusy(false); }
  };

  const disconnect = async () => {
    if (!desktop?.notionMcpDisconnect) return;
    setBusy(true);
    try { setStatus(await desktop.notionMcpDisconnect()); }
    finally { setBusy(false); }
  };

  const label = status.state === "authorizing" ? "Authorizing"
    : status.state === "refreshing" ? "Refreshing"
      : status.state === "permission_required" ? "Permission required"
        : status.state === "error" ? "Error"
          : status.connected ? "Connected" : "Not connected";

  return (
    <div className="border-t border-[var(--bb-bg-3)] pt-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2 font-medium text-[var(--bb-text-1)]">
            Notion MCP
            <span className="rounded bg-[var(--bb-bg-4)] px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-[var(--bb-text-3)]">Official</span>
          </div>
          <div className="mt-1 text-sm text-[var(--bb-text-3)]">
            E.V can read Notion automatically. Every create or update shows an approval preview first.
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span className="inline-flex items-center gap-1.5 text-xs text-[var(--bb-text-3)]">
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : status.connected ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" /> : <Unplug className="h-3.5 w-3.5" />}
            {label}
          </span>
          {isDesktop && (status.connected
            ? <Button size="sm" variant="secondary" disabled={busy} onClick={() => { void disconnect(); }}>Disconnect</Button>
            : <Button size="sm" disabled={busy} onClick={() => { void connect(); }}><ExternalLink className="mr-1.5 h-3.5 w-3.5" />Connect</Button>)}
        </div>
      </div>

      {!isDesktop ? (
        <div className="mt-3 rounded-lg border border-[var(--bb-border)] bg-[var(--bb-bg-3)] px-3 py-2 text-xs text-[var(--bb-text-3)]">
          Connect from Sitku Desktop. Browser and mobile never store Notion credentials.
        </div>
      ) : status.connected ? (
        <div className="mt-3 grid gap-2 rounded-lg border border-[var(--bb-border)] bg-[var(--bb-bg-3)] p-3 text-xs sm:grid-cols-3">
          <Meta label="Workspace" value={status.workspaceName || "Connected workspace"} />
          <Meta label="Scope" value={status.grantedScope || "Granted by Notion"} />
          <Meta label="Last call" value={formatLastCall(status.lastSuccessfulCall)} />
        </div>
      ) : status.error ? (
        <div className="mt-3 flex items-start justify-between gap-3 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-300">
          <span>{status.error.message}</span>
          <button type="button" className="shrink-0" aria-label="Refresh Notion MCP status" onClick={() => { void refresh(); }}><RefreshCw className="h-3.5 w-3.5" /></button>
        </div>
      ) : null}
    </div>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return <div className="min-w-0"><div className="text-[var(--bb-text-4)]">{label}</div><div className="truncate font-medium text-[var(--bb-text-2)]">{value}</div></div>;
}

function formatLastCall(value: string | null) {
  if (!value) return "No calls yet";
  const time = new Date(value);
  return Number.isNaN(time.getTime()) ? "Unknown" : time.toLocaleString();
}
