import { useState, useEffect, useCallback } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Plus,
  MoreHorizontal,
  Trash2,
  Pencil,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Loader2,
  MessageSquare,
  Shield,
  Sparkles,
  Crown,
  Cpu,
  History,
  Search,
  X,
  FileText,
  StickyNote,
  Check,
  User,
  Download,
  FileJson,
  CalendarClock,
  
  LineChart as LineChartIcon,
} from "lucide-react";
import { toast } from "sonner";
import { IUCreditsWidget } from "./IUCreditsWidget";
import { cn } from "@/lib/utils";
import { UserProfileDialog } from "@/components/UserProfileDialog";
import { AgentChatSession } from "@/hooks/useAgentChat";
import { groupSessionsByDate } from "./session-utils";
import { exportSessionAsMarkdown, exportSessionAsJSON } from "@/lib/exportConversation";

type ExportRow = { role: string; content: string | null; created_at: string; is_error: boolean | null; attachments: unknown };
const EXPORT_PAGE_SIZE = 1000;
const EXPORT_HARD_CAP = 50_000;

async function exportSessionMessages(session: AgentChatSession, format: "markdown" | "json"): Promise<void> {
  // PostgREST applies a server-side row cap (typically 1000), so we paginate
  // until we get a short page or hit the hard cap. Without this, long
  // sessions would silently truncate their export.
  const all: ExportRow[] = [];
  for (let from = 0; from < EXPORT_HARD_CAP; from += EXPORT_PAGE_SIZE) {
    const { data, error } = await supabase
      .from("agent_chat_messages")
      .select("role, content, created_at, is_error, attachments")
      .eq("session_id", session.id)
      .order("created_at", { ascending: true })
      .range(from, from + EXPORT_PAGE_SIZE - 1);
    if (error) {
      toast.error("Failed to load messages for export");
      return;
    }
    const page = (data || []) as ExportRow[];
    all.push(...page);
    if (page.length < EXPORT_PAGE_SIZE) break;
  }
  if (all.length === 0) {
    toast.info("This conversation has no messages to export.");
    return;
  }
  const sessionLite = { id: session.id, title: session.title, created_at: session.created_at };
  if (format === "markdown") exportSessionAsMarkdown(sessionLite, all);
  else exportSessionAsJSON(sessionLite, all);
  toast.success(
    all.length >= EXPORT_HARD_CAP
      ? `Exported ${all.length} messages (capped — older messages may be missing)`
      : `Exported ${all.length} messages`,
  );
}

interface ChatSessionSidebarProps {
  sessions: AgentChatSession[];
  activeSessionId: string | null;
  onSelectSession: (id: string) => void;
  onCreateSession: () => Promise<void>;
  onDeleteSession: (id: string) => Promise<void>;
  onRenameSession: (data: { sessionId: string; title: string }) => Promise<void>;
  onUpdateSessionInstructions?: (data: { sessionId: string; instructions: string | null }) => Promise<void>;
  isLoading: boolean;
  isCreating: boolean;
  isOpen: boolean;
  onToggle: () => void;
  botName: string;
  botEmoji: string;
  isAdmin: boolean;
  tierDisplay?: string;
  modelDisplay?: string;
  iuRemaining?: number;
  iuLimit?: number;
  isUnlimited?: boolean;
  iuBonus?: number;
  iuBalance?: number;
  profileOpen?: boolean;
  onOpenProfile?: () => void;
  onCloseProfile?: (open: boolean) => void;
  profileTab?: string;
  onProfileTabChange?: (tab: string) => void;
  scheduledTasksActive?: boolean;
  onOpenScheduledTasks?: () => void;
  consultantActive?: boolean;
  onOpenConsultant?: () => void;
}

