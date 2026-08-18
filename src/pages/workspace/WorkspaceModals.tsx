/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { Suspense, useState, useEffect, useCallback } from "react";
import { lazyWithRetry } from "@/lib/lazyWithRetry";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { MicroErrorBoundary } from "@/components/MicroErrorBoundary";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import {
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandSeparator,
} from "@/components/ui/command";
import {
  Search,
  Link2,
  Command,
  Keyboard,
  KeyRound,
  ShieldCheck,
  X,
  AlertTriangle,
  Eye,
  EyeOff,
  Check,
  Plus,
  ArrowUp,
  ArrowDown,
  Type,
  FolderPlus,
  HardDrive,
  Bot,
  BookOpen,
  History,
  Settings,
  FileText,
  Waypoints,
  RotateCcw,
  ArrowLeft,
} from "lucide-react";
import { PenNewSquare as IconEdit, BookBookmark as IconBook2, Magnifer as IconSearch } from "@solar-icons/react";
import { toast } from "sonner";
import { useWorkspace } from "./WorkspaceContext";
import { buildWorkspaceHealthSnapshot, type WorkspaceHealthError } from "@/features/notes/health/workspaceHealth";
import { TavilyApiKeyControl } from "@/components/settings/TavilyApiKeyControl";
import { NotionMcpControl } from "@/components/settings/NotionMcpControl";

// lazyWithRetry (not plain lazy): these heavy panels open long after boot, so their chunk is often
// the first fetch after a desktop rebuild — a stale hash 404s here → self-heal by reloading once.
const GraphView = lazyWithRetry(() => import("@/components/editor/GraphView").then((m) => ({ default: m.GraphView })));
const AgentConsultantPanel = lazyWithRetry(() => import("@/components/agent-chat/consultant/AgentConsultantPanel").then((m) => ({ default: m.AgentConsultantPanel })));
const FlowStateDialog = lazyWithRetry(() => import("@/components/dashboard/FlowStateDialog").then((m) => ({ default: m.FlowStateDialog })));
const ThemeStorePanel = lazyWithRetry(() => import("@/components/settings/ThemeStorePanel").then((m) => ({ default: m.ThemeStorePanel })));
const ThemeEditorDialog = lazyWithRetry(() => import("@/components/settings/ThemeEditorDialog").then((m) => ({ default: m.ThemeEditorDialog })));
const VersionCheck = lazyWithRetry(() => import("@/components/settings/VersionCheck").then((m) => ({ default: m.VersionCheck })));

interface McpClient { id: string; name: string; token: string; created_at: string; last_used_at: string | null; requests: number }
interface McpPendingAction { id: string; client_name: string; tool: string; preview: string; created_at: string; expires_at: string }
interface McpState { running: boolean; enabled: boolean; url: string | null; port: number; clients: McpClient[]; pending_actions?: McpPendingAction[] }

function relTime(iso: string | null): string {
  if (!iso) return "never used";
  const d = Date.now() - new Date(iso).getTime();
  if (d < 60_000) return "just now";
  if (d < 3_600_000) return `${Math.floor(d / 60_000)}m ago`;
  if (d < 86_400_000) return `${Math.floor(d / 3_600_000)}h ago`;
  return `${Math.floor(d / 86_400_000)}d ago`;
}