export function ChatSessionSidebar({
  sessions,
  activeSessionId,
  onSelectSession,
  onCreateSession,
  onDeleteSession,
  onRenameSession,
  onUpdateSessionInstructions,
  isLoading,
  isCreating,
  isOpen,
  onToggle,
  botName,
  botEmoji,
  isAdmin,
  tierDisplay = "Explorer",
  modelDisplay = "Flash",
  iuRemaining,
  iuLimit,
  isUnlimited = false,
  iuBonus = 0,
  iuBalance = 0,
  profileOpen: externalProfileOpen,
  onOpenProfile,
  onCloseProfile,
  profileTab,
  onProfileTabChange,
  scheduledTasksActive = false,
  onOpenScheduledTasks,
  consultantActive = false,
  onOpenConsultant,
}: ChatSessionSidebarProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [isDesktop, setIsDesktop] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchMode, setSearchMode] = useState<'sessions' | 'messages'>('sessions');
  const [messageResults, setMessageResults] = useState<Array<{
    id: string;
    content: string;
    session_id: string;
    created_at: string;
    session_title: string;
  }>>([]);
  const [isSearchingMessages, setIsSearchingMessages] = useState(false);
  // Per-session instructions editor state
  const [editingInstructionsId, setEditingInstructionsId] = useState<string | null>(null);
  const [instructionsText, setInstructionsText] = useState("");
  const [isSavingInstructions, setIsSavingInstructions] = useState(false);
  const profileOpen = externalProfileOpen ?? false;
  const handleOpenProfile = onOpenProfile ?? (() => {});
  const handleCloseProfile = onCloseProfile ?? (() => {});

  useEffect(() => {
    const checkWidth = () => setIsDesktop(window.innerWidth >= 1024);
    checkWidth();
    window.addEventListener("resize", checkWidth);
    return () => window.removeEventListener("resize", checkWidth);
  }, []);

  // Message content search (debounced 300ms)
  useEffect(() => {
    if (searchMode !== 'messages' || !searchQuery.trim()) {
      setMessageResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      setIsSearchingMessages(true);
      try {
        const { data, error } = await supabase
          .from('agent_chat_messages')
          .select('id, content, session_id, created_at')
          .ilike('content', `%${searchQuery.trim()}%`)
          .eq('role', 'assistant')
          .order('created_at', { ascending: false })
          .limit(20);

        if (!error && data) {
          const sessionIds = [...new Set(data.map((m: any) => m.session_id))];
          const { data: sessionsData } = await supabase
            .from('agent_chat_sessions')
            .select('id, title')
            .in('id', sessionIds);

          const sessionMap = new Map((sessionsData || []).map((s: any) => [s.id, s.title]));
          setMessageResults(data.map((m: any) => ({
            ...m,
            session_title: sessionMap.get(m.session_id) || 'Untitled',
          })));
        }
      } finally {
        setIsSearchingMessages(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [searchQuery, searchMode]);

  // Filter sessions by search query (client-side, instant)
  const filteredSessions = searchQuery.trim()
    ? sessions.filter(s => {
        const q = searchQuery.toLowerCase();
        return (s.title || '').toLowerCase().includes(q);
      })
    : sessions;

  const groupedSessions = groupSessionsByDate(filteredSessions);

  const handleRename = async (sessionId: string) => {
    if (editTitle.trim()) {
      await onRenameSession({ sessionId, title: editTitle.trim() });
    }
    setEditingId(null);
    setEditTitle("");
  };

  const startEditing = (session: AgentChatSession) => {
    setEditingId(session.id);
    setEditTitle(session.title);
  };

  const startEditingInstructions = (session: AgentChatSession) => {
    setEditingInstructionsId(session.id);
    setInstructionsText(session.session_instructions || "");
  };

  const saveInstructions = useCallback(async () => {
    if (!editingInstructionsId || !onUpdateSessionInstructions) return;
    setIsSavingInstructions(true);
    try {
      await onUpdateSessionInstructions({
        sessionId: editingInstructionsId,
        instructions: instructionsText.trim() || null,
      });
      setEditingInstructionsId(null);
    } finally {
      setIsSavingInstructions(false);
    }
  }, [editingInstructionsId, instructionsText, onUpdateSessionInstructions]);

  const expanded = isOpen;

  // ── Desktop: Collapsed Icon Strip ──
  if (isDesktop && !expanded) {
    return (
      <>
      <TooltipProvider delayDuration={200}>
        <div
          className={cn(
            "shrink-0 flex flex-col items-center",
            "bg-card/30 backdrop-blur-xl",
            "border-r border-border/30",
            "m-1.5 rounded-glass-container border",
            "transition-[width] duration-200 ease-out",
            "w-[48px] py-3 gap-1",
            "",
          )}
        >
          {/* Bot Avatar */}
          <Tooltip>
            <TooltipTrigger asChild>
              <div
                className={cn(
                  "h-9 w-9 rounded-full flex items-center justify-center shadow-md ring-1 cursor-default",
                  isAdmin
                    ? "bg-gradient-to-br from-amber-500 via-orange-500 to-red-500 shadow-orange-500/25 ring-orange-500/20"
                    : "bg-gradient-to-br from-purple-500 via-indigo-500 to-purple-600 shadow-purple-500/25 ring-purple-500/20",
                )}
              >
                <span className="text-base">{botEmoji}</span>
              </div>
            </TooltipTrigger>
            <TooltipContent side="right" className="text-xs">
              {botName} • {tierDisplay}
            </TooltipContent>
          </Tooltip>

          {/* Divider */}
          <div className="w-6 h-px bg-border/40 my-1" />

          {/* New Chat */}
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={onCreateSession}
                disabled={isCreating}
                className={cn(
                  "h-9 w-9 rounded-full flex items-center justify-center",
                  "hover:bg-primary/10 border border-transparent hover:border-primary/30",
                  "text-muted-foreground hover:text-primary",
                  "transition-all duration-200",
                  "disabled:opacity-50 disabled:cursor-not-allowed",
                )}
              >
                {isCreating ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Plus className="h-4 w-4" />
                )}
              </button>
            </TooltipTrigger>
            <TooltipContent side="right" className="text-xs">New Chat</TooltipContent>
          </Tooltip>

          {/* Recent Sessions (icon list) */}
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="relative h-9 w-9 rounded-full flex items-center justify-center text-muted-foreground/60">
                <History className="h-4 w-4" />
                {sessions.length > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 h-4 min-w-4 px-0.5 rounded-full bg-primary/80 text-[9px] font-bold text-primary-foreground flex items-center justify-center">
                    {sessions.length > 99 ? "99+" : sessions.length}
                  </span>
                )}
              </div>
            </TooltipTrigger>
            <TooltipContent side="right" className="text-xs">
              {sessions.length} conversation{sessions.length !== 1 ? "s" : ""}
            </TooltipContent>
          </Tooltip>

          {/* Scheduled Tasks */}
          {onOpenScheduledTasks && (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={onOpenScheduledTasks}
                  className={cn(
                    "h-9 w-9 rounded-full flex items-center justify-center",
                    "border border-transparent transition-all duration-200",
                    scheduledTasksActive
                      ? "bg-primary/15 text-primary border-primary/30"
                      : "hover:bg-primary/10 hover:border-primary/30 text-muted-foreground hover:text-primary",
                  )}
                  aria-label="Scheduled Tasks"
                >
                  <CalendarClock className="h-4 w-4" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="right" className="text-xs">Scheduled Tasks</TooltipContent>
            </Tooltip>
          )}

          {/* AgentConsultant */}
          {onOpenConsultant && (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={onOpenConsultant}
                  className={cn(
                    "h-9 w-9 rounded-full flex items-center justify-center",
                    "border border-transparent transition-all duration-200",
                    consultantActive
                      ? "bg-primary/15 text-primary border-primary/30"
                      : "hover:bg-primary/10 hover:border-primary/30 text-muted-foreground hover:text-primary",
                  )}
                  aria-label="AgentConsultant"
                >
                  <LineChartIcon className="h-4 w-4" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="right" className="text-xs">AgentConsultant · Strategy</TooltipContent>
            </Tooltip>
          )}

          {/* Spacer */}
          <div className="flex-1" />

          {/* Profile Button */}
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={handleOpenProfile}
                className={cn(
                  "h-9 w-9 rounded-full flex items-center justify-center",
                  "hover:bg-primary/10 border border-transparent hover:border-primary/30",
                  "text-muted-foreground hover:text-primary",
                  "transition-all duration-200",
                )}
              >
                <User className="h-4 w-4" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="right" className="text-xs">Profile</TooltipContent>
          </Tooltip>

          {/* Expand Toggle */}
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={onToggle}
                className={cn(
                  "h-8 w-8 rounded-full flex items-center justify-center",
                  "hover:bg-muted/50 transition-colors",
                  "text-muted-foreground hover:text-foreground",
                )}
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="right" className="text-xs">Expand sidebar</TooltipContent>
          </Tooltip>

          {/* Corner lighting */}
          <div
            className="pointer-events-none absolute inset-x-0 bottom-0 h-32 "
            aria-hidden="true"
            style={{ zIndex: 0 }}
          />
        </div>
      </TooltipProvider>
      {profileOpen && (
        <UserProfileDialog open={profileOpen} onOpenChange={handleCloseProfile} initialTab={profileTab as any} onTabChange={onProfileTabChange} />
      )}
    </>
    );
  }

  // ── Mobile: Hidden when closed ──
  if (!isDesktop && !expanded) {
    return (
      <button
        className={cn(
          "lg:hidden absolute top-20 left-2 z-50",
          "h-8 w-8 rounded-full flex items-center justify-center",
          "bg-card/60 backdrop-blur-sm",
          "border border-border/40",
          "hover:bg-muted/50",
          "transition-all duration-200",
        )}
        onClick={onToggle}
      >
        <ChevronRight className="h-4 w-4 text-muted-foreground" />
      </button>
    );
  }

  // ── Expanded State (Desktop & Mobile) ──
  return (
    <>
      {/* Mobile backdrop overlay — dims chat behind sidebar */}
      {!isDesktop && (
        <div
          className="fixed inset-0 z-30 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200"
          onClick={() => onToggle?.()}
          aria-hidden="true"
        />
      )}
      <div
        className={cn(
          "shrink-0 flex flex-col",
          "border-r border-border/30",
          "lg:m-1.5 lg:rounded-glass-container lg:border",
          "transition-[width] duration-200 ease-out",
          // Mobile: fully opaque dark bg, no bleed-through
          !isDesktop && "absolute inset-y-0 left-0 z-40 w-full bg-[hsl(var(--card))]",
          // Desktop: glassmorphic
          isDesktop && "relative w-72 bg-card/30 backdrop-blur-xl",
        )}
      >
      {/* Identity Block */}
      <div className="p-3 border-b border-border/30">
        <div className="flex items-center gap-2.5 mb-2.5">
          <div
            className={cn(
              "h-9 w-9 rounded-full flex items-center justify-center shadow-md ring-1 shrink-0",
              isAdmin
                ? "bg-gradient-to-br from-amber-500 via-orange-500 to-red-500 shadow-orange-500/25 ring-orange-500/20"
                : "bg-gradient-to-br from-purple-500 via-indigo-500 to-purple-600 shadow-purple-500/25 ring-purple-500/20",
            )}
          >
            <span className="text-lg">{botEmoji}</span>
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold tracking-tight truncate flex items-center gap-1.5">
              {botName}
              {isAdmin ? (
                <Badge
                  variant="destructive"
                  className="text-[8px] px-1 py-0 h-3.5 bg-gradient-to-r from-amber-500 via-orange-500 to-red-500 text-white border-0 shrink-0"
                >
                  <Shield className="h-2 w-2 mr-0.5" /> Super
                </Badge>
              ) : (
                <Badge
                  variant="secondary"
                  className="text-[8px] px-1 py-0 h-3.5 bg-gradient-to-r from-purple-500 to-indigo-500 text-white border-0 shrink-0"
                >
                  <Sparkles className="h-2 w-2 mr-0.5" /> AI
                </Badge>
              )}
            </div>
            <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
              <Badge
                variant="outline"
                className="text-[8px] px-1 py-0 h-3.5 border-muted-foreground/30 text-muted-foreground"
              >
                <Crown className="h-2 w-2 mr-0.5" />
                {tierDisplay}
              </Badge>
              <Badge variant="outline" className="text-[8px] px-1 py-0 h-3.5 border-primary/30 text-primary/80">
                <Cpu className="h-2 w-2 mr-0.5" />
                {modelDisplay}
              </Badge>
            </div>
          </div>
          {/* Close sidebar button (mobile only) */}
          {!isDesktop && (
            <button
              onClick={onToggle}
              className={cn(
                "h-7 w-7 rounded-glass-control flex items-center justify-center shrink-0",
                "bg-muted/30 hover:bg-muted/50",
                "border border-border/30",
                "text-muted-foreground hover:text-foreground",
                "transition-all duration-200",
              )}
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        {/* IU Credits Widget */}
        <IUCreditsWidget
          dailyRemaining={iuRemaining || 0}
          dailyLimit={iuLimit || 0}
          bonus={iuBonus}
          balance={iuBalance}
          isUnlimited={isUnlimited || false}
        />

        {/* New Chat Button */}
        <button
          onClick={onCreateSession}
          disabled={isCreating}
          className={cn(
            "w-full flex items-center justify-center gap-2.5 mt-3",
            "px-3 py-2 rounded-glass-control",
            "bg-muted/30 hover:bg-muted/50",
            "border border-dashed border-primary/40 hover:border-primary/60",
            "text-sm font-medium text-foreground",
            "transition-all duration-200",
            "disabled:opacity-50 disabled:cursor-not-allowed",
          )}
        >
          {isCreating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          New Chat
        </button>

        {/* Scheduled Tasks entry */}
        {onOpenScheduledTasks && (
          <button
            onClick={onOpenScheduledTasks}
            className={cn(
              "w-full flex items-center gap-2.5 mt-2 px-3 py-2 rounded-glass-control",
              "border transition-all duration-200 text-sm font-medium",
              scheduledTasksActive
                ? "bg-primary/10 text-primary border-primary/25 shadow-[0_0_15px_hsl(var(--primary)/0.15)]"
                : "bg-card/20 hover:bg-card/40 border-border/30 hover:border-primary/30 text-foreground",
            )}
          >
            <CalendarClock className={cn("h-4 w-4", scheduledTasksActive ? "text-primary" : "text-amber-400")} />
            <span className="flex-1 text-left">Automate</span>
          </button>
        )}



        {/* AgentConsultant entry */}
        {onOpenConsultant && (
          <button
            onClick={onOpenConsultant}
            className={cn(
              "w-full flex items-center gap-2.5 mt-2 px-3 py-2 rounded-glass-control",
              "border transition-all duration-200 text-sm font-medium",
              consultantActive
                ? "bg-primary/10 text-primary border-primary/25 shadow-[0_0_15px_hsl(var(--primary)/0.15)]"
                : "bg-card/20 hover:bg-card/40 border-border/30 hover:border-primary/30 text-foreground",
            )}
          >
            <LineChartIcon className={cn("h-4 w-4", consultantActive ? "text-primary" : "text-emerald-400")} />
            <span className="flex-1 text-left">AgentConsultant</span>
            <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
              Strategy
            </span>
          </button>
        )}
      </div>
      <div className="px-3 pt-2 pb-1">
        <div className="flex items-center gap-1.5">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/50 pointer-events-none" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={searchMode === 'messages' ? "Search messages..." : "Search chats..."}
              className="h-8 pl-8 pr-8 text-xs bg-muted/20 border-border/30 rounded-glass-control placeholder:text-muted-foreground/40 focus-visible:ring-1 focus-visible:ring-primary/30"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 h-4 w-4 rounded-sm flex items-center justify-center hover:bg-muted/50 text-muted-foreground/50 hover:text-muted-foreground transition-colors"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </div>
          {/* Mode Toggle: Session title ↔ Message content */}
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={() => {
                  setSearchMode(m => m === 'sessions' ? 'messages' : 'sessions');
                  setSearchQuery("");
                }}
                className={cn(
                  "h-8 w-8 rounded-glass-control flex items-center justify-center shrink-0 border transition-all duration-200",
                  searchMode === 'messages'
                    ? "bg-primary/20 border-primary/40 text-primary"
                    : "bg-muted/20 border-border/30 text-muted-foreground hover:bg-muted/40 hover:text-foreground",
                )}
              >
                <FileText className="h-3.5 w-3.5" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="right" className="text-xs">
              {searchMode === 'messages' ? 'Search chat titles' : 'Search message content'}
            </TooltipContent>
          </Tooltip>
        </div>
        {searchQuery && searchMode === 'sessions' && (
          <p className="text-[10px] text-muted-foreground/50 mt-1 px-1">
            {filteredSessions.length} result{filteredSessions.length !== 1 ? 's' : ''}
          </p>
        )}
        {searchQuery && searchMode === 'messages' && (
          <p className="text-[10px] text-muted-foreground/50 mt-1 px-1">
            {isSearchingMessages ? 'Searching...' : `${messageResults.length} message result${messageResults.length !== 1 ? 's' : ''}`}
          </p>
        )}
      </div>

      {/* Sessions List */}
      <ScrollArea className="flex-1 overscroll-contain">
        {searchMode === 'messages' && searchQuery.trim() ? (
          /* ── Message Search Results ── */
          <div className="p-2 space-y-1">
            <p className="text-[11px] font-semibold text-muted-foreground/70 px-3 py-1.5 uppercase tracking-wide">
              Message Results
            </p>
            {isSearchingMessages ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : messageResults.length === 0 ? (
              <div className="text-center py-8 px-4">
                <FileText className="h-8 w-8 mx-auto text-muted-foreground/30 mb-2" />
                <p className="text-xs text-muted-foreground/70">No messages found</p>
                <p className="text-[10px] text-muted-foreground/50 mt-1">Try a different keyword</p>
              </div>
            ) : (
              messageResults.map((result) => (
                <button
                  key={result.id}
                  onClick={() => { onSelectSession(result.session_id); if (!isDesktop) onToggle(); }}
                  className={cn(
                    "w-full text-left rounded-glass-control px-3 py-2.5 transition-all duration-200 border",
                    activeSessionId === result.session_id
                      ? "bg-primary/10 border-primary/30 text-foreground"
                      : "border-transparent text-muted-foreground hover:bg-muted/30 hover:text-foreground",
                  )}
                >
                  <div className="flex items-center gap-1.5 mb-1">
                    <MessageSquare className="h-3 w-3 text-primary/60 shrink-0" />
                    <span className="text-[11px] font-medium truncate flex-1">{result.session_title}</span>
                  </div>
                  <p className="text-[10px] leading-relaxed line-clamp-2 opacity-70">
                    {result.content.length > 120 ? result.content.slice(0, 120) + '…' : result.content}
                  </p>
                  <p className="text-[9px] opacity-40 mt-1.5">
                    {new Date(result.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                  </p>
                </button>
              ))
            )}
          </div>
        ) : (
          <>
            {/* History Header — aligned to same horizontal padding as list items */}
            <button
              onClick={() => setHistoryOpen((v) => !v)}
              className={cn(
                "w-full flex items-center gap-2 px-3 py-2.5 sticky top-0 z-10",
                "bg-transparent",
                "transition-colors duration-200",
                "cursor-pointer select-none",
              )}
            >
              <span className="text-[11px] font-semibold text-muted-foreground/80 tracking-wider uppercase">
                History
              </span>
              <ChevronDown
                className={cn(
                  "h-3.5 w-3.5 text-muted-foreground/50 transition-transform duration-200",
                  !historyOpen && "-rotate-90",
                )}
              />
            </button>

            {/* Collapsible Session List — uniform px-2 outer, inner items align to same left edge as group label */}
            <div
              className={cn(
                "overflow-hidden transition-all duration-300 ease-in-out",
                historyOpen ? "max-h-[2000px] opacity-100" : "max-h-0 opacity-0",
              )}
            >
              <div className="px-2 pb-2 pt-1 space-y-3">
                {isLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                  </div>
                ) : sessions.length === 0 ? (
                  <div className="text-center py-8 px-4">
                    <MessageSquare className="h-8 w-8 mx-auto text-muted-foreground/30 mb-2" />
                    <p className="text-xs text-muted-foreground/70">No conversations yet</p>
                    <p className="text-[10px] text-muted-foreground/50 mt-1">Start a new chat above</p>
                  </div>
                ) : (
                  Object.entries(groupedSessions).map(([group, groupSessions]) => (
                    <div key={group} className="space-y-1">
                      {/* Group label aligned with item content (px-2.5 inside px-2 parent matches item left edge) */}
                      <p className="text-[10px] font-semibold text-muted-foreground/60 px-2.5 py-1 uppercase tracking-wider">
                        {group}
                      </p>
                      <div className="space-y-0.5">
                        {groupSessions.map((session) => (
                          <div
                            key={session.id}
                            className={cn(
                              "group relative flex items-center w-full min-w-0 gap-1 rounded-glass-control pl-2.5 pr-1 py-2 border",
                              "hover:bg-muted/30 transition-all duration-200 cursor-pointer",
                              activeSessionId === session.id
                                ? "bg-primary/10 border-primary/30 text-foreground"
                                : "text-muted-foreground hover:text-foreground border-transparent",
                            )}
                            onClick={() => { onSelectSession(session.id); if (!isDesktop) onToggle(); }}
                          >
                            {editingId === session.id ? (
                              <Input
                                value={editTitle}
                                onChange={(e) => setEditTitle(e.target.value)}
                                onBlur={() => handleRename(session.id)}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") handleRename(session.id);
                                  if (e.key === "Escape") {
                                    setEditingId(null);
                                    setEditTitle("");
                                  }
                                }}
                                className="h-6 text-sm py-0 px-1 bg-muted/50 border-border/40 min-w-0 flex-1"
                                autoFocus
                                onClick={(e) => e.stopPropagation()}
                              />
                            ) : (
                              <span
                                className="flex-1 min-w-0 text-sm truncate block"
                                title={session.title}
                              >
                                {session.title.replace(/\[Heartbeat\]/g, "💓")}
                              </span>
                            )}

                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <button
                                  className={cn(
                                    "h-6 w-6 rounded-glass-control flex items-center justify-center shrink-0",
                                    "opacity-0 group-hover:opacity-100 max-lg:opacity-70",
                                    activeSessionId === session.id && "!opacity-100",
                                    "hover:bg-muted/50",
                                    "transition-all duration-150",
                                  )}
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  <MoreHorizontal className="h-3.5 w-3.5" />
                                </button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent
                                align="end"
                                className="w-40 bg-card/95 backdrop-blur-xl border-border/40"
                              >
                                <DropdownMenuItem
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    startEditing(session);
                                  }}
                                  className="text-sm"
                                >
                                  <Pencil className="h-3.5 w-3.5 mr-2" />
                                  Rename
                                </DropdownMenuItem>
                                {onUpdateSessionInstructions && (
                                  <DropdownMenuItem
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      startEditingInstructions(session);
                                    }}
                                    className="text-sm"
                                  >
                                    <StickyNote className="h-3.5 w-3.5 mr-2" />
                                    Instructions
                                    {session.session_instructions && (
                                      <span className="ml-auto h-1.5 w-1.5 rounded-full bg-primary shrink-0" />
                                    )}
                                  </DropdownMenuItem>
                                )}
                                <DropdownMenuItem
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    void exportSessionMessages(session, "markdown");
                                  }}
                                  className="text-sm"
                                >
                                  <Download className="h-3.5 w-3.5 mr-2" />
                                  Export as Markdown
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    void exportSessionMessages(session, "json");
                                  }}
                                  className="text-sm"
                                >
                                  <FileJson className="h-3.5 w-3.5 mr-2" />
                                  Export as JSON
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  className="text-destructive focus:text-destructive text-sm"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    onDeleteSession(session.id);
                                  }}
                                >
                                  <Trash2 className="h-3.5 w-3.5 mr-2" />
                                  Delete
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </>
        )}
      </ScrollArea>

      {/* Session Instructions Inline Editor */}
      {editingInstructionsId && (
        <div className="shrink-0 border-t border-primary/30 bg-primary/5 p-3 z-10">
          <div className="flex items-center gap-1.5 mb-2">
            <StickyNote className="h-3.5 w-3.5 text-primary/70" />
            <span className="text-xs font-semibold text-foreground">Session Instructions</span>
            <button
              onClick={() => setEditingInstructionsId(null)}
              className="ml-auto h-5 w-5 rounded flex items-center justify-center hover:bg-muted/50 text-muted-foreground hover:text-foreground transition-colors"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
          <p className="text-[10px] text-muted-foreground/60 mb-2 leading-relaxed">
            This context is injected into every message in this session. Use it to set goals, persona, or project scope.
          </p>
          <textarea
            value={instructionsText}
            onChange={(e) => setInstructionsText(e.target.value)}
            placeholder="e.g. Always reply in Burmese. This session is about my startup pitch deck..."
            rows={4}
            className={cn(
              "w-full text-xs resize-none rounded-glass-control p-2.5",
              "bg-muted/30 border border-border/40",
              "text-foreground placeholder:text-muted-foreground/40",
              "focus:outline-none focus:ring-1 focus:ring-primary/40",
              "transition-colors duration-150",
            )}
          />
          <div className="flex gap-2 mt-2">
            <button
              onClick={saveInstructions}
              disabled={isSavingInstructions}
              className={cn(
                "flex-1 flex items-center justify-center gap-1.5 h-7 rounded-glass-control text-xs font-medium",
                "bg-primary/80 hover:bg-primary text-primary-foreground",
                "transition-colors duration-150 disabled:opacity-50",
              )}
            >
              {isSavingInstructions ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Check className="h-3 w-3" />
              )}
              Save
            </button>
            <button
              onClick={() => setEditingInstructionsId(null)}
              className="px-3 h-7 rounded-glass-control text-xs text-muted-foreground hover:text-foreground hover:bg-muted/40 border border-border/30 transition-colors duration-150"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Footer with Profile + Collapse Toggle */}
      <div className="shrink-0 border-t border-border/30 p-2 flex items-center justify-between">
        <button
          onClick={handleOpenProfile}
          className={cn(
            "flex items-center gap-2 px-2.5 py-1.5 rounded-full",
            "hover:bg-muted/50 transition-all duration-200",
            "text-muted-foreground hover:text-foreground",
          )}
        >
          <User className="h-4 w-4" />
          <span className="text-xs font-medium">Profile</span>
        </button>
        <button
          onClick={onToggle}
          className={cn(
            "hidden lg:flex h-8 w-8 rounded-full items-center justify-center",
            "hover:bg-muted/50 transition-colors",
            "text-muted-foreground hover:text-foreground",
          )}
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
      </div>

      {profileOpen && (
        <UserProfileDialog open={profileOpen} onOpenChange={handleCloseProfile} initialTab={profileTab as any} onTabChange={onProfileTabChange} />
      )}

    </div>
    </>
  );
}