// Desktop-only control plane for the app-hosted MCP endpoint (electron/mcp-manager.mjs): on/off,
// per-client access tokens (one per agentic AI), live activity, and revoke. Renders nothing in the
// browser (no window.beebotDesktop bridge).
function McpServerCard() {
  const desktop = typeof window !== "undefined" ? (window as any).beebotDesktop : null;
  const [st, setSt] = useState<McpState | null>(null);
  const [busy, setBusy] = useState(false);
  const [newName, setNewName] = useState("");
  const [openId, setOpenId] = useState("");   // which client's connect snippet is expanded
  const [copied, setCopied] = useState("");

  const refresh = useCallback(() => { desktop?.mcpStatus?.().then(setSt).catch(() => { /* keep last */ }); }, [desktop]);
  useEffect(() => { refresh(); }, [refresh]);
  // Poll activity while the settings panel is open so "last used / N requests" stays live.
  useEffect(() => { if (!desktop?.mcpStatus) return; const t = setInterval(refresh, 5000); return () => clearInterval(t); }, [desktop, refresh]);
  if (!desktop?.mcpStatus) return null;

  const run = async (fn: () => Promise<McpState>) => { setBusy(true); try { setSt(await fn()); } finally { setBusy(false); } };
  const toggle = (on: boolean) => run(() => desktop.mcpSetEnabled(on));
  const addClient = () => run(async () => {
    const s: McpState = await desktop.mcpAddClient(newName.trim() || "New client");
    setNewName(""); setOpenId(s.clients[s.clients.length - 1]?.id || ""); return s;
  });
  const revoke = (id: string) => run(() => desktop.mcpRevokeClient(id));
  const approve = (id: string) => run(() => desktop.mcpApproveAction(id));
  const reject = (id: string) => run(() => desktop.mcpRejectAction(id));
  const copy = (text: string, key: string) => {
    try { navigator.clipboard?.writeText(text); } catch { /* still visible on screen */ }
    setCopied(key); setTimeout(() => setCopied(""), 1500);
  };

  const url = st?.url || "";
  const claudeCmd = (t: string) => `claude mcp add --transport http sitku-notes ${url} --header "Authorization: Bearer ${t}"`;
  const codexToml = (t: string) => `# ~/.codex/config.toml\n[mcp_servers.sitku-notes]\nurl = "${url}"\nbearer_token_env_var = "SITKU_MCP_TOKEN"\n\n# then in your shell:  export SITKU_MCP_TOKEN=${t}`;

  return (
    <div className="flex flex-col gap-3 border-t border-[var(--bb-bg-3)] pt-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <div className="font-medium text-[var(--bb-text-1)]">
            MCP server <span className="ml-1 rounded bg-[var(--bb-bg-4)] px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-[var(--bb-text-3)]">Agentic AI</span>
          </div>
          <div className="text-sm text-[var(--bb-text-3)]">Let Claude Code, Codex, Cline &amp; Cursor use notes, Personal CFO, Consultant &amp; Team data over localhost.</div>
        </div>
        <Switch checked={!!st?.enabled} disabled={busy || !st} onCheckedChange={toggle} />
      </div>

      {st?.enabled && (
        <div className="flex flex-col gap-3 rounded-2xl border border-[var(--bb-border)] bg-[var(--bb-bg-2)] p-4">
          <div className="flex items-center justify-between gap-2">
            <span className={cn("text-xs font-medium", st.running ? "text-emerald-400" : "text-amber-400")}>
              {st.running ? "● Running" : "○ Starting…"}
            </span>
            {url && (
              <button type="button" onClick={() => copy(url, "url")} title="Copy endpoint URL"
                className="truncate font-mono text-[11px] text-[var(--bb-text-3)] hover:text-[var(--bb-text-1)] transition-colors">
                {copied === "url" ? "Copied ✓" : url}
              </button>
            )}
          </div>

          {(st.pending_actions?.length ?? 0) > 0 && (
            <div className="flex flex-col gap-2 rounded-xl border border-amber-400/25 bg-amber-400/[0.06] p-3">
              <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-amber-300">Pending approval</div>
              {st.pending_actions!.map((action) => (
                <div key={action.id} className="rounded-lg border border-[var(--bb-border)] bg-[var(--bb-bg-3)]/60 p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-xs font-semibold text-[var(--bb-text-1)]">{action.tool}</div>
                      <div className="mt-0.5 text-[10px] text-[var(--bb-text-3)]">{action.client_name} · {relTime(action.created_at)}</div>
                      <div className="mt-2 whitespace-pre-wrap break-words text-[11px] leading-5 text-[var(--bb-text-2)]">{action.preview}</div>
                    </div>
                    <div className="flex shrink-0 items-center gap-1.5">
                      <button type="button" disabled={busy} onClick={() => reject(action.id)} className="rounded-lg px-2.5 py-1 text-[11px] font-medium text-red-400 hover:bg-red-500/10">Reject</button>
                      <button type="button" disabled={busy} onClick={() => approve(action.id)} className="rounded-lg bg-amber-300 px-2.5 py-1 text-[11px] font-semibold text-black hover:bg-amber-200">Approve</button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="text-[10px] uppercase tracking-[0.16em] text-[var(--bb-text-3)] font-medium">Authorized clients</div>

          <div className="flex flex-col gap-1.5">
            {(st.clients ?? []).map((c) => (
              <div key={c.id} className="rounded-xl border border-[var(--bb-border)] bg-[var(--bb-bg-3)]/40">
                <div className="flex items-center justify-between gap-2 px-3 py-2">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium text-[var(--bb-text-1)]">{c.name}</div>
                    <div className="text-[11px] text-[var(--bb-text-3)]">{relTime(c.last_used_at)} · {c.requests} req</div>
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    <button type="button" onClick={() => setOpenId(openId === c.id ? "" : c.id)}
                      className="rounded-lg border border-[var(--bb-border)] bg-[var(--bb-bg-4)] px-2.5 py-1 text-[11px] font-medium text-[var(--bb-text-1)] hover:bg-[var(--bb-bg-3)] transition-colors">
                      {openId === c.id ? "Hide" : "Connect"}
                    </button>
                    <button type="button" onClick={() => revoke(c.id)} disabled={busy}
                      className="rounded-lg px-2.5 py-1 text-[11px] font-medium text-red-400/80 hover:text-red-400 hover:bg-red-500/10 transition-colors">
                      Revoke
                    </button>
                  </div>
                </div>
                {openId === c.id && url && (
                  <div className="flex flex-col gap-2 border-t border-[var(--bb-border)] px-3 py-2.5">
                    <button type="button" onClick={() => copy(claudeCmd(c.token), `cc-${c.id}`)}
                      className="self-start rounded-lg border border-[var(--bb-border)] bg-[var(--bb-bg-4)] px-3 py-1.5 text-[11px] font-medium text-[var(--bb-text-1)] hover:bg-[var(--bb-bg-3)] transition-colors">
                      {copied === `cc-${c.id}` ? "Copied ✓" : "Copy Claude Code command"}
                    </button>
                    <button type="button" onClick={() => copy(codexToml(c.token), `cx-${c.id}`)}
                      className="self-start rounded-lg border border-[var(--bb-border)] bg-[var(--bb-bg-4)] px-3 py-1.5 text-[11px] font-medium text-[var(--bb-text-1)] hover:bg-[var(--bb-bg-3)] transition-colors">
                      {copied === `cx-${c.id}` ? "Copied ✓" : "Copy Codex config (~/.codex/config.toml)"}
                    </button>
                    <div className="break-all font-mono text-[10px] text-[var(--bb-text-3)]">token: {c.token}</div>
                  </div>
                )}
              </div>
            ))}
            {(st.clients?.length ?? 0) === 0 && (
              <div className="text-[11px] text-[var(--bb-text-3)]">No clients yet — add one to get an access token.</div>
            )}
          </div>

          <div className="flex items-center gap-2">
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") addClient(); }}
              placeholder="New client name (e.g. Codex CLI)"
              className="flex-1 rounded-lg border border-[var(--bb-border)] bg-[var(--bb-bg-4)] px-3 py-1.5 text-sm text-[var(--bb-text-1)] outline-none placeholder:text-[var(--bb-text-3)]"
            />
            <button type="button" onClick={addClient} disabled={busy}
              className="shrink-0 rounded-lg border border-[var(--bb-border)] bg-primary/15 px-3 py-1.5 text-sm font-medium text-primary hover:bg-primary/25 transition-colors disabled:opacity-50">
              Add client
            </button>
          </div>

          <div className="text-[11px] text-[var(--bb-text-3)]">
            Each client gets its own token — revoke one without touching the others. Config also in <span className="font-mono">~/.sitku/mcp.json</span>.
          </div>
        </div>
      )}
    </div>
  );
}

export function WorkspaceModals() {
  const {
    settingsOpen,
    setSettingsOpen,
    settingsSearch,
    setSettingsSearch,
    settingsPane,
    setSettingsPane,
    settingsItems,
    SETTINGS_GROUPS,
    SETTINGS_META,
    handleRevealVault,
    activeVault,
    handleOpenVault,
    setCreateVaultOpen,
    appearanceSettings,
    updateAppearanceSettings,
    resetAppearanceSettings,
    isThemeEditorOpen,
    setIsThemeEditorOpen,
    editingThemeId,
    setEditingThemeId,
    fontTarget,
    setFontTarget,
    fontInput,
    setFontInput,
    fontSearch,
    setFontSearch,
    reduceFx,
    setReduceFx,
    reduceEffects,
    skillSummary,
    groupedSkills,
    handleToggleSkill,
    promptDialog,
    resolvePrompt,
    promptValue,
    setPromptValue,
    confirmDialog,
    resolveConfirm,
    commandOpen,
    setCommandOpen,
    openNotePath,
    handleCreateNote,
    handleCreateFolder,
    handleRestoreVersion,
    isDesktopShell,
    search,
    jarvisOn,
    setJarvisOn,
    jarvisEnabled,
    jarvisWake,
    setJarvisWake,
    jarvisWakeWord,
    jarvisModels,
    jarvisBrainModel,
    setJarvisBrainModel,
    hasJarvisKey,
    setHasJarvisKey,
    jarvisKeyEditing,
    setJarvisKeyEditing,
    jarvisKeyReveal,
    setJarvisKeyReveal,
    geminiKey,
    jarvisKeyDraft,
    setJarvisKeyDraft,
    editorMode,
    setEditorMode,
    fontStack,
    firstAvailableFont,
    moveFontInTarget,
    removeFontFromTarget,
    fontsLoading,
    systemFonts,
    fontPermission,
    loadSystemFonts,
    addFontToTarget,
    fontSuggestions,
    applyFontToTarget,
    createVaultOpen,
    newVaultName,
    setNewVaultName,
    handleCreateVault,
    isVaultBusy,
    skillsOpen,
    setSkillsOpen,
    isSkillBusy,
    runCommand,
    activeNote,
    folderFromPath,
    isMobile,
    setMobileView,
    setAgentOpen,
    openHistory,
    openHealth,
    closeHealth,
    healthOpen,
    noteList,
    entryList,
    isLoading,
    isDirty,
    isSaving,
    needsReopenFolder,
    fsaSupported,
    workspaceErrors,
    recordWorkspaceError,
    titleFromPath,
    searchModalOpen,
    closeSearchModal,
    openSearchModal,
    query,
    setQuery,
    searchResults,
    graphOpen,
    closeGraphView,
    openGraphView,
    liveNotes,
    activePath,
    resolveWikilinkTarget,
    historyOpen,
    closeHistory,
    versionsLoading,
    versions,
    formatVersionTime,
    cfoOpen,
    userId,
    closeCfo,
    consultantOpen,
    closeConsultant,
    draggableRegion,
    interactiveRegion,
  } = useWorkspace();

  const settingsDialogRef = React.useRef<HTMLDivElement>(null);
  const [lastSearchRebuildAt, setLastSearchRebuildAt] = React.useState<number | null>(null);
  const [rebuildingSearch, setRebuildingSearch] = React.useState(false);

  React.useLayoutEffect(() => {
    if (!settingsOpen || !isMobile) return;

    const frame = window.requestAnimationFrame(() => {
      const viewport = settingsDialogRef.current?.querySelector<HTMLElement>(
        ".settings-scroll [data-radix-scroll-area-viewport]",
      );
      if (viewport) viewport.scrollLeft = 0;
    });

    return () => window.cancelAnimationFrame(frame);
  }, [isMobile, settingsOpen, settingsPane]);

  const emergencyRecoveryAvailable = typeof window !== "undefined" && Boolean(localStorage.getItem("beebot.emergency_recovery"));
  const health = buildWorkspaceHealthSnapshot({
    activeVault,
    noteCount: noteList.length,
    entryCount: entryList?.length || noteList.length,
    activeNoteTitle: activeNote ? (activeNote.title || titleFromPath(activeNote.path)) : null,
    isDirty,
    isSaving,
    isLoading,
    needsReopenFolder,
    fsaSupported,
    versionsCount: versions.length,
    emergencyRecoveryAvailable,
    lastSearchRebuildAt,
    recentErrors: workspaceErrors || [],
  });
  const runSearchRebuild = async () => {
    setRebuildingSearch(true);
    try {
      await search.rebuildNoteIndex();
      setLastSearchRebuildAt(Date.now());
      toast.success("Index rebuilt");
    } catch (error) {
      recordWorkspaceError?.("search", error);
      toast.error("Index rebuild failed");
    } finally {
      setRebuildingSearch(false);
    }
  };
  const formatHealthErrorTime = (at: number) => new Date(at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  const healthTone = (ok: boolean) => ok
    ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-200"
    : "border-amber-500/20 bg-amber-500/10 text-amber-200";

  return (
    <>
      <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
        <DialogContent
          ref={settingsDialogRef}
          hideCloseButton
          className="settings-dialog fui-settings w-screen max-w-[100vw] h-[100dvh] rounded-none p-0 sm:p-0 md:p-0 md:w-[min(72rem,92vw)] md:max-w-[min(72rem,92vw)] md:h-[min(84vh,860px)] md:rounded-[var(--bb-radius)] overflow-hidden border-[var(--bb-border)] bg-[var(--bb-bg-1)] text-[var(--bb-text-1)]"
          style={isMobile ? {
            inset: 0,
            left: 0,
            top: 0,
            width: "100dvw",
            maxWidth: "none",
            height: "100dvh",
            maxHeight: "none",
            transform: "none",
            translate: "none",
            boxShadow: "none",
          } : { boxShadow: "var(--bb-shadow)" }}
        >
          <div className="settings-shell h-full min-h-0 flex flex-col md:flex-row">
            <aside className="settings-nav w-full md:w-64 shrink-0 border-b md:border-b-0 md:border-r border-[var(--bb-border)] bg-[var(--bb-bg-1)] flex flex-col">
              {/* Desktop: search + grouped nav */}
              <div className="hidden md:flex md:flex-col md:flex-1 md:min-h-0 p-3">
                <div className="relative mb-3">
                  <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-[var(--bb-text-4)]" />
                  <Input
                    value={settingsSearch}
                    onChange={(event) => setSettingsSearch(event.target.value)}
                    placeholder="Search settings…"
                    className="h-9 pl-8 text-sm bg-[var(--bb-bg-2)] border-[var(--bb-border)]"
                  />
                </div>
                <ScrollArea className="flex-1 min-h-0 -mx-1 px-1">
                  <div className="space-y-5 pb-2">
                    {SETTINGS_GROUPS.map((group: any) => {
                      const items = settingsItems.filter(
                        (it: any) => group.ids.includes(it.id) && it.label.toLowerCase().includes(settingsSearch.trim().toLowerCase()),
                      );
                      if (!items.length) return null;
                      return (
                        <div key={group.label}>
                          <div className="px-2.5 mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-[var(--bb-text-4)]">{group.label}</div>
                          <div className="space-y-0.5">
                            {items.map((item: any) => {
                              const Icon = item.icon;
                              const active = settingsPane === item.id;
                              return (
                                <button
                                  key={item.id}
                                  onClick={() => setSettingsPane(item.id)}
                                  aria-current={active ? "page" : undefined}
                                  className={cn(
                                    "w-full h-9 rounded-lg px-2.5 flex items-center gap-2.5 text-sm text-left transition-colors",
                                    active ? "bg-[var(--bb-bg-3)] text-[var(--bb-text-1)] shadow-[inset_0_0_0_1px_rgba(255,255,255,0.05)]" : "text-[var(--bb-text-2)] hover:bg-[var(--bb-bg-2)] hover:text-[var(--bb-text-1)]",
                                  )}
                                >
                                  <Icon className={cn("h-4 w-4 shrink-0", active ? "text-[var(--beebot-accent)]" : "text-[var(--bb-text-4)]")} />
                                  <span className="truncate">{item.label}</span>
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </ScrollArea>
              </div>
              <div className="settings-mobile-header md:hidden">
                <div className="min-w-0">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--beebot-accent)]">Sitku</div>
                  <div className="truncate text-[22px] font-semibold tracking-[-0.025em] text-[var(--bb-text-1)]">Settings</div>
                </div>
                <button type="button" className="settings-mobile-close" onClick={() => setSettingsOpen(false)} aria-label="Close settings">
                  <X className="h-[18px] w-[18px]" />
                </button>
              </div>
              {/* Mobile: thumb-friendly, scroll-snapping pane strip */}
              <div className="settings-mobile-tabs md:hidden flex gap-1 overflow-x-auto px-3 pb-2">
                {settingsItems.map((item: any) => {
                  const Icon = item.icon;
                  const active = settingsPane === item.id;
                  return (
                    <button
                      key={item.id}
                      onClick={() => setSettingsPane(item.id)}
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "settings-mobile-tab shrink-0 h-10 rounded-full px-3.5 flex items-center gap-2 text-[13px] whitespace-nowrap transition-colors",
                        active ? "is-active bg-[var(--bb-bg-3)] text-[var(--bb-text-1)]" : "text-[var(--bb-text-2)] hover:bg-[var(--bb-bg-3)]",
                      )}
                    >
                      <Icon className="h-4 w-4 shrink-0" />
                      <span>{item.label}</span>
                    </button>
                  );
                })}
              </div>
            </aside>
            <section className="settings-body relative flex-1 min-w-0 min-h-0 flex flex-col bg-[var(--bb-bg-1)]">
              <Button
                variant="ghost"
                size="icon"
                className="settings-desktop-close absolute right-3 top-3 z-10 hidden h-8 w-8 rounded-lg text-[var(--bb-text-3)] hover:bg-[var(--bb-bg-3)] hover:text-[var(--bb-text-1)] md:inline-flex"
                onClick={() => setSettingsOpen(false)}
                aria-label="Close settings"
              >
                <X className="h-4 w-4" />
              </Button>
              <ScrollArea className="settings-scroll flex-1 min-h-0">
                <div className="settings-page mx-auto max-w-3xl px-4 md:px-10 pt-5 pb-[calc(7rem+env(safe-area-inset-bottom,0px))] md:py-10 space-y-6 md:space-y-10">
                  <div className="settings-heading">
                    <DialogTitle className="text-2xl font-semibold tracking-tight text-[var(--bb-text-1)]">{SETTINGS_META[settingsPane]?.title}</DialogTitle>
                    <p className="mt-1.5 text-sm text-[var(--bb-text-3)]">{SETTINGS_META[settingsPane]?.subtitle}</p>
                  </div>
                  {settingsPane === "general" && (
                    <>
                      <section className="settings-group rounded-2xl border border-[var(--bb-border)] bg-[var(--bb-bg-2)] p-4 md:p-6 space-y-4">
                        <div className="flex items-start justify-between gap-4 border-b border-[var(--bb-bg-3)] pb-4">
                          <div>
                            <div className="text-lg font-semibold text-[var(--bb-text-1)]">BeeBot Workspace</div>
                            <div className="mt-1 text-sm text-[var(--bb-text-3)]">Local-first Markdown knowledge workspace with BeeBot embedded.</div>
                            <div className="mt-1 text-xs text-[var(--beebot-accent)]">Runtime: local</div>
                          </div>
                          <Button className="bg-[var(--beebot-accent)] text-black hover:bg-[var(--beebot-accent)]/90" onClick={handleRevealVault}>
                            Open vault
                          </Button>
                        </div>
                        <div className="flex items-center justify-between gap-5 border-b border-[var(--bb-bg-3)] pb-4">
                          <div>
                            <div className="font-medium text-[var(--bb-text-1)]">Default vault</div>
                            <div className="text-sm text-[var(--bb-text-3)]">{activeVault?.path || "Browser local preview"}</div>
                          </div>
                          <Button variant="secondary" className="bg-[var(--bb-bg-4)] text-[var(--bb-text-1)] hover:bg-[var(--bb-border-strong)]" onClick={handleOpenVault}>Change</Button>
                        </div>
                        <div className="flex items-center justify-between gap-5">
                          <div>
                            <div className="font-medium text-[var(--bb-text-1)]">Startup diagnostics</div>
                            <div className="text-sm text-[var(--bb-text-3)]">Notify only if the local runtime takes longer than expected.</div>
                          </div>
                          <Switch checked={false} />
                        </div>
                        <div className="border-t border-[var(--bb-bg-3)] pt-4">
                          <Suspense fallback={null}>
                            <VersionCheck />
                          </Suspense>
                        </div>
                        <McpServerCard />
                        <div className="flex items-center justify-between gap-5 border-t border-[var(--bb-bg-3)] pt-4">
                          <div>
                            <div className="font-medium text-[var(--bb-text-1)]">E.V Voice Assistant <span className="ml-1 rounded bg-[var(--bb-bg-4)] px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-[var(--bb-text-3)]">Gemini Live</span></div>
                            <div className="text-sm text-[var(--bb-text-3)]">Native audio conversation and safe Sitku actions (⌘J).</div>
                          </div>
                          <Switch checked={jarvisOn} onCheckedChange={(checked) => { jarvisEnabled.set(checked); setJarvisOn(checked); }} />
                        </div>
                        {jarvisOn && (
                          <div className="settings-jarvis flex flex-col gap-3 rounded-2xl border border-[var(--bb-border)] bg-[var(--bb-bg-2)] p-4">
                            <div className="flex items-center justify-between gap-4">
                              <div>
                                <div className="text-sm font-medium text-[var(--bb-text-1)]">Wake word <span className="ml-1 rounded bg-[var(--bb-bg-4)] px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-[var(--bb-text-3)]">Hands-free</span></div>
                                <div className="text-xs text-[var(--bb-text-3)]">Say “E.V” to open the orb while it is closed. Wake listening stays optional.</div>
                              </div>
                              <Switch checked={jarvisWake} onCheckedChange={(checked) => { jarvisWakeWord.set(checked); setJarvisWake(checked); }} />
                            </div>
                            <div className="flex items-center justify-between gap-4 border-t border-[var(--bb-bg-3)] pt-3">
                              <div>
                                <div className="text-sm font-medium text-[var(--bb-text-1)]">Live voice profile <span className="text-[var(--bb-text-3)]">(speech → understanding → speech)</span></div>
                                <div className="text-xs text-[var(--bb-text-3)]">Adaptive Voice is recommended for human-like tone, rhythm, pace, and response timing.</div>
                              </div>
                              <select
                                value={jarvisBrainModel}
                                onChange={(e) => { jarvisModels.setBrain(e.target.value); setJarvisBrainModel(e.target.value); }}
                                className="rounded-lg border border-[var(--bb-border)] bg-[var(--bb-bg-4)] px-3 py-1.5 text-sm text-[var(--bb-text-1)] outline-none"
                              >
                                {jarvisModels.brainOptions.map((o: any) => <option key={o.id} value={o.id}>{o.label}</option>)}
                              </select>
                            </div>


                            <div className="border-t border-[var(--bb-bg-3)] pt-3">
                              <div className="flex items-center justify-between gap-4">
                                <div>
                                  <div className="flex items-center gap-1.5 text-sm font-medium text-[var(--bb-text-1)]">
                                    <KeyRound className="h-3.5 w-3.5 text-[var(--bb-text-3)]" />
                                    Gemini API key
                                  </div>
                                  <div className="text-xs text-[var(--bb-text-3)]">Powers speech understanding + voice. Stored locally on this device only.</div>
                                </div>
                                {hasJarvisKey && !jarvisKeyEditing && (
                                  <div className="flex items-center gap-1.5 rounded-lg border border-[var(--bb-border)] bg-[var(--bb-bg-4)] px-2.5 py-1.5">
                                    <ShieldCheck className="h-3.5 w-3.5 text-emerald-500" />
                                    <span className="text-xs text-[var(--bb-text-2)]">{isDesktopShell ? "OS secure storage" : "Stored on this device"}</span>
                                  </div>
                                )}
                              </div>

                              {!jarvisKeyEditing ? (
                                <div className="mt-2.5 flex items-center gap-2">
                                  <button
                                    type="button"
                                    onClick={() => { setJarvisKeyDraft(""); setJarvisKeyReveal(false); setJarvisKeyEditing(true); }}
                                    className="rounded-lg border border-[var(--bb-border)] bg-[var(--bb-bg-4)] px-3 py-1.5 text-xs font-medium text-[var(--bb-text-1)] hover:bg-[var(--bb-border)]"
                                  >
                                    {hasJarvisKey ? "Replace / Update" : "Add key"}
                                  </button>
                                  {hasJarvisKey && (
                                    <button
                                      type="button"
                                      onClick={() => { void geminiKey.set("").then(() => setHasJarvisKey(false)); setJarvisKeyDraft(""); setJarvisKeyReveal(false); }}
                                      className="rounded-lg px-3 py-1.5 text-xs font-medium text-red-500 hover:bg-red-500/10"
                                    >
                                      Remove
                                    </button>
                                  )}
                                </div>
                              ) : (
                                <div className="mt-2.5 flex flex-col gap-2">
                                  <div className="flex items-center gap-2">
                                    <input
                                      type={jarvisKeyReveal ? "text" : "password"}
                                      value={jarvisKeyDraft}
                                      onChange={(e) => setJarvisKeyDraft(e.target.value)}
                                      placeholder="AIza…  (Google AI Studio → Get API key)"
                                      autoFocus
                                      autoComplete="off"
                                      spellCheck={false}
                                      className="flex-1 rounded-lg border border-[var(--bb-border)] bg-[var(--bb-bg-4)] px-3 py-1.5 font-mono text-sm text-[var(--bb-text-1)] outline-none focus:border-[var(--bb-border-strong)]"
                                    />
                                    <button
                                      type="button"
                                      onClick={() => setJarvisKeyReveal((v: boolean) => !v)}
                                      className="rounded-lg border border-[var(--bb-border)] bg-[var(--bb-bg-4)] p-2 text-[var(--bb-text-3)] hover:text-[var(--bb-text-1)]"
                                      aria-label={jarvisKeyReveal ? "Hide" : "Show"}
                                    >
                                      {jarvisKeyReveal ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                    </button>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <button
                                      type="button"
                                      disabled={!jarvisKeyDraft.trim()}
                                      onClick={() => { void geminiKey.set(jarvisKeyDraft.trim()).then(() => setHasJarvisKey(true)); setJarvisKeyDraft(""); setJarvisKeyReveal(false); setJarvisKeyEditing(false); }}
                                      className="flex items-center gap-1.5 rounded-lg bg-[var(--bb-accent,#3b82f6)] px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-40"
                                    >
                                      <Check className="h-3.5 w-3.5" /> Save key
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => { setJarvisKeyDraft(""); setJarvisKeyReveal(false); setJarvisKeyEditing(false); }}
                                      className="rounded-lg px-3 py-1.5 text-xs font-medium text-[var(--bb-text-3)] hover:text-[var(--bb-text-1)]"
                                    >
                                      Cancel
                                    </button>
                                  </div>
                                  <p className="text-[11px] text-[var(--bb-text-4)]">
                                    {isDesktopShell
                                      ? "Encrypted by the operating system. The renderer cannot read it; only the local provider bridge can use it."
                                      : "Stored only in this browser and sent only to Google's API."}
                                  </p>
                                </div>
                              )}
                            </div>
                          </div>
                        )}
                        <div className="border-t border-[var(--bb-bg-3)] pt-4">
                          <TavilyApiKeyControl compact />
                        </div>
                        <NotionMcpControl />
                        <div className="flex items-center justify-between gap-5 border-t border-[var(--bb-bg-3)] pt-4">
                          <div>
                            <div className="font-medium text-[var(--bb-text-1)]">What's New</div>
                            <div className="text-sm text-[var(--bb-text-3)]">See what changed in recent updates.</div>
                          </div>
                          <Button variant="secondary" className="bg-[var(--bb-bg-4)] text-[var(--bb-text-1)] hover:bg-[var(--bb-border-strong)]" onClick={() => { setSettingsOpen(false); window.location.hash = "whats-new"; }}>View</Button>
                        </div>
                      </section>
                      <section className="space-y-3">
                        <div className="text-xs font-semibold uppercase tracking-wide text-[var(--bb-text-4)]">Account</div>
                        <div className="rounded-2xl border border-[var(--bb-border)] bg-[var(--bb-bg-2)] p-5 md:p-6 flex items-center justify-between gap-5">
                          <div>
                            <div className="font-medium text-[var(--bb-text-1)]">Local identity</div>
                            <div className="text-sm text-[var(--bb-text-3)]">No login is required. Sync can become optional later.</div>
                          </div>
                          <Badge className="bg-[var(--bb-bg-3)] text-[var(--bb-text-2)] border border-[var(--bb-border-strong)]">Offline ready</Badge>
                        </div>
                      </section>
                    </>
                  )}

                  {settingsPane === "editor" && (
                    <>
                      <div className="space-y-3">
                        <div>
                          <div className="text-sm font-medium text-[var(--bb-text-1)]">Default editing mode</div>
                          <div className="text-[13px] text-[var(--bb-text-3)]">Choose how notes open in the workspace.</div>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          {([
                            { value: "edit", icon: IconEdit, title: "Editing view", desc: "Live Markdown with inline formatting." },
                            { value: "preview", icon: IconBook2, title: "Reading view", desc: "Rendered, distraction-free reading." },
                          ]).map((opt: any) => {
                            const ModeIcon = opt.icon;
                            const active = editorMode === opt.value;
                            return (
                              <button
                                key={opt.value}
                                onClick={() => setEditorMode(opt.value)}
                                className={cn(
                                  "text-left rounded-xl border p-4 transition-colors",
                                  active ? "border-[var(--beebot-accent)] bg-[var(--beebot-accent)]/[0.06]" : "border-[var(--bb-border)] bg-[var(--bb-bg-2)] hover:border-[var(--bb-border)]",
                                )}
                              >
                                <div className="flex items-center justify-between">
                                  <ModeIcon className="h-[18px] w-[18px] text-[var(--bb-text-2)]" strokeWidth={1.8} />
                                  <span className={cn("h-4 w-4 rounded-full border flex items-center justify-center", active ? "border-[var(--beebot-accent)]" : "border-[var(--bb-border-strong)]")}>
                                    {active && <span className="h-2 w-2 rounded-full bg-[var(--beebot-accent)]" />}
                                  </span>
                                </div>
                                <div className="mt-3 text-sm font-medium text-[var(--bb-text-1)]">{opt.title}</div>
                                <div className="mt-0.5 text-[13px] text-[var(--bb-text-3)]">{opt.desc}</div>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                      <section className="rounded-2xl border border-[var(--bb-border)] bg-[var(--bb-bg-2)] p-5 md:p-6 space-y-4">
                        {[
                          ["Readable line length", "Limit maximum line length for easier reading.", "readableLineLength"],
                          ["Spellcheck", "Use the native spellchecker while writing.", "spellcheck"],
                          ["Auto-pair brackets", "Pair brackets and quotes automatically.", "autoPairBrackets"],
                          ["Smart lists", "Keep Markdown list indentation predictable.", "smartLists"],
                          ["Fold heading", "Prepare headings for collapsible sections.", "foldHeading"],
                          ["Fold indent", "Prepare nested lists for folding.", "foldIndent"],
                        ].map(([title, description, key]: any) => (
                          <div key={key} className="flex items-center justify-between gap-5 border-b border-[var(--bb-bg-3)] last:border-b-0 pb-4 last:pb-0">
                            <div>
                              <div className="font-medium text-[var(--bb-text-1)]">{title}</div>
                              <div className="text-sm text-[var(--bb-text-3)]">{description}</div>
                            </div>
                            <Switch
                              checked={Boolean(appearanceSettings[key])}
                              onCheckedChange={(checked) => updateAppearanceSettings({ [key]: checked })}
                            />
                          </div>
                        ))}
                      </section>
                    </>
                  )}

                  {settingsPane === "files" && (
                    <>
                      {!isDesktopShell && (
                        <div className="flex items-start gap-3 rounded-2xl border border-amber-500/15 bg-amber-500/[0.05] p-4 md:p-5">
                          <AlertTriangle className="h-4 w-4 shrink-0 text-amber-400 mt-0.5" />
                          <div className="min-w-0">
                            <div className="text-sm font-medium text-amber-200">Browser storage is temporary</div>
                            <div className="mt-0.5 text-[13px] leading-5 text-amber-200/70">Notes live in this browser only. Open a device folder (Chromium browsers or the desktop app) to keep them as real Markdown files on disk.</div>
                          </div>
                          <Button variant="secondary" className="ml-auto shrink-0 bg-amber-500/10 text-amber-200 hover:bg-amber-500/20 border border-amber-500/20" onClick={handleOpenVault}>
                            Open folder
                          </Button>
                        </div>
                      )}
                      <section className="rounded-2xl border border-[var(--bb-border)] bg-[var(--bb-bg-2)] p-5 md:p-6 space-y-4">
                        <div className="flex items-center justify-between gap-5 border-b border-[var(--bb-bg-3)] pb-4">
                          <div>
                            <div className="font-medium text-[var(--bb-text-1)]">Markdown files are source of truth</div>
                            <div className="text-sm text-[var(--bb-text-3)]">Notes stay human-readable on disk in the desktop app.</div>
                          </div>
                          <Badge variant="outline" className="border-[var(--bb-text-4)] text-[var(--bb-text-1)]">.md</Badge>
                        </div>
                        <div className="flex items-center justify-between gap-5 border-b border-[var(--bb-bg-3)] pb-4">
                          <div>
                            <div className="font-medium text-[var(--bb-text-1)]">Auto-rename from H1</div>
                            <div className="text-sm text-[var(--bb-text-3)]">Changing the first heading updates the file name.</div>
                          </div>
                          <Switch checked />
                        </div>
                        <div className="flex items-center justify-between gap-5">
                          <div>
                            <div className="font-medium text-[var(--bb-text-1)]">Backlinks and search index</div>
                            <div className="text-sm text-[var(--bb-text-3)]">SQLite indexes metadata, links, FTS, and embeddings only.</div>
                          </div>
                          <Button variant="secondary" className="bg-[var(--bb-bg-4)] text-[var(--bb-text-1)] hover:bg-[var(--bb-border-strong)]" onClick={runSearchRebuild} disabled={rebuildingSearch}>
                            {rebuildingSearch ? "Rebuilding…" : "Rebuild"}
                          </Button>
                        </div>
                      </section>
                    </>
                  )}

                  {settingsPane === "appearance" && (
                    <>
                      <section className="rounded-2xl border border-[var(--bb-border)] bg-[var(--bb-bg-2)] p-5 md:p-6 space-y-4">
                        <Suspense fallback={<div className="h-24 animate-pulse rounded-xl bg-[var(--bb-bg-3)]" />}>
                          <ThemeStorePanel
                            currentThemeId={appearanceSettings.customThemeId}
                            onThemeSelect={(themeId) => updateAppearanceSettings({ customThemeId: themeId })}
                            onEditTheme={(themeId) => {
                              setEditingThemeId(themeId);
                              setIsThemeEditorOpen(true);
                            }}
                          />

                          <ThemeEditorDialog
                            open={isThemeEditorOpen}
                            onOpenChange={setIsThemeEditorOpen}
                            themeId={editingThemeId}
                            activeThemeId={appearanceSettings.customThemeId}
                            onSaved={(newId: string) => updateAppearanceSettings({ customThemeId: newId })}
                          />
                        </Suspense>
                      </section>

                      <section className="rounded-2xl border border-[var(--bb-border)] bg-[var(--bb-bg-2)] p-5 md:p-6 space-y-4">
                        <div className="flex items-center justify-between gap-5 border-b border-[var(--bb-bg-3)] pb-4">
                          <div>
                            <div className="font-medium text-[var(--bb-text-1)]">Show ribbon</div>
                            <div className="text-sm text-[var(--bb-text-3)]">Keep primary workspace tools visible.</div>
                          </div>
                          <Switch checked={appearanceSettings.showRibbon} onCheckedChange={(checked) => updateAppearanceSettings({ showRibbon: checked })} />
                        </div>
                        <div className="flex items-center justify-between gap-5 border-b border-[var(--bb-bg-3)] pb-4">
                          <div>
                            <div className="font-medium text-[var(--bb-text-1)]">Skills button</div>
                            <div className="text-sm text-[var(--bb-text-3)]">Show the Skills button in the note header.</div>
                          </div>
                          <Switch checked={appearanceSettings.showSkillsButton} onCheckedChange={(checked) => updateAppearanceSettings({ showSkillsButton: checked })} />
                        </div>
                        <div className="flex items-center justify-between gap-5 border-b border-[var(--bb-bg-3)] pb-4">
                          <div>
                            <div className="font-medium text-[var(--bb-text-1)]">Assistant panel button</div>
                            <div className="text-sm text-[var(--bb-text-3)]">Show the right-panel toggle in the note header.</div>
                          </div>
                          <Switch checked={appearanceSettings.showPanelButton} onCheckedChange={(checked) => updateAppearanceSettings({ showPanelButton: checked })} />
                        </div>
                        <div className="flex items-center justify-between gap-5">
                          <div>
                            <div className="font-medium text-[var(--bb-text-1)]">Native menus</div>
                            <div className="text-sm text-[var(--bb-text-3)]">Match macOS behavior where Electron supports it.</div>
                          </div>
                          <Switch checked={appearanceSettings.nativeMenus} onCheckedChange={(checked) => updateAppearanceSettings({ nativeMenus: checked })} />
                        </div>
                        <div className="flex items-center justify-between gap-5 border-t border-[var(--bb-bg-3)] pt-4">
                          <div>
                            <div className="font-medium text-[var(--bb-text-1)]">Reduce transparency &amp; effects <span className="ml-1 rounded bg-[var(--bb-bg-4)] px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-[var(--bb-text-3)]">Performance</span></div>
                            <div className="text-sm text-[var(--bb-text-3)]">Turns off the frosted-glass blur (and pulsing glows). Fixes GPU overheating on the desktop — on by default there. Turn off for the full glass look.</div>
                          </div>
                          <Switch checked={reduceFx} onCheckedChange={(checked) => { reduceEffects.set(checked); setReduceFx(checked); }} />
                        </div>
                      </section>

                      <section className="space-y-3">
                        <div className="text-xs font-semibold uppercase tracking-wide text-[var(--bb-text-4)]">Font</div>
                        <div className="rounded-2xl border border-[var(--bb-border)] bg-[var(--bb-bg-2)] p-5 md:p-6 space-y-4">
                          {[
                            ["Interface font", "Set base font for the app shell.", "interfaceFonts"],
                            ["Text font", "Set font for editing and reading views.", "textFonts"],
                            ["Monospace font", "Set font for Markdown source and code.", "monospaceFonts"],
                          ].map(([title, description, key]: any) => {
                            const fonts = appearanceSettings[key];
                            return (
                              <div key={key} className="flex items-center justify-between gap-5 border-b border-[var(--bb-bg-3)] pb-4">
                                <div className="min-w-0">
                                  <div className="font-medium text-[var(--bb-text-1)]">{title}</div>
                                  <div className="text-sm text-[var(--bb-text-3)]">{description}</div>
                                  <div className="mt-1.5 flex items-center gap-2 text-sm">
                                    <span className="truncate text-[var(--bb-text-1)]" style={{ fontFamily: fontStack(fonts) }}>Ag · {firstAvailableFont(fonts)}</span>
                                  </div>
                                </div>
                                <Button
                                  variant="secondary"
                                  className="shrink-0 bg-[var(--bb-bg-3)] text-[var(--bb-text-1)] hover:bg-[var(--bb-border)]"
                                  onClick={() => {
                                    setFontTarget(key);
                                    setFontInput("");
                                    setFontSearch("");
                                  }}
                                >
                                  Manage
                                </Button>
                              </div>
                            );
                          })}
                          <div className="flex items-center justify-between gap-5 border-b border-[var(--bb-bg-3)] pb-4">
                            <div>
                              <div className="font-medium text-[var(--bb-text-1)]">Font size</div>
                              <div className="text-sm text-[var(--bb-text-3)]">Affects editing and reading views.</div>
                            </div>
                            <div className="w-56 flex items-center gap-3">
                              <span className="w-8 text-right text-sm text-[var(--bb-text-2)]">{appearanceSettings.fontSize}</span>
                              <Slider value={[appearanceSettings.fontSize]} min={13} max={22} step={1} onValueChange={([value]: any) => updateAppearanceSettings({ fontSize: value })} />
                            </div>
                          </div>
                          <div className="flex justify-end">
                            <Button variant="ghost" className="text-[var(--bb-text-2)] hover:bg-[var(--bb-bg-4)] hover:text-[var(--bb-text-1)]" onClick={resetAppearanceSettings}>
                              Reset appearance
                            </Button>
                          </div>
                        </div>
                      </section>
                    </>
                  )}

                  {settingsPane === "sync" && (
                    <section className="rounded-2xl border border-[var(--bb-border)] bg-[var(--bb-bg-2)] p-6 md:p-7">
                      <div className="max-w-2xl">
                        <div className="text-lg font-semibold text-[var(--bb-text-1)]">BeeBot Sync is optional</div>
                        <p className="mt-3 text-sm leading-6 text-[var(--bb-text-2)]">
                          This app opens offline and stores notes locally first. An account should only be needed later for optional encrypted sync, publishing, or multi-device backup.
                        </p>
                        <div className="mt-7 flex items-center justify-between gap-5 rounded-lg border border-[var(--bb-border-strong)] bg-[var(--bb-bg-1)] p-4">
                          <div>
                            <div className="font-medium text-[var(--bb-text-1)]">Enable sync placeholder</div>
                            <div className="text-sm text-[var(--bb-text-3)]">No Supabase dependency is used by the local workspace.</div>
                          </div>
                          <Switch checked={appearanceSettings.syncEnabled} onCheckedChange={(checked) => updateAppearanceSettings({ syncEnabled: checked })} />
                        </div>
                      </div>
                    </section>
                  )}

                  {settingsPane === "skills" && (
                    <section className="space-y-4">
                      <div className="rounded-2xl border border-[var(--bb-border)] bg-[var(--bb-bg-2)] p-5 md:p-6">
                        <div className="flex items-center justify-between gap-5">
                          <div>
                            <div className="font-medium text-[var(--bb-text-1)]">Skill system</div>
                            <div className="text-sm text-[var(--bb-text-3)]">Core stays small. Features attach as permissioned skills.</div>
                          </div>
                          <Badge variant="secondary">{skillSummary?.enabledCount || 0}/{skillSummary?.totalCount || 0} enabled</Badge>
                        </div>
                      </div>
                      {groupedSkills.length === 0 ? (
                        <div className="rounded-2xl border border-[var(--bb-border)] bg-[var(--bb-bg-2)] p-5 md:p-6 text-sm text-[var(--bb-text-3)]">No desktop skills are exposed in this runtime yet.</div>
                      ) : groupedSkills.map(([category, categorySkills]: any) => (
                        <div key={category} className="rounded-2xl border border-[var(--bb-border)] bg-[var(--bb-bg-2)] p-5 md:p-6 space-y-4">
                          <div className="text-xs font-semibold uppercase tracking-normal text-[var(--bb-text-3)]">{category}</div>
                          {categorySkills.map((skill: any) => (
                            <div key={skill.manifest.id} className="flex items-center justify-between gap-5 border-b border-[var(--bb-bg-3)] last:border-b-0 pb-4 last:pb-0">
                              <div>
                                <div className="font-medium text-[var(--bb-text-1)]">{skill.manifest.name}</div>
                                <div className="text-sm text-[var(--bb-text-3)]">{skill.manifest.description}</div>
                              </div>
                              <Switch checked={skill.enabled} disabled={isSkillBusy || skill.manifest.core} onCheckedChange={(checked) => handleToggleSkill(skill.manifest.id, checked)} />
                            </div>
                          ))}
                        </div>
                      ))}
                    </section>
                  )}
                </div>
              </ScrollArea>
            </section>
          </div>
        </DialogContent>
      </Dialog>
      <Dialog open={Boolean(fontTarget)} onOpenChange={(open) => !open && setFontTarget(null)}>
        <DialogContent className="max-w-xl border-[var(--bb-border)] bg-[var(--bb-bg-1)] text-[var(--bb-text-1)]">
          <DialogHeader>
            <DialogTitle className="text-[var(--bb-text-1)]">
              {fontTarget === "interfaceFonts" ? "Interface font" : fontTarget === "monospaceFonts" ? "Monospace font" : "Text font"}
            </DialogTitle>
            <DialogDescription className="text-[var(--bb-text-3)]">
              The first font from this list that is available on your system will be applied.
            </DialogDescription>
          </DialogHeader>
          {fontTarget && (
            <div className="space-y-4">
              {/* Live preview rendered in the applied face */}
              <div className="rounded-xl border border-[var(--bb-border)] bg-[var(--bb-bg-2)] px-4 py-3">
                <div className="text-[11px] uppercase tracking-wide text-[var(--bb-text-4)]">Preview · {firstAvailableFont(appearanceSettings[fontTarget])}</div>
                <div className="mt-1.5 truncate text-lg text-[var(--bb-text-1)]" style={{ fontFamily: fontStack(appearanceSettings[fontTarget]) }}>
                  The quick brown fox jumps over the lazy dog 0123
                </div>
              </div>

              {/* Fallback stack */}
              <div className="rounded-xl border border-[var(--bb-border)] bg-[var(--bb-bg-2)] divide-y divide-[var(--bb-bg-3)]">
                {appearanceSettings[fontTarget].map((font: string, index: number) => {
                  const applied = font === firstAvailableFont(appearanceSettings[fontTarget]);
                  return (
                    <div key={font} className="min-h-12 flex items-center justify-between gap-3 px-3.5 text-sm">
                      <div className="min-w-0">
                        <div className="truncate text-[var(--bb-text-1)]" style={{ fontFamily: font }}>{font}</div>
                        <div className="text-[11px] text-[var(--bb-text-4)]">{index === 0 ? "First choice" : `Fallback ${index}`}{applied ? " · applied now" : ""}</div>
                      </div>
                      <div className="flex items-center gap-1">
                        {applied && <Check className="mr-1 h-4 w-4 text-[var(--beebot-accent)]" />}
                        <Button variant="ghost" size="icon" className="h-7 w-7 rounded-lg text-[var(--bb-text-3)] hover:bg-[var(--bb-bg-3)] hover:text-[var(--bb-text-1)]" disabled={index === 0} onClick={() => moveFontInTarget(fontTarget, font, -1)} aria-label={`Move ${font} up`}>
                          <ArrowUp className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7 rounded-lg text-[var(--bb-text-3)] hover:bg-[var(--bb-bg-3)] hover:text-[var(--bb-text-1)]" disabled={index === appearanceSettings[fontTarget].length - 1} onClick={() => moveFontInTarget(fontTarget, font, 1)} aria-label={`Move ${font} down`}>
                          <ArrowDown className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7 rounded-lg text-[var(--bb-text-3)] hover:bg-[var(--bb-bg-3)] hover:text-[var(--bb-text-1)]" disabled={appearanceSettings[fontTarget].length <= 1} onClick={() => removeFontFromTarget(fontTarget, font)} aria-label={`Remove ${font}`}>
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Installed-font access */}
              <div className="flex items-center justify-between gap-3">
                <span className="text-xs text-[var(--bb-text-3)]">
                  {fontsLoading ? "Scanning installed fonts…" : `${systemFonts.length} fonts available`}
                </span>
                {fontPermission !== "granted" && fontPermission !== "unsupported" && (
                  <Button variant="secondary" className="h-8 gap-1.5 rounded-lg bg-[var(--bb-bg-3)] text-[var(--bb-text-1)] hover:bg-[var(--bb-border)]" disabled={fontsLoading} onClick={() => loadSystemFonts(true)}>
                    <Type className="h-3.5 w-3.5" />
                    Load installed fonts
                  </Button>
                )}
              </div>
              {fontPermission === "denied" && (
                <div className="flex items-start gap-2.5 rounded-xl border border-amber-500/15 bg-amber-500/[0.05] px-3.5 py-2.5 text-[12px] leading-5 text-amber-200/80">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
                  <span>Your browser blocked access to installed fonts. Allow “Fonts” for this site in browser settings and retry, or use the desktop app to browse every installed font.</span>
                </div>
              )}
              {fontPermission === "unsupported" && (
                <div className="rounded-xl border border-[var(--bb-border)] bg-[var(--bb-bg-2)] px-3.5 py-2.5 text-[12px] leading-5 text-[var(--bb-text-3)]">
                  This browser can’t enumerate installed fonts. You can still type any font name to add it, or use the desktop app for the full list.
                </div>
              )}

              <div className="grid grid-cols-[1fr_auto] gap-2">
                <div className="relative">
                  <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-[var(--bb-text-4)]" />
                  <Input
                    value={fontInput}
                    onChange={(event) => {
                      setFontInput(event.target.value);
                      setFontSearch(event.target.value);
                    }}
                    onFocus={() => {
                      if (fontPermission === "unknown" || fontPermission === "prompt") void loadSystemFonts(true);
                    }}
                    placeholder="Search or type a font name…"
                    className="h-9 pl-8 bg-[var(--bb-bg-2)] border-[var(--bb-border)] text-[var(--bb-text-1)]"
                  />
                </div>
                <Button className="h-9 gap-1.5 bg-[var(--beebot-accent)] text-black hover:bg-[var(--beebot-accent)]/90" onClick={() => addFontToTarget(fontTarget, fontInput)}>
                  <Plus className="h-4 w-4" />
                  Add
                </Button>
              </div>

              {fontSuggestions.length > 0 && (
                <div className="max-h-72 overflow-auto rounded-xl border border-[var(--bb-border)] bg-[var(--bb-bg-2)] p-1">
                  {fontSuggestions.slice(0, 120).map((font: string) => (
                    <div key={font} className="group flex items-center gap-1 rounded-lg px-2 py-1.5 hover:bg-[var(--bb-bg-3)]">
                      <button
                        type="button"
                        className="min-w-0 flex-1 text-left"
                        style={{ fontFamily: font }}
                        onClick={() => addFontToTarget(fontTarget, font)}
                      >
                        <span className="block truncate text-sm text-[var(--bb-text-1)]">{font}</span>
                      </button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 shrink-0 px-2 text-[10px] uppercase tracking-wide text-[var(--bb-text-3)] opacity-0 transition-opacity group-hover:opacity-100 hover:text-[var(--beebot-accent)]"
                        onClick={() => applyFontToTarget(fontTarget, font)}
                      >
                        Apply
                      </Button>
                    </div>
                  ))}
                  {fontSuggestions.length > 120 && (
                    <div className="px-3 py-2 text-xs text-[var(--bb-text-4)]">
                      Keep typing to narrow {fontSuggestions.length - 120} more fonts.
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
      <Dialog open={createVaultOpen} onOpenChange={setCreateVaultOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Vault</DialogTitle>
            <DialogDescription>
              Choose a folder location next. BeeBot will create a local Markdown vault there.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <label className="text-xs font-medium text-muted-foreground" htmlFor="new-vault-name">
              Vault name
            </label>
            <Input
              id="new-vault-name"
              value={newVaultName}
              onChange={(event) => setNewVaultName(event.target.value)}
              placeholder="BeeBot Vault"
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateVaultOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreateVault} disabled={isVaultBusy || !newVaultName.trim()}>
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={skillsOpen} onOpenChange={setSkillsOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Skills</DialogTitle>
            <DialogDescription>
              Enabled skills are available to BeeBot for this vault after permission routing is connected.
            </DialogDescription>
          </DialogHeader>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Badge variant="secondary">{skillSummary?.enabledCount || 0}/{skillSummary?.totalCount || 0} enabled</Badge>
            <Badge variant="outline">{skillSummary?.permissionCount || 0} permissions</Badge>
            <span className="truncate">{activeVault?.name || "Active vault"}</span>
          </div>
          <ScrollArea className="max-h-[58vh] pr-3">
            <div className="space-y-5">
              {groupedSkills.map(([category, categorySkills]: any) => (
                <section key={category} className="space-y-2">
                  <div className="text-xs font-semibold uppercase tracking-normal text-muted-foreground">{category}</div>
                  <div className="space-y-2">
                    {categorySkills.map((skill: any) => (
                      <div key={skill.manifest.id} className="rounded-md border border-border/70 p-3 bg-card/35">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <div className="text-sm font-medium truncate">{skill.manifest.name}</div>
                              <Badge variant={skill.enabled ? "default" : "outline"} className="shrink-0">
                                {skill.enabled ? "Enabled" : "Disabled"}
                              </Badge>
                              {skill.manifest.core && <Badge variant="secondary" className="shrink-0">Core</Badge>}
                            </div>
                            <div className="mt-1 text-xs text-muted-foreground">{skill.manifest.description}</div>
                          </div>
                          <Switch
                            checked={skill.enabled}
                            disabled={isSkillBusy || skill.manifest.core}
                            onCheckedChange={(checked) => handleToggleSkill(skill.manifest.id, checked)}
                          />
                        </div>
                        <div className="mt-3 flex flex-wrap gap-1.5">
                          {skill.manifest.permissions.map((permission: string) => (
                            <Badge key={permission} variant="outline" className="text-[10px] font-normal">
                              {permission}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              ))}
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(promptDialog)} onOpenChange={(open) => { if (!open) resolvePrompt(null); }}>
        <DialogContent className="max-w-sm border-[var(--bb-border-strong)] bg-[var(--bb-bg-1)] text-[var(--bb-text-1)]">
          <DialogHeader>
            <DialogTitle>{promptDialog?.title}</DialogTitle>
            {promptDialog?.description && <DialogDescription className="text-[var(--bb-text-3)]">{promptDialog.description}</DialogDescription>}
          </DialogHeader>
          <Input
            autoFocus
            value={promptValue}
            placeholder={promptDialog?.placeholder}
            onChange={(event) => setPromptValue(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                resolvePrompt(promptValue);
              }
            }}
            className="bg-[var(--bb-bg-2)] border-[var(--bb-border-strong)]"
          />
          <DialogFooter>
            <Button variant="ghost" className="text-[var(--bb-text-2)] hover:bg-[var(--bb-bg-4)] hover:text-[var(--bb-text-1)]" onClick={() => resolvePrompt(null)}>Cancel</Button>
            <Button className="bg-[var(--beebot-accent)] text-black hover:bg-[var(--beebot-accent)]/90" onClick={() => resolvePrompt(promptValue)}>{promptDialog?.confirmLabel}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(confirmDialog)} onOpenChange={(open) => { if (!open) resolveConfirm(false); }}>
        <DialogContent className="max-w-sm border-[var(--bb-border-strong)] bg-[var(--bb-bg-1)] text-[var(--bb-text-1)]">
          <DialogHeader>
            <DialogTitle>{confirmDialog?.title}</DialogTitle>
            {confirmDialog?.description && <DialogDescription className="text-[var(--bb-text-3)]">{confirmDialog.description}</DialogDescription>}
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" className="text-[var(--bb-text-2)] hover:bg-[var(--bb-bg-4)] hover:text-[var(--bb-text-1)]" onClick={() => resolveConfirm(false)}>Cancel</Button>
            <Button
              className={cn(confirmDialog?.destructive ? "bg-red-600 text-white hover:bg-red-600/90" : "bg-[var(--beebot-accent)] text-black hover:bg-[var(--beebot-accent)]/90")}
              onClick={() => resolveConfirm(true)}
            >
              {confirmDialog?.confirmLabel}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <CommandDialog open={commandOpen} onOpenChange={setCommandOpen}>
        <CommandInput placeholder="Search files and run commands…" />
        <CommandList>
          <CommandEmpty>No results found.</CommandEmpty>
          <CommandGroup heading="Actions">
            <CommandItem onSelect={() => runCommand(() => handleCreateNote(activeNote ? folderFromPath(activeNote.path) : ""))}>
              <FileText className="mr-2 h-4 w-4" />
              New note
            </CommandItem>
            <CommandItem onSelect={() => runCommand(() => handleCreateFolder())}>
              <FolderPlus className="mr-2 h-4 w-4" />
              New folder
            </CommandItem>
            <CommandItem onSelect={() => runCommand(() => handleOpenVault())}>
              <HardDrive className="mr-2 h-4 w-4" />
              Open folder from device…
            </CommandItem>
            <CommandItem value="health check diagnostics save storage search recovery qa" onSelect={() => runCommand(() => openHealth())}>
              <ShieldCheck className="mr-2 h-4 w-4" />
              Health Check
            </CommandItem>
            <CommandItem value="rebuild search index health diagnostics" onSelect={() => runCommand(() => { void runSearchRebuild(); })}>
              <RotateCcw className="mr-2 h-4 w-4" />
              Rebuild search index
            </CommandItem>
            <CommandItem onSelect={() => runCommand(() => (isMobile ? setMobileView("agent") : setAgentOpen((value: boolean) => !value)))}>
              <Bot className="mr-2 h-4 w-4" />
              Toggle BeeBot agent
            </CommandItem>
            <CommandItem onSelect={() => runCommand(() => setEditorMode(editorMode === "edit" ? "preview" : "edit"))}>
              <BookOpen className="mr-2 h-4 w-4" />
              Toggle editing / reading view
            </CommandItem>
            {activeNote && (
              <CommandItem onSelect={() => runCommand(() => openHistory())}>
                <History className="mr-2 h-4 w-4" />
                Version history
              </CommandItem>
            )}
            <CommandItem onSelect={() => runCommand(() => setSettingsOpen(true))}>
              <Settings className="mr-2 h-4 w-4" />
              Open settings
            </CommandItem>
          </CommandGroup>
          {noteList.length > 0 && (
            <>
              <CommandSeparator />
              <CommandGroup heading="Files">
                {noteList.slice(0, 50).map((note: any) => (
                  <CommandItem
                    key={note.path}
                    value={`${note.title || titleFromPath(note.path)} ${note.path}`}
                    onSelect={() => runCommand(() => openNotePath(note.path))}
                  >
                    <FileText className="mr-2 h-4 w-4 text-[var(--bb-text-4)]" />
                    <span className="truncate">{note.title || titleFromPath(note.path)}</span>
                    <span className="ml-auto truncate pl-3 text-[11px] text-[var(--bb-text-4)]">{folderFromPath(note.path) || "/"}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            </>
          )}
        </CommandList>
      </CommandDialog>

      <Dialog
        open={healthOpen}
        onOpenChange={(open) => { if (!open) closeHealth(); else openHealth(); }}
      >
        <DialogContent className="w-[min(92vw,620px)] max-w-none gap-0 overflow-hidden border-[var(--bb-border-strong)] bg-[var(--bb-bg-1)] p-0 text-[var(--bb-text-1)] sm:p-0">
          <DialogHeader className="border-b border-[var(--bb-border)] px-4 py-3">
            <DialogTitle className="flex items-center gap-2 text-[14px] font-semibold">
              <ShieldCheck className="h-4 w-4 text-[var(--beebot-accent)]" />
              Health Check
              <span className="ml-1 text-[12px] font-normal text-[var(--bb-text-4)]">local-first workspace</span>
            </DialogTitle>
            <DialogDescription className="sr-only">Save, storage, search, recovery, and recent workspace errors.</DialogDescription>
          </DialogHeader>
          <ScrollArea className="max-h-[70vh]">
            <div className="space-y-4 p-4">
              <div className="grid gap-2 sm:grid-cols-2">
                {[
                  ["Save", health.saveStatus, !isDirty && !isSaving],
                  ["Storage", health.storageBackend, !needsReopenFolder],
                  ["Vault", health.vaultStatus, !needsReopenFolder && !isLoading],
                  ["Search", health.searchStatus, true],
                  ["Recovery", health.recoveryStatus, !emergencyRecoveryAvailable],
                ].map(([label, value, ok]) => (
                  <div key={String(label)} className="rounded-lg border border-[var(--bb-border)] bg-[var(--bb-bg-2)] px-3 py-2.5">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-[11px] uppercase tracking-wide text-[var(--bb-text-4)]">{label}</span>
                      <span className={cn("rounded-full border px-2 py-0.5 text-[10px]", healthTone(Boolean(ok)))}>
                        {ok ? "OK" : "Needs attention"}
                      </span>
                    </div>
                    <div className="mt-1.5 truncate text-[13px] text-[var(--bb-text-1)]">{String(value)}</div>
                  </div>
                ))}
              </div>

              <div className="rounded-lg border border-[var(--bb-border)] bg-[var(--bb-bg-2)] p-3">
                <div className="mb-2 flex items-center justify-between gap-3">
                  <div>
                    <div className="text-[13px] font-medium text-[var(--bb-text-1)]">Quick repair</div>
                    <div className="text-[11.5px] text-[var(--bb-text-4)]">Safe local actions only.</div>
                  </div>
                  {activeVault?.name && <Badge variant="outline" className="border-[var(--bb-border-strong)] text-[var(--bb-text-2)]">{activeVault.name}</Badge>}
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="secondary" className="h-8 bg-[var(--bb-bg-4)] text-[var(--bb-text-1)] hover:bg-[var(--bb-border-strong)]" onClick={runSearchRebuild} disabled={rebuildingSearch}>
                    <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
                    {rebuildingSearch ? "Rebuilding…" : "Rebuild search"}
                  </Button>
                  <Button size="sm" variant="secondary" className="h-8 bg-[var(--bb-bg-4)] text-[var(--bb-text-1)] hover:bg-[var(--bb-border-strong)]" onClick={openHistory} disabled={!activeNote}>
                    <History className="mr-1.5 h-3.5 w-3.5" />
                    Version history
                  </Button>
                  <Button size="sm" variant="secondary" className="h-8 bg-[var(--bb-bg-4)] text-[var(--bb-text-1)] hover:bg-[var(--bb-border-strong)]" onClick={handleRevealVault}>
                    <HardDrive className="mr-1.5 h-3.5 w-3.5" />
                    Open vault
                  </Button>
                </div>
              </div>

              <div className="rounded-lg border border-[var(--bb-border)] bg-[var(--bb-bg-2)] p-3">
                <div className="mb-2 flex items-center gap-2 text-[13px] font-medium text-[var(--bb-text-1)]">
                  <AlertTriangle className="h-3.5 w-3.5 text-[var(--bb-text-4)]" />
                  Recent errors
                </div>
                {health.recentErrors.length === 0 ? (
                  <div className="rounded-md bg-[var(--bb-bg-3)] px-3 py-2 text-[12px] text-[var(--bb-text-3)]">No save, search, or storage errors tracked in this session.</div>
                ) : (
                  <div className="space-y-2">
                    {health.recentErrors.map((error: WorkspaceHealthError) => (
                      <div key={`${error.at}:${error.area}`} className="rounded-md bg-[var(--bb-bg-3)] px-3 py-2">
                        <div className="flex items-center justify-between gap-3 text-[11px] text-[var(--bb-text-4)]">
                          <span className="uppercase tracking-wide">{error.area}</span>
                          <span>{formatHealthErrorTime(error.at)}</span>
                        </div>
                        <div className="mt-1 line-clamp-2 text-[12px] text-[var(--bb-text-2)]">{error.message}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>

      <Dialog
        open={searchModalOpen}
        onOpenChange={(open) => { if (!open) closeSearchModal(); else openSearchModal(); }}
      >
        <DialogContent className="max-w-xl gap-0 overflow-hidden border-[var(--bb-border-strong)] bg-[var(--bb-bg-1)] p-0 text-[var(--bb-text-1)] sm:p-0">
          <DialogHeader className="border-b border-[var(--bb-border)] px-4 py-3">
            <DialogTitle className="sr-only">Search notes</DialogTitle>
            <div className="flex items-center gap-2">
              <IconSearch className="h-4 w-4 text-[var(--bb-text-3)]" strokeWidth={1.9} />
              <Input
                autoFocus
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search notes, headings, tags, content…"
                className="h-9 flex-1 border-0 bg-transparent text-sm text-[var(--bb-text-1)] placeholder:text-[var(--bb-text-4)] focus-visible:ring-0 focus-visible:ring-offset-0"
                onKeyDown={(event) => { if (event.key === "Escape") closeSearchModal(); }}
              />
              {query && (
                <Button variant="ghost" size="icon" className="h-7 w-7 rounded-md text-[var(--bb-text-3)] hover:bg-[var(--bb-bg-3)] hover:text-[var(--bb-text-1)]" onClick={() => setQuery("")} title="Clear">
                  <X className="h-3.5 w-3.5" />
                </Button>
              )}
            </div>
          </DialogHeader>
          <ScrollArea className="max-h-[420px]">
            <div className="px-2 py-2">
              {!query.trim() ? (
                <div className="px-3 py-8 text-center text-xs text-[var(--bb-text-4)]">Start typing to search across all notes.</div>
              ) : searchResults.length === 0 ? (
                <div className="px-3 py-8 text-center text-xs text-[var(--bb-text-4)]">No matches for &ldquo;{query}&rdquo;.</div>
              ) : (
                searchResults.slice(0, 9).map((result: any) => (
                  <button
                    key={result.id || `${result.source}:${result.path}:${result.title}`}
                    type="button"
                    onClick={() => { if (result.path) openNotePath(result.path); closeSearchModal(); }}
                    className="flex w-full items-start gap-2 rounded-md px-3 py-2 text-left transition-colors hover:bg-[var(--bb-bg-3)]"
                  >
                    <FileText className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--bb-text-3)]" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="truncate text-sm text-[var(--bb-text-1)]">{result.title || titleFromPath(result.path || "")}</span>
                        <span className="shrink-0 rounded bg-[var(--bb-bg-3)] px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-[var(--bb-text-4)]">
                          {result.source === "heading" ? "Heading" : result.source === "tag" ? "Tag" : "Note"}
                        </span>
                      </div>
                      {result.snippet && <div className="mt-0.5 line-clamp-1 text-[11.5px] text-[var(--bb-text-3)]">{result.snippet}</div>}
                    </div>
                  </button>
                ))
              )}
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>

      <Dialog
        open={graphOpen}
        onOpenChange={(open) => { if (!open) closeGraphView(); else openGraphView(); }}
      >
        <DialogContent className="w-[min(96vw,1200px)] h-[min(86vh,820px)] max-w-none p-0 sm:p-0 overflow-hidden border-[var(--bb-border-strong)] bg-[var(--bb-bg-1)] text-[var(--bb-text-1)]">
          <DialogHeader className="border-b border-[var(--bb-border)] px-4 py-3">
            <DialogTitle className="flex items-center gap-2 text-[14px] font-semibold">
              <Waypoints className="h-4 w-4 text-[var(--beebot-accent)]" />
              Graph view
              <span className="ml-2 text-[12px] font-normal text-[var(--bb-text-4)]">drag to pan · scroll to zoom · click a node to open</span>
            </DialogTitle>
          </DialogHeader>
          <div className="relative h-full flex-1 min-h-0">
            <Suspense fallback={<div className="flex h-full items-center justify-center text-sm text-[var(--bb-text-4)]">Loading graph…</div>}>
              {graphOpen && (
                <GraphView
                  notes={liveNotes.map((n: any) => ({ path: n.path, title: n.title || titleFromPath(n.path), content: n.content }))}
                  activePath={activePath}
                  resolve={(target: string) => resolveWikilinkTarget(target, liveNotes)?.path ?? null}
                  onNodeClick={(path: string) => { openNotePath(path); closeGraphView(); }}
                  search={search}
                />
              )}
            </Suspense>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={historyOpen}
        onOpenChange={(open) => { if (!open) closeHistory(); else openHistory(); }}
      >
        <DialogContent className="w-[min(92vw,560px)] max-w-none gap-0 overflow-hidden border-[var(--bb-border-strong)] bg-[var(--bb-bg-1)] p-0 text-[var(--bb-text-1)] sm:p-0">
          <DialogHeader className="border-b border-[var(--bb-border)] px-4 py-3">
            <DialogTitle className="flex items-center gap-2 text-[14px] font-semibold">
              <History className="h-4 w-4 text-[var(--beebot-accent)]" />
              Version history
              <span className="ml-1 truncate text-[12px] font-normal text-[var(--bb-text-4)]">
                {activeNote ? (activeNote.title || titleFromPath(activeNote.path)) : "No note"}
              </span>
            </DialogTitle>
          </DialogHeader>
          <ScrollArea className="max-h-[60vh]">
            <div className="px-2 py-2">
              {versionsLoading ? (
                <div className="px-3 py-8 text-center text-xs text-[var(--bb-text-4)]">Loading…</div>
              ) : versions.length === 0 ? (
                <div className="px-3 py-10 text-center text-xs text-[var(--bb-text-4)]">
                  No earlier versions yet.<br />Snapshots are saved automatically as you edit.
                </div>
              ) : (
                versions.map((version: any, index: number) => (
                  <div
                    key={version.id}
                    className="group flex items-center gap-3 rounded-md px-3 py-2.5 transition-colors hover:bg-[var(--bb-bg-3)]"
                  >
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-[var(--bb-bg-3)] text-[var(--bb-text-3)]">
                      <History className="h-3.5 w-3.5" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="text-[13px] text-[var(--bb-text-1)]">
                        {formatVersionTime(version.mtimeMs)}
                        {index === 0 && <span className="ml-2 rounded bg-[var(--bb-accent-soft)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--bb-text-1)]">Latest</span>}
                      </div>
                      <div className="text-[11px] text-[var(--bb-text-4)]">{version.size.toLocaleString()} characters</div>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 shrink-0 gap-1.5 rounded-md px-2.5 text-[12px] text-[var(--bb-text-2)] opacity-0 transition-opacity hover:bg-[var(--bb-bg-4)] hover:text-[var(--bb-text-1)] group-hover:opacity-100 focus-visible:opacity-100"
                      onClick={() => handleRestoreVersion(version)}
                    >
                      <RotateCcw className="h-3.5 w-3.5" />
                      Restore
                    </Button>
                  </div>
                ))
              )}
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>

      {cfoOpen && userId && (
        <MicroErrorBoundary name="FlowState CFO" resetKeys={[cfoOpen]}>
          <Suspense fallback={<div className="fixed inset-0 z-50 flex items-center justify-center bg-[#060607] text-xs text-muted-foreground">Loading Personal CFO...</div>}>
            <FlowStateDialog open={cfoOpen} onOpenChange={(open: boolean) => { if (!open) closeCfo(); }} userId={userId} />
          </Suspense>
        </MicroErrorBoundary>
      )}

      {consultantOpen && userId && (
        <MicroErrorBoundary name="Agent Consultant" resetKeys={[consultantOpen]}>
          <div className="fixed inset-0 z-50 flex flex-col bg-[#060607]">
            <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
              <Suspense fallback={<div className="h-full flex items-center justify-center text-xs text-muted-foreground">Loading Consultant...</div>}>
                <AgentConsultantPanel userId={userId} onClose={closeConsultant} />
              </Suspense>
            </div>
          </div>
        </MicroErrorBoundary>
      )}
    </>
  );
}
