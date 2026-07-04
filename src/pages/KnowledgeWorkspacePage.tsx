import { lazy, Suspense, useCallback, useDeferredValue, useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent } from "react";
import { useLocation, useSearchParams } from "react-router-dom";
import { Icon } from "@iconify/react";
import { ChatRoundLine, List as SolarList, LinkRound, Notebook, Magnifer, BranchingPathsDown, MagicStick3, Settings as SolarSettings, UserCircle, Pen, FolderPathConnect, Tuning2, Refresh } from "@solar-icons/react";
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  Bold,
  BookOpen,
  Bot,
  Check,
  Clock,
  ChevronLeft,
  ChevronRight,

  Columns,
  Command,
  ExternalLink,
  Copy,
  Code2,
  FileText,
  Folder,
  FolderInput,
  FolderPlus,
  FolderOpen,
  HardDrive,
  Heading1,
  Italic,
  Keyboard,
  KeyRound,
  LayoutPanelLeft,
  Link2,
  List,
  ListOrdered,
  ListTodo,
  Minus,
  MoreHorizontal,
  PanelRightClose,
  PanelRightOpen,
  Plus,

  Quote,

  Rows,
  Search,
  Settings,
  ShieldCheck,


  SplitSquareHorizontal,
  Star,
  Trash2,
  Type,
  Waypoints,
  X,
  History,
  RotateCcw,
  ArrowLeft,
  Eye,
  EyeOff,
} from "lucide-react";
import {
  IconBook2,
  IconChevronDown,
  IconChevronLeft,
  IconChevronRight,
  IconDots,
  IconEdit,
  IconFileText,
  IconFolderOpen,
  IconFolderPlus,
  IconLayoutSidebarLeftCollapse,
  IconLayoutSidebarLeftExpand,
  IconLayoutSidebarRightCollapse,
  IconLayoutSidebarRightExpand,
  IconPlus,
  IconRefresh,
  IconSearch,
  IconSettings,
  IconSparkles,
  IconColumns as IconSplitColumns,
  IconX,
} from "@tabler/icons-react";
import { toast } from "sonner";
import { AgentMarkdownContent } from "@/components/agent-chat/AgentMarkdownContent";
import type { LiveEditorHandle } from "@/components/editor/LiveMarkdownEditor";
// Split CodeMirror (~300KB) into its own chunk so the workspace shell loads first.
const LiveMarkdownEditor = lazy(() => import("@/components/editor/LiveMarkdownEditor").then((m) => ({ default: m.LiveMarkdownEditor })));
const NoteReader = lazy(() => import("@/components/editor/NoteReader").then((m) => ({ default: m.NoteReader })));
// Force-directed graph view — only loaded when the user opens #graph.
const GraphView = lazy(() => import("@/components/editor/GraphView").then((m) => ({ default: m.GraphView })));
// Personal CFO (FlowState) — heavy finance surface, only loaded on demand via #cfo.
const FlowStateDialog = lazy(() => import("@/components/dashboard/FlowStateDialog").then((m) => ({ default: m.FlowStateDialog })));
const AgentConsultantPanel = lazy(() => import("@/components/agent-chat/consultant/AgentConsultantPanel").then((m) => ({ default: m.AgentConsultantPanel })));
import { fsaStore, isFileSystemAccessSupported } from "@/repositories/local/fileSystemAccess";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { jarvisEnabled, jarvisModels, jarvisLiveMode, jarvisWakeWord, geminiKey } from "@/components/jarvis/jarvisBrain";
import { cn } from "@/lib/utils";
import { platformFileManager } from "@/lib/desktopChrome";
import { applyAccent } from "@/lib/accentColor";
import { applyThemeVariables } from "@/lib/theme/themeEngine";
import { themeStore } from "@/repositories/local/themeStore";
import { noteOrder } from "@/repositories/local/noteOrderStore";
import { sortVaultEntries } from "@/features/notes/sortEntries";
import { ThemeStorePanel } from "@/components/settings/ThemeStorePanel";
import { ThemeEditorDialog } from "@/components/settings/ThemeEditorDialog";
import { VersionCheck } from "@/components/settings/VersionCheck";
import { useWorkspaceIdentity } from "@/hooks/useWorkspaceIdentity";
import { useIsMobile } from "@/hooks/use-mobile";
import { useRepositories } from "@/repositories/runtime/RepositoryProvider";
import type { NoteFile, NoteVersion, VaultEntry } from "@/repositories/contracts/notes";
import { NoteTree } from "@/features/notes/sidebar/NoteTree";
import { SidebarHeader } from "@/features/notes/sidebar/SidebarHeader";
import { AppNav } from "@/features/notes/sidebar/AppNav";
import { BookmarksSection } from "@/features/notes/sidebar/BookmarksSection";
import { useNoteTree } from "@/features/notes/sidebar/useNoteTree";
import { BacklinksPane } from "@/features/notes/backlinks/BacklinksPane";
import { TabStrip } from "@/features/notes/tabs/TabStrip";
import { ChromeCluster } from "@/features/notes/chrome/ChromeCluster";
import type { SidebarActions } from "@/features/notes/sidebar/types";
import type { SearchResult } from "@/repositories/contracts/search";
import type { InstalledSkill, SkillRegistrySummary } from "@/repositories/contracts/skills";
import type { VaultInfo } from "@/repositories/contracts/vault";

const BeeBotChatView = lazy(() =>
  import("@/components/agent-chat/BeeBotChatView").then((m) => ({
    default: m.BeeBotChatView,
  })),
);

type EditorMode = "edit" | "preview";
type SplitLayout = "right" | "down" | null;
type SettingsPane = "general" | "editor" | "files" | "appearance" | "sync" | "skills";

const SETTINGS_META: Record<SettingsPane, { title: string; subtitle: string }> = {
  general: { title: "General", subtitle: "Workspace, vault, and account basics." },
  editor: { title: "Editor", subtitle: "How notes open, edit, and read." },
  files: { title: "Files and links", subtitle: "Where notes live and how they are indexed." },
  appearance: { title: "Appearance", subtitle: "Theme, accent color, fonts, and density." },
  sync: { title: "Sync", subtitle: "Optional encrypted sync, publishing, and backup." },
  skills: { title: "Skills", subtitle: "Permissioned capabilities that extend BeeBot." },
};

const SETTINGS_GROUPS: { label: string; ids: SettingsPane[] }[] = [
  { label: "Workspace", ids: ["general", "editor", "files", "appearance"] },
  { label: "Intelligence", ids: ["skills", "sync"] },
];
type FontTarget = "interfaceFonts" | "textFonts" | "monospaceFonts";
type WorkspaceAppearanceSettings = {
  accentColor: string;
  theme: "dark" | "light" | "system";
  customThemeId: string | null;
  colorCustomizations: Record<string, string>;
  interfaceFonts: string[];
  textFonts: string[];
  monospaceFonts: string[];
  fontSize: number;
  readableLineLength: boolean;
  showRibbon: boolean;
  ribbonItems: string[];
  showSkillsButton: boolean;
  showPanelButton: boolean;
  nativeMenus: boolean;
  spellcheck: boolean;
  autoPairBrackets: boolean;
  smartLists: boolean;
  foldHeading: boolean;
  foldIndent: boolean;
  syncEnabled: boolean;
};
type MarkdownCommand =
  | "bold"
  | "italic"
  | "strikethrough"
  | "highlight"
  | "link"
  | "inline-code"
  | "math"
  | "comment"
  | "clear"
  | "code-block"
  | "math-block"
  | "bullet-list"
  | "numbered-list"
  | "task-list"
  | "quote"
  | "callout"
  | "body"
  | "footnote"
  | "table"
  | "horizontal-rule"
  | `heading-${1 | 2 | 3 | 4 | 5 | 6}`;

const DEFAULT_RIBBON_ITEMS = ["files", "new-note", "new-folder", "search", "graph", "command-palette", "skills"];
const BOOKMARKS_STORAGE_KEY = "workspace.bookmarks";

const DEFAULT_APPEARANCE_SETTINGS: WorkspaceAppearanceSettings = {
  accentColor: "#f4d35e",
  theme: "dark",
  customThemeId: null, // Fresh installs start on the pristine System Default; Flat Dark is opt-in
  colorCustomizations: {},
  interfaceFonts: ["Inter", "SF Pro Text", "Helvetica Neue", "Arial"],
  textFonts: ["Z06-Walone", "Inter", "SF Pro Text", "Helvetica Neue", "Arial"],
  monospaceFonts: ["SF Mono", "Menlo", "Monaco", "Consolas", "monospace"],
  fontSize: 16,
  readableLineLength: true,
  showRibbon: false,
  ribbonItems: DEFAULT_RIBBON_ITEMS,
  showSkillsButton: false, // header chrome buttons hidden by default; opt-in via Settings
  showPanelButton: false,
  nativeMenus: true,
  spellcheck: true,
  autoPairBrackets: true,
  smartLists: true,
  foldHeading: true,
  foldIndent: true,
  syncEnabled: false,
};

const FONT_SUGGESTIONS = [
  "Inter",
  "SF Pro Text",
  "SF Pro Display",
  "New York",
  "Helvetica Neue",
  "Arial",
  "Avenir Next",
  "Z06-Walone",
  "Myanmar Sangam MN",
  "Noto Sans Myanmar",
  "Pyidaungsu",
  "Menlo",
  "SF Mono",
  "Monaco",
  "Consolas",
  "American Typewriter",
  "Apple SD Gothic Neo",
  "Academy Engraved LET",
];

const SETTINGS_STORAGE_KEY = "workspace.appearance";

function createUntitledPath(existing: NoteFile[], folder = "") {
  const paths = new Set(existing.map((note) => note.path));
  let index = 1;
  const prefix = folder ? `${folder.replace(/\/+$/g, "")}/` : "";
  while (paths.has(`${prefix}Untitled ${index}.md`)) index += 1;
  return `${prefix}Untitled ${index}.md`;
}

function titleFromPath(notePath: string) {
  return notePath.split("/").pop()?.replace(/\.md$/i, "") || notePath;
}

// First non-empty line of a note's content, with an optional "# " heading marker
// stripped (mirrors electron/local-runtime.mjs extractHeadingTitle + titleFromContent).
// flushTitleSync uses it for a cheap RAW compare against the filename; the backend
// stays authoritative for the actual sanitize + collision, so there's deliberately
// no client-side filename-sanitize mirror to drift out of sync.
function firstLineTitle(content: string): string | null {
  const body = content.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, "");
  const firstLine = body.split("\n").find((line) => line.trim().length > 0);
  return firstLine?.replace(/^#{1,6}\s+/, "").trim() || null;
}

// Wikilink helpers shared between editor wiring + backlinks index.
const WIKILINK_RE_GLOBAL = /\[\[([^[\]\r\n|]+)(?:\|[^[\]\r\n]*)?\]\]/g;
function parseWikilinks(content: string): string[] {
  const targets: string[] = [];
  if (!content) return targets;
  WIKILINK_RE_GLOBAL.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = WIKILINK_RE_GLOBAL.exec(content)) !== null) targets.push(match[1].trim());
  return targets;
}
function resolveWikilinkTarget(target: string, notes: NoteFile[]): NoteFile | null {
  if (!target) return null;
  const needle = target.toLowerCase();
  return (
    notes.find((note) => (note.title || "").toLowerCase() === needle) ||
    notes.find((note) => titleFromPath(note.path).toLowerCase() === needle) ||
    notes.find((note) => note.path.toLowerCase().endsWith(`/${needle}.md`) || note.path.toLowerCase() === `${needle}.md`) ||
    null
  );
}

function folderFromPath(notePath: string) {
  const segments = notePath.split("/");
  segments.pop();
  return segments.join("/");
}

function parentFromPath(entryPath: string) {
  const segments = entryPath.split("/");
  segments.pop();
  return segments.join("/");
}

function basenameFromPath(entryPath: string) {
  return entryPath.split("/").pop() || entryPath;
}

function joinVaultPath(folder: string, name: string) {
  const cleanedName = name.trim().replace(/^\/+|\/+$/g, "");
  if (!folder) return cleanedName;
  return `${folder.replace(/\/+$/g, "")}/${cleanedName}`;
}

function fontStack(fonts: string[]) {
  return fonts.map((font) => (font.includes(" ") ? `"${font}"` : font)).join(", ");
}

function uniqueFonts(fonts: Array<string | null | undefined>) {
  const seen = new Set<string>();
  const next: string[] = [];
  for (const rawFont of fonts) {
    const font = rawFont?.trim().replace(/\s+/g, " ");
    if (!font) continue;
    const key = font.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    next.push(font);
  }
  return next;
}

function firstAvailableFont(fonts: string[]) {
  if (typeof document === "undefined" || !document.fonts) return fonts[0] || "system-ui";
  return fonts.find((font) => document.fonts.check(`14px "${font}"`)) || fonts[0] || "system-ui";
}

function mergeAppearanceSettings(input: WorkspaceAppearanceSettings | Partial<WorkspaceAppearanceSettings> | null) {
  return {
    ...DEFAULT_APPEARANCE_SETTINGS,
    ...(input || {}),
    interfaceFonts: input?.interfaceFonts?.length ? input.interfaceFonts : DEFAULT_APPEARANCE_SETTINGS.interfaceFonts,
    textFonts: input?.textFonts?.length ? input.textFonts : DEFAULT_APPEARANCE_SETTINGS.textFonts,
    monospaceFonts: input?.monospaceFonts?.length ? input.monospaceFonts : DEFAULT_APPEARANCE_SETTINGS.monospaceFonts,
    // Persist user's ribbon order, then append any default IDs that aren't there yet.
    // Lets newly-shipped ribbon actions automatically appear without losing custom order.
    ribbonItems: input?.ribbonItems?.length
      ? [...input.ribbonItems, ...DEFAULT_APPEARANCE_SETTINGS.ribbonItems.filter((id) => !input.ribbonItems!.includes(id))]
      : DEFAULT_APPEARANCE_SETTINGS.ribbonItems,
  };
}

function formatStatus(note: NoteFile | null, isDirty: boolean, isSaving: boolean) {
  if (isSaving) return "Saving…";
  if (isDirty) return "Unsaved";
  if (!note?.mtimeMs) return "Ready";
  const when = new Date(note.mtimeMs);
  const now = new Date();
  const sameDay = when.getFullYear() === now.getFullYear() && when.getMonth() === now.getMonth() && when.getDate() === now.getDate();
  const diffSec = (now.getTime() - when.getTime()) / 1000;
  if (sameDay) {
    if (diffSec < 60) return "Saved just now";
    if (diffSec < 3600) return `Saved ${Math.round(diffSec / 60)} min ago`;
    return `Saved ${when.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`;
  }
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const isYesterday = when.getFullYear() === yesterday.getFullYear() && when.getMonth() === yesterday.getMonth() && when.getDate() === yesterday.getDate();
  if (isYesterday) return `Saved yesterday`;
  if (diffSec < 60 * 60 * 24 * 7) return `Saved ${when.toLocaleDateString([], { weekday: "short" })}`;
  return `Saved ${when.toLocaleDateString([], { month: "short", day: "numeric" })}`;
}

// Absolute + relative label for a version snapshot timestamp.
function formatVersionTime(mtimeMs: number) {
  const when = new Date(mtimeMs);
  const diffSec = (Date.now() - mtimeMs) / 1000;
  const rel = diffSec < 60 ? "just now"
    : diffSec < 3600 ? `${Math.round(diffSec / 60)} min ago`
      : diffSec < 86400 ? `${Math.round(diffSec / 3600)} hr ago`
        : `${Math.round(diffSec / 86400)} d ago`;
  const abs = when.toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  return `${abs} · ${rel}`;
}

export default function KnowledgeWorkspacePage() {
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const { userId, ready } = useWorkspaceIdentity();
  const { notes, search, vault, skills, settings } = useRepositories();
  const [activeVault, setActiveVault] = useState<VaultInfo | null>(null);
  const [recentVaults, setRecentVaults] = useState<VaultInfo[]>([]);
  const [skillList, setSkillList] = useState<InstalledSkill[]>([]);
  const [skillSummary, setSkillSummary] = useState<SkillRegistrySummary | null>(null);
  const [noteList, setNoteList] = useState<NoteFile[]>([]);
  const [entryList, setEntryList] = useState<VaultEntry[]>([]);
  const [activePath, setActivePath] = useState<string | null>(null);
  const [activeNote, setActiveNote] = useState<NoteFile | null>(null);
  // Always-current snapshot of activePath for use inside stable callbacks /
  // long-lived subscriptions (e.g. watchNotes), which would otherwise capture a
  // stale activePath from their first-render closure and reset the selection.
  const activePathRef = useRef<string | null>(null);
  activePathRef.current = activePath;
  const [openTabs, setOpenTabs] = useState<string[]>([]);
  const [splitLayout, setSplitLayout] = useState<SplitLayout>(null);
  const [splitPath, setSplitPath] = useState<string | null>(null);
  const [splitNote, setSplitNote] = useState<NoteFile | null>(null);
  // Stale-closure-safe snapshots for the blur-driven title→filename sync
  // (the blur handler is a long-lived editor callback — see watchNotes note above).
  const activeNoteRef = useRef<NoteFile | null>(null);
  const draftRef = useRef("");
  const titleSyncingRef = useRef(false);
  const draftCommitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [draft, setDraft] = useState("");
  activeNoteRef.current = activeNote;
  // `draftRef` is the always-live text (autosave + title-sync read it). It is kept
  // current by the two setters below, NOT at render time — so debouncing the heavy
  // React re-render never leaves the save path with stale content.
  // Programmatic set (note open / clear): commit immediately, cancel any pending typing commit.
  const setDraftImmediate = useCallback((content: string) => {
    draftRef.current = content;
    if (draftCommitTimerRef.current) clearTimeout(draftCommitTimerRef.current);
    setDraft(content);
  }, []);
  // Editor keystrokes: keep the ref live instantly, but DEBOUNCE the React state
  // commit (~180ms) so the 3,600-line workspace tree doesn't re-render every keystroke.
  const onEditorType = useCallback((md: string) => {
    draftRef.current = md;
    if (draftCommitTimerRef.current) clearTimeout(draftCommitTimerRef.current);
    draftCommitTimerRef.current = setTimeout(() => setDraft(md), 180);
  }, []);
  const [query, setQuery] = useState("");
  const [newVaultName, setNewVaultName] = useState("BeeBot Vault");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [editorMode, setEditorMode] = useState<EditorMode>("edit");
  const [railOpen, setRailOpen] = useState(false);
  const [railTab, setRailTab] = useState<"assistant" | "outline" | "links">("assistant");
  const agentOpen = railOpen && railTab === "assistant";
  const backlinksOpen = railOpen && railTab === "links";
  const setAgentOpen = (open: boolean | ((prev: boolean) => boolean)) => {
    setRailOpen((prev) => {
      const nextOpen = typeof open === "function" ? open(prev && railTab === "assistant") : open;
      if (nextOpen) setRailTab("assistant");
      return nextOpen;
    });
  };
  const setBacklinksOpen = (open: boolean | ((prev: boolean) => boolean)) => {
    setRailOpen((prev) => {
      const nextOpen = typeof open === "function" ? open(prev && railTab === "links") : open;
      if (nextOpen) setRailTab("links");
      return nextOpen;
    });
  };
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [createVaultOpen, setCreateVaultOpen] = useState(false);
  const [skillsOpen, setSkillsOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsPane, setSettingsPane] = useState<SettingsPane>("general");
  const [settingsSearch, setSettingsSearch] = useState("");
  const [commandOpen, setCommandOpen] = useState(false);
  // Hash-routed search modal: lazy mount, history-aware, zero idle cost.
  const [searchModalOpen, setSearchModalOpen] = useState(() => typeof window !== "undefined" && window.location.hash === "#search");
  // Hash-routed graph view — same lazy + history-aware pattern.
  const [graphOpen, setGraphOpen] = useState(() => typeof window !== "undefined" && window.location.hash === "#graph");
  // Hash-routed version history (local File Recovery) for the active note.
  const [historyOpen, setHistoryOpen] = useState(() => typeof window !== "undefined" && window.location.hash === "#history");
  // Hash-routed Personal CFO (FlowState finance surface).
  const [cfoOpen, setCfoOpen] = useState(() => typeof window !== "undefined" && window.location.hash === "#cfo");
  // Hash-routed Agent Consultant — opens as a full-screen page (not the agent rail).
  const [consultantOpen, setConsultantOpen] = useState(() => typeof window !== "undefined" && window.location.hash === "#consultant");
  const [versions, setVersions] = useState<NoteVersion[]>([]);
  const [versionsLoading, setVersionsLoading] = useState(false);

  // Resizable panes (Codex-style). Widths persist in localStorage so a user's
  // layout survives reloads. Constraints prevent panes collapsing to unusable.
  const SIDEBAR_W_KEY = "workspace.layout.sidebarWidth";
  const AGENT_W_KEY = "workspace.layout.agentWidth";
  const LAST_NOTE_KEY = "workspace.lastNote"; // remember the open file across reload / close-reopen
  const SIDEBAR_MIN = 200, SIDEBAR_MAX = 520, SIDEBAR_DEFAULT = 268;
  const AGENT_MIN = 300, AGENT_MAX = 720, AGENT_DEFAULT = 348;
  const [sidebarWidth, setSidebarWidth] = useState<number>(() => {
    if (typeof window === "undefined") return SIDEBAR_DEFAULT;
    const v = Number(localStorage.getItem(SIDEBAR_W_KEY));
    return Number.isFinite(v) && v >= SIDEBAR_MIN && v <= SIDEBAR_MAX ? v : SIDEBAR_DEFAULT;
  });
  const [agentWidth, setAgentWidth] = useState<number>(() => {
    if (typeof window === "undefined") return AGENT_DEFAULT;
    const v = Number(localStorage.getItem(AGENT_W_KEY));
    return Number.isFinite(v) && v >= AGENT_MIN && v <= AGENT_MAX ? v : AGENT_DEFAULT;
  });
  // Track active drag so we can disable the width transition (avoids lag) AND
  // apply a global pointer-events cursor during the drag.
  const [resizing, setResizing] = useState<"sidebar" | "agent" | null>(null);
  useEffect(() => { localStorage.setItem(SIDEBAR_W_KEY, String(sidebarWidth)); }, [sidebarWidth]);
  useEffect(() => { localStorage.setItem(AGENT_W_KEY, String(agentWidth)); }, [agentWidth]);
  useEffect(() => { if (activePath) localStorage.setItem(LAST_NOTE_KEY, activePath); }, [activePath]); // persist last-open file
  // While resizing: lock body cursor + disable text selection so dragging across
  // the editor or sidebar doesn't grab focus or paint a text selection.
  useEffect(() => {
    if (!resizing) return;
    const { cursor, userSelect } = document.body.style;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    return () => {
      document.body.style.cursor = cursor;
      document.body.style.userSelect = userSelect;
    };
  }, [resizing]);
  // Start a drag. Captures the pointer so the handle keeps receiving moves
  // even if the user drags off the 1px hairline.
  const beginResize = useCallback((which: "sidebar" | "agent", event: ReactPointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    // setPointerCapture throws if there's no active pointer (synthetic events,
    // some embedded webviews) — capture isn't critical because we listen at
    // window, so swallow the error to keep the drag working.
    try { (event.currentTarget as HTMLElement).setPointerCapture?.(event.pointerId); } catch { /* noop */ }
    setResizing(which);
    const startX = event.clientX;
    const startW = which === "sidebar" ? sidebarWidth : agentWidth;
    const minW = which === "sidebar" ? SIDEBAR_MIN : AGENT_MIN;
    const maxW = which === "sidebar" ? SIDEBAR_MAX : AGENT_MAX;
    const dir = which === "sidebar" ? 1 : -1; // agent grows when dragged left
    const onMove = (ev: PointerEvent) => {
      const delta = (ev.clientX - startX) * dir;
      const next = Math.min(maxW, Math.max(minW, startW + delta));
      if (which === "sidebar") setSidebarWidth(next);
      else setAgentWidth(next);
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      setResizing(null);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }, [sidebarWidth, agentWidth]);
  const [bookmarks, setBookmarks] = useState<string[]>([]);
  const [noteContents, setNoteContents] = useState<Record<string, string>>({});
  const backlinkBackfilledRef = useRef(false);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const [appearanceSettings, setAppearanceSettings] = useState<WorkspaceAppearanceSettings>(DEFAULT_APPEARANCE_SETTINGS);
  const [jarvisOn, setJarvisOn] = useState(() => jarvisEnabled.get());
  const [jarvisBrainModel, setJarvisBrainModel] = useState(() => jarvisModels.brain());
  const [jarvisTtsModel, setJarvisTtsModel] = useState(() => jarvisModels.tts());
  const [jarvisLive, setJarvisLive] = useState(() => jarvisLiveMode.get());
  const [jarvisLiveModel, setJarvisLiveModel] = useState(() => jarvisModels.live());
  const [jarvisWake, setJarvisWake] = useState(() => jarvisWakeWord.get());
  // JARVIS Gemini API key management — view (masked), edit, save, clear. Never expose the raw key
  // in plaintext by default; toggle reveals it only on explicit user action.
  const [jarvisKeyEditing, setJarvisKeyEditing] = useState(false);
  const [jarvisKeyDraft, setJarvisKeyDraft] = useState("");
  const [jarvisKeyReveal, setJarvisKeyReveal] = useState(false);
  const hasJarvisKey = !!geminiKey.get();
  const [editingThemeId, setEditingThemeId] = useState<string | null>(null);
  const [isThemeEditorOpen, setIsThemeEditorOpen] = useState(false);
  const [fontTarget, setFontTarget] = useState<FontTarget | null>(null);
  const [fontInput, setFontInput] = useState("");
  const [fontSearch, setFontSearch] = useState("");
  const [systemFonts, setSystemFonts] = useState<string[]>(FONT_SUGGESTIONS);
  const [fontsLoading, setFontsLoading] = useState(false);
  const [fontPermission, setFontPermission] = useState<"unknown" | "granted" | "prompt" | "denied" | "unsupported">("unknown");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isVaultBusy, setIsVaultBusy] = useState(false);
  const [isSkillBusy, setIsSkillBusy] = useState(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const editorInstanceRef = useRef<LiveEditorHandle | null>(null);
  const [fsaSupported] = useState(() => isFileSystemAccessSupported());
  const [needsReopenFolder, setNeedsReopenFolder] = useState(false);
  const isMobile = useIsMobile();
  const [mobileView, setMobileView] = useState<"files" | "editor" | "agent">("files");
  const [agentEverOpened, setAgentEverOpened] = useState(false);
  useEffect(() => {
    if (railOpen && railTab === "assistant") {
      setAgentEverOpened(true);
    }
  }, [railOpen, railTab]);
  // In-app prompt/confirm dialogs (native window.prompt/confirm are blocked in
  // sandboxed/embedded webviews, which silently broke folder create/rename/delete).
  const [promptDialog, setPromptDialog] = useState<{ title: string; description?: string; placeholder?: string; confirmLabel: string } | null>(null);
  const [promptValue, setPromptValue] = useState("");
  const promptResolverRef = useRef<((value: string | null) => void) | null>(null);
  const [confirmDialog, setConfirmDialog] = useState<{ title: string; description?: string; destructive?: boolean; confirmLabel: string } | null>(null);
  const confirmResolverRef = useRef<((ok: boolean) => void) | null>(null);

  const askInput = useCallback((opts: { title: string; description?: string; placeholder?: string; defaultValue?: string; confirmLabel?: string }) => {
    return new Promise<string | null>((resolve) => {
      promptResolverRef.current = resolve;
      setPromptValue(opts.defaultValue ?? "");
      setPromptDialog({ title: opts.title, description: opts.description, placeholder: opts.placeholder, confirmLabel: opts.confirmLabel ?? "OK" });
    });
  }, []);

  const resolvePrompt = useCallback((value: string | null) => {
    promptResolverRef.current?.(value);
    promptResolverRef.current = null;
    setPromptDialog(null);
  }, []);

  const askConfirm = useCallback((opts: { title: string; description?: string; destructive?: boolean; confirmLabel?: string }) => {
    return new Promise<boolean>((resolve) => {
      confirmResolverRef.current = resolve;
      setConfirmDialog({ title: opts.title, description: opts.description, destructive: opts.destructive, confirmLabel: opts.confirmLabel ?? "Confirm" });
    });
  }, []);

  const resolveConfirm = useCallback((ok: boolean) => {
    confirmResolverRef.current?.(ok);
    confirmResolverRef.current = null;
    setConfirmDialog(null);
  }, []);

  const initialMessage = useMemo(() => {
    const prefill = searchParams.get("prefill");
    if (prefill) setSearchParams({}, { replace: true });
    return prefill || undefined;
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const isDirty = activeNote ? draft !== activeNote.content : false;
  const interfaceFontStack = fontStack(appearanceSettings.interfaceFonts);
  const textFontStack = fontStack(appearanceSettings.textFonts);

  // Apply custom theme or fallback to base theme logic
  useEffect(() => {
    const customTheme = appearanceSettings.customThemeId 
      ? themeStore.getTheme(appearanceSettings.customThemeId) 
      : null;

    if (customTheme) {
      applyThemeVariables(customTheme, appearanceSettings.colorCustomizations);
    } else {
      // Fallback to traditional appearance settings if no custom theme is selected
      applyThemeVariables(null); // Clear custom vars
      document.documentElement.setAttribute("data-bb-theme", appearanceSettings.theme);
      applyAccent(appearanceSettings.accentColor);
    }
  }, [
    appearanceSettings.theme, 
    appearanceSettings.accentColor, 
    appearanceSettings.customThemeId, 
    appearanceSettings.colorCustomizations
  ]);

  // Bind hash ↔ modal open state so the URL is the source of truth. Back/forward
  // and external links land on the open dialog for free.
  useEffect(() => {
    const sync = () => {
      const h = window.location.hash;
      setSearchModalOpen(h === "#search");
      setGraphOpen(h === "#graph");
      setHistoryOpen(h === "#history");
      setCfoOpen(h === "#cfo");
      setConsultantOpen(h === "#consultant");
    };
    window.addEventListener("hashchange", sync);
    return () => window.removeEventListener("hashchange", sync);
  }, []);
  const openSearchModal = useCallback(() => {
    if (window.location.hash !== "#search") window.location.hash = "search";
    else setSearchModalOpen(true);
  }, []);
  const closeSearchModal = useCallback(() => {
    setSearchModalOpen(false);
    if (window.location.hash === "#search") history.replaceState(null, "", window.location.pathname + window.location.search);
  }, []);
  const openGraphView = useCallback(() => {
    if (window.location.hash !== "#graph") window.location.hash = "graph";
    else setGraphOpen(true);
  }, []);
  const closeGraphView = useCallback(() => {
    setGraphOpen(false);
    if (window.location.hash === "#graph") history.replaceState(null, "", window.location.pathname + window.location.search);
  }, []);
  const openHistory = useCallback(() => {
    if (window.location.hash !== "#history") window.location.hash = "history";
    else setHistoryOpen(true);
  }, []);
  const closeHistory = useCallback(() => {
    setHistoryOpen(false);
    if (window.location.hash === "#history") history.replaceState(null, "", window.location.pathname + window.location.search);
  }, []);
  // Personal CFO (FlowState) — hash-routed dialog.
  const openCfo = useCallback(() => {
    if (window.location.hash !== "#cfo") window.location.hash = "cfo";
    else setCfoOpen(true);
  }, []);
  const closeCfo = useCallback(() => {
    setCfoOpen(false);
    if (window.location.hash === "#cfo") history.replaceState(null, "", window.location.pathname + window.location.search);
  }, []);
  // Agent Consultant opens as a FULL-SCREEN page (not the agent rail) — hash-driven via `#consultant`.
  // The overlay covers the whole workspace; a Back button (and Esc/hash clear) returns to notes.
  const openConsultant = useCallback(() => {
    if (window.location.hash !== "#consultant") window.location.hash = "consultant";
    else setConsultantOpen(true);
  }, []);
  const closeConsultant = useCallback(() => {
    setConsultantOpen(false);
    if (window.location.hash === "#consultant") history.replaceState(null, "", window.location.pathname + window.location.search);
  }, []);

  const monospaceFontStack = fontStack(appearanceSettings.monospaceFonts);
  const currentFontList = fontTarget ? appearanceSettings[fontTarget] : [];
  const availableFontChoices = useMemo(
    () => uniqueFonts([...currentFontList, ...systemFonts, ...FONT_SUGGESTIONS]),
    [currentFontList, systemFonts],
  );
  const fontSuggestions = useMemo(() => {
    const selected = new Set(currentFontList.map((font) => font.toLowerCase()));
    const needle = fontSearch.trim().toLowerCase();
    return availableFontChoices
      .filter((font) => !selected.has(font.toLowerCase()))
      .filter((font) => !needle || font.toLowerCase().includes(needle));
  }, [availableFontChoices, currentFontList, fontSearch]);
  const openTabNotes = useMemo(() => (
    openTabs
      .map((path) => noteList.find((note) => note.path === path) || ({ path, title: titleFromPath(path) } as NoteFile))
      .filter((note) => note.path)
  ), [noteList, openTabs]);
  const splitContent = splitPath === activePath ? draft : splitNote?.content || "";
  const splitTitle = splitPath
    ? noteList.find((note) => note.path === splitPath)?.title || splitNote?.title || titleFromPath(splitPath)
    : "Reading";
  const visibleNotes = useMemo(() => {
    if (!query.trim() || searchResults.length === 0) return noteList;
    const resultPaths = new Set(searchResults.filter((result) => result.source === "note" && result.path).map((result) => result.path));
    return noteList.filter((note) => resultPaths.has(note.path));
  }, [noteList, query, searchResults]);

  const isSearching = Boolean(query.trim()) && searchResults.length > 0;

  // Tree view-state (expand/virtualize/reveal/scroll) lives in useNoteTree. noteContents
  // stays in the host (shared prefetch cache, also read by backlinks/graph). revealFolderInTree
  // is threaded to the breadcrumb + bookmarks; expand/collapse to the sidebar header.
  const {
    visibleEntries,
    expandedFolders,
    toggleFolder,
    expandAllFolders,
    collapseAllFolders,
    treeScrollRef,
    rowVirtualizer,
    highlightedTreePath,
    revealFolderInTree,
  } = useNoteTree({ entryList, activePath, isSearching, visibleNotes, setSidebarOpen });

  const folderHasChildren = useCallback(
    (folderPath: string) => entryList.some((entry) => entry.path.startsWith(`${folderPath}/`)),
    [entryList],
  );

  // ⌘P / Ctrl+P opens the command palette (Codex-style quick switcher).
  const runCommand = useCallback((action: () => void) => {
    setCommandOpen(false);
    action();
  }, []);

  const groupedSkills = useMemo(() => {
    const groups = new Map<string, InstalledSkill[]>();
    for (const skill of skillList) {
      const category = skill.manifest.category;
      const items = groups.get(category) || [];
      items.push(skill);
      groups.set(category, items);
    }
    return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [skillList]);

  // Responsive pane visibility. On mobile the bottom tab bar shows one full-screen
  // pane at a time; on desktop the classic ribbon + sidebar + editor + agent layout.
  const showSidebar = isMobile ? mobileView === "files" : sidebarOpen;
  const showMainEditor = !isMobile || mobileView === "editor";
  const showMainContent = !isMobile || mobileView === "editor" || mobileView === "agent";
  const showAgentPane = isMobile ? mobileView === "agent" : agentOpen;
  useEffect(() => {
    if (showAgentPane) setAgentEverOpened(true);
  }, [showAgentPane]);

  const refreshVaults = useCallback(async () => {
    try {
      const [active, recent] = await Promise.all([
        vault.getActiveVault(),
        vault.listVaults(),
      ]);
      setActiveVault(active);
      setRecentVaults(recent);
    } catch (error) {
      console.error("[Workspace] Failed to load vaults", error);
      toast.error("Failed to load vault settings");
    }
  }, [vault]);

  const refreshSkills = useCallback(async () => {
    try {
      const [nextSkills, summary] = await Promise.all([
        skills.listSkills(),
        skills.getSummary(),
      ]);
      setSkillList(nextSkills);
      setSkillSummary(summary);
    } catch (error) {
      console.error("[Workspace] Failed to load skills", error);
      toast.error("Failed to load skills");
    }
  }, [skills]);

  // Refresh the tree/list ONLY — never changes the active selection. Used by the
  // background watch subscription so a write (ours or external) can never bounce
  // the user to another note. The only exception: if the active note vanished
  // (deleted on disk / in another tab), fall back to the first remaining note.
  const refreshNotesList = useCallback(async () => {
    try {
      const [list, entries] = await Promise.all([
        notes.listNotes({ limit: 500 }),
        notes.listEntries(),
      ]);
      setNoteList(list);
      setEntryList(sortVaultEntries(entries));
      const current = activePathRef.current;
      if (current && !list.some((note) => note.path === current)) {
        setActivePath(list[0]?.path || null);
      }
    } catch (error) {
      console.error("[Workspace] Failed to refresh note list", error);
    }
  }, [notes]);

  // Refresh + explicitly choose the active note. ONLY called from user actions
  // (open / create / delete / rename), never from the background watch.
  //   refreshNotes(undefined) → keep current selection
  //   refreshNotes(null)      → jump to first note (e.g. after deleting active)
  //   refreshNotes(path)      → select `path` if it still exists
  const refreshNotes = useCallback(async (preferredPath?: string | null, showLoading = false) => {
    if (showLoading) setIsLoading(true);
    try {
      const [list, entries] = await Promise.all([
        notes.listNotes({ limit: 500 }),
        notes.listEntries(),
      ]);
      setNoteList(list);
      setEntryList(sortVaultEntries(entries));
      const current = activePathRef.current;
      const stillExists = (p: string | null) => !!p && list.some((note) => note.path === p);
      const nextPath = preferredPath === null
        ? list[0]?.path || null
        : (stillExists(preferredPath ?? null) ? preferredPath
          : stillExists(current) ? current
          : list[0]?.path || null); // preferred + current both gone → first note (never a dead path)
      // Keep the ref in lockstep so a racing background refresh sees the new
      // selection immediately (the ref otherwise only updates on re-render).
      activePathRef.current = nextPath ?? null;
      setActivePath(nextPath);
    } catch (error) {
      console.error("[Workspace] Failed to load notes", error);
      toast.error("Failed to load local notes");
    } finally {
      if (showLoading) setIsLoading(false);
    }
  }, [notes]);

  // Surgically reconcile a single-file rename in local state — NO full re-fetch,
  // NO `setIsLoading`, NO toast. Patches every place the old path is referenced
  // so the sidebar/tabs/editor update without the app flickering or reloading.
  const applyRenameInState = useCallback((oldPath: string, saved: NoteFile) => {
    const newPath = saved.path;
    if (oldPath === newPath) return;
    noteOrder.rename(oldPath, newPath); // keep tree position across the title→filename rename (any backend)
    const name = titleFromPath(newPath);
    const depth = newPath.split("/").length - 1;
    setNoteList((cur) => cur.map((n) => (n.path === oldPath ? { ...saved, content: "" } : n)));
    setEntryList((cur) => cur.map((e) => (e.path === oldPath ? { ...e, path: newPath, name, title: saved.title, depth } : e)));
    setOpenTabs((cur) => cur.map((p) => (p === oldPath ? newPath : p)));
    setNoteContents((prev) => {
      if (!(oldPath in prev)) return { ...prev, [newPath]: saved.content };
      const next = { ...prev, [newPath]: saved.content };
      delete next[oldPath];
      return next;
    });
    setSplitPath((p) => (p === oldPath ? newPath : p));
    setSplitNote((n) => (n?.path === oldPath ? saved : n));
    setActiveNote((n) => (n?.path === oldPath ? saved : n));
    setActivePath((p) => {
      if (p !== oldPath) return p;
      activePathRef.current = newPath; // keep lockstep so the watch doesn't bounce selection
      return newPath;
    });
  }, []);

  // Silent title→filename sync — runs once on editor blur (NOT on every keystroke).
  // Content is already persisted by autosave; this only renames the file from the
  // H1 when needed. Errors (invalid name / duplicate / lock) are swallowed so the
  // app never crashes — the note simply keeps its current filename.
  const flushTitleSync = useCallback(async () => {
    const note = activeNoteRef.current;
    if (!note || titleSyncingRef.current) return;
    const content = draftRef.current;
    const heading = firstLineTitle(content);
    if (!heading) return; // empty content → nothing to sync
    const currentBase = titleFromPath(note.path);
    // Raw compare (no client-side sanitize mirror): if the H1 already equals the
    // filename, the backend is guaranteed to no-op the rename → skip the write.
    // If they differ we attempt the sync and let the backend's authoritative
    // sanitize + collision logic decide — this can never FALSE-skip a real rename.
    if (heading === currentBase) return;
    titleSyncingRef.current = true;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current); // don't race the pending autosave
    try {
      const saved = await notes.writeNote({ path: note.path, content, expectedHash: note.contentHash });
      setActiveNote(saved);
      setNoteContents((prev) => ({ ...prev, [saved.path]: saved.content }));
      if (saved.path !== note.path) applyRenameInState(note.path, saved);
      else setNoteList((cur) => cur.map((n) => (n.path === saved.path ? { ...saved, content: "" } : n)));
    } catch (error) {
      // Invalid characters, duplicate name, read/write lock, external change, etc.
      console.warn("[Workspace] Title sync skipped", error);
    } finally {
      titleSyncingRef.current = false;
    }
  }, [notes, applyRenameInState]);

  // Load the active note's version history whenever the recovery dialog opens.
  useEffect(() => {
    if (!historyOpen || !activePath) {
      setVersions([]);
      return;
    }
    let cancelled = false;
    setVersionsLoading(true);
    Promise.resolve(notes.listVersions?.(activePath))
      .then((list) => { if (!cancelled) setVersions(list ?? []); })
      .catch(() => { if (!cancelled) setVersions([]); })
      .finally(() => { if (!cancelled) setVersionsLoading(false); });
    return () => { cancelled = true; };
  }, [historyOpen, activePath, notes]);

  // Restore a snapshot: write it back as the current content. Because writeNote
  // snapshots again, the pre-restore state is itself preserved (reversible).
  const handleRestoreVersion = useCallback(async (version: NoteVersion) => {
    if (!activePath) return;
    try {
      const content = await notes.getVersionContent?.(version.id);
      if (content == null) {
        toast.error("Version content unavailable");
        return;
      }
      await notes.writeNote({ path: activePath, content });
      setDraftImmediate(content);
      const fresh = await notes.readNote(activePath);
      if (fresh) setActiveNote(fresh);
      toast.success("Restored earlier version");
      closeHistory();
    } catch (error) {
      console.error("[Workspace] Restore version failed", error);
      toast.error("Failed to restore version");
    }
  }, [activePath, notes, closeHistory]);

  const openNotePath = useCallback((notePath: string) => {
    const apply = () => {
      setOpenTabs((current) => (current.includes(notePath) ? current : [...current, notePath]));
      setActivePath(notePath);
      if (isMobile) setMobileView("editor");
    };
    // View Transitions API: Chromium 111+, Safari 18+, Electron 28+. Falls back
    // to immediate state update on browsers that don't support it.
    type DocVT = Document & { startViewTransition?: (cb: () => void) => unknown };
    const docVT = document as DocVT;
    if (typeof docVT.startViewTransition === "function" && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      docVT.startViewTransition(apply);
    } else {
      apply();
    }
  }, [isMobile]);

  const clearWorkspaceSession = useCallback(() => {
    setActivePath(null);
    setActiveNote(null);
    setDraftImmediate("");
    setOpenTabs([]);
    setSplitLayout(null);
    setSplitPath(null);
    setSplitNote(null);
    // Drop the previous vault's folder-expansion state so the new vault's tree
    // renders from a clean slate (stale expanded paths hid new files until reload).
    collapseAllFolders();
  }, [collapseAllFolders]);

  const handleReopenFolder = useCallback(async () => {
    const granted = await fsaStore.ensurePermission();
    if (!granted) {
      toast.error("Folder permission was denied");
      return;
    }
    setNeedsReopenFolder(false);
    clearWorkspaceSession();
    await refreshVaults();
    await refreshNotes(null, true);
    toast.success("Vault folder reconnected");
  }, [clearWorkspaceSession, refreshNotes, refreshVaults]);

  // Browser: restore a previously-opened device folder; re-request permission if needed.
  useEffect(() => {
    if (!fsaSupported) return;
    let cancelled = false;
    fsaStore
      .restore()
      .then(async (state) => {
        if (cancelled) return;
        if (state.active) {
          await refreshVaults();
          await refreshNotes(null, true);
        } else if (state.needsPermission) {
          setNeedsReopenFolder(true);
        }
      })
      .catch(() => { });
    return () => {
      cancelled = true;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const closeTab = useCallback((notePath: string) => {
    const nextTabs = openTabs.filter((path) => path !== notePath);
    setOpenTabs(nextTabs);
    if (activePath === notePath) {
      setActivePath(nextTabs[nextTabs.length - 1] || noteList.find((note) => note.path !== notePath)?.path || null);
    }
    if (splitPath === notePath) {
      setSplitLayout(null);
      setSplitPath(null);
      setSplitNote(null);
    }
  }, [activePath, noteList, openTabs, splitPath]);

  const closeOtherTabs = useCallback((notePath: string) => {
    setOpenTabs([notePath]);
    setActivePath(notePath);
    if (splitPath && splitPath !== notePath) {
      setSplitLayout(null);
      setSplitPath(null);
      setSplitNote(null);
    }
  }, [splitPath]);

  const closeAllTabs = useCallback(() => {
    setOpenTabs([]);
    setActivePath(null);
    setSplitLayout(null);
    setSplitPath(null);
    setSplitNote(null);
  }, []);

  const splitTab = useCallback((notePath: string, layout: Exclude<SplitLayout, null>) => {
    setSplitLayout(layout);
    setSplitPath(notePath);
  }, []);

  useEffect(() => {
    refreshVaults();
    refreshSkills();
    refreshNotes(localStorage.getItem(LAST_NOTE_KEY) || undefined, true); // restore last-open file (if it still exists)
    const subscription = notes.watchNotes(() => {
      // Background/external change: refresh ONLY the tree/list — never the active
      // selection. (Touching activePath here raced with explicit create/open and
      // bounced the user to the first note on every auto-save / create.)
      refreshNotesList();
      refreshVaults();
      // Live-sync the OPEN note's CONTENT when its file changed on disk (e.g. edited
      // in Obsidian). Refs (not closure) so the once-mounted subscription stays current.
      void (async () => {
        const note = activeNoteRef.current;
        if (!note) return;
        const fresh = await notes.readNote(note.path).catch(() => null);
        if (!fresh || fresh.content === note.content) return;     // nothing changed on disk
        if (activeNoteRef.current?.path !== note.path) return;    // user switched notes mid-read
        if (draftRef.current !== note.content) return;            // local unsaved edits — keep them
        setActiveNote(fresh);
        setDraftImmediate(fresh.content);
        setNoteContents((prev) => ({ ...prev, [fresh.path]: fresh.content }));
      })();
    });
    return () => {
      subscription.unsubscribe();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Native desktop menu (Settings / ⌘,) → open the in-app Settings dialog.
  useEffect(() => window.beebotDesktop?.onOpenSettings?.(() => setSettingsOpen(true)), []);

  useEffect(() => {
    let cancelled = false;
    settings.get<WorkspaceAppearanceSettings>(SETTINGS_STORAGE_KEY)
      .then((stored) => {
        if (!cancelled) setAppearanceSettings(mergeAppearanceSettings(stored));
      })
      .catch((error) => {
        console.error("[Workspace] Failed to load appearance settings", error);
      });
    settings.get<string[]>(BOOKMARKS_STORAGE_KEY)
      .then((stored) => {
        if (!cancelled && Array.isArray(stored)) setBookmarks(stored);
      })
      .catch(() => { });
    return () => {
      cancelled = true;
    };
  }, [settings]);

  const persistBookmarks = useCallback((next: string[]) => {
    setBookmarks(next);
    settings.set(BOOKMARKS_STORAGE_KEY, next).catch((error) => console.error("[Workspace] Failed to save bookmarks", error));
  }, [settings]);

  const handleToggleBookmark = useCallback((entry: VaultEntry) => {
    const has = bookmarks.includes(entry.path);
    persistBookmarks(has ? bookmarks.filter((path) => path !== entry.path) : [...bookmarks, entry.path]);
    toast.success(has ? "Bookmark removed" : "Bookmarked");
  }, [bookmarks, persistBookmarks]);

  // Enumerate every font installed on the device.
  // - Electron: a comprehensive native scan (system_profiler / registry / fc-list) — no gesture needed.
  // - Browser: the Local Font Access API (Chromium) needs a user gesture + permission. We only call
  //   queryLocalFonts() when permission is already granted, or when triggered by a gesture (viaGesture).
  const loadSystemFonts = useCallback(async (viaGesture = false) => {
    setFontsLoading(true);
    try {
      const desktopFonts = await window.beebotDesktop?.listFonts?.();
      if (desktopFonts && desktopFonts.length) {
        setSystemFonts(uniqueFonts([...desktopFonts, ...FONT_SUGGESTIONS]));
        setFontPermission("granted");
        return;
      }
      if (typeof window.queryLocalFonts !== "function") {
        setFontPermission("unsupported");
        return;
      }
      let state: PermissionState | "unknown" = "unknown";
      try {
        const status = await navigator.permissions.query({ name: "local-fonts" } as unknown as PermissionDescriptor);
        state = status.state;
      } catch {
        /* some browsers don't expose the local-fonts permission to query() */
      }
      if (state !== "granted" && !viaGesture) {
        setFontPermission(state === "denied" ? "denied" : "prompt");
        return; // never call queryLocalFonts() without a user gesture
      }
      const localFonts = await window.queryLocalFonts();
      const families = uniqueFonts(localFonts.map((font) => font.family));
      setSystemFonts(uniqueFonts([...families, ...FONT_SUGGESTIONS]));
      setFontPermission("granted");
    } catch (error) {
      console.error("[Workspace] Failed to load system fonts", error);
      setFontPermission((prev) => (prev === "granted" ? prev : "denied"));
    } finally {
      setFontsLoading(false);
    }
  }, []);

  // NOTE: do NOT load fonts on mount. Enumerating every installed font is
  // expensive (thousands of families via system_profiler/registry/fc-list or
  // queryLocalFonts) and most users never open the font panel. We load lazily
  // on first interaction with the search input (see onSearchFocus below) —
  // which also satisfies queryLocalFonts's user-gesture requirement.

  useEffect(() => {
    if (!activePath) {
      setActiveNote(null);
      setDraftImmediate("");
      return;
    }

    let cancelled = false;
    notes.readNote(activePath)
      .then((note) => {
        if (cancelled) return;
        setActiveNote(note);
        setDraftImmediate(note?.content || "");
        if (note) setNoteContents((prev) => (prev[note.path] === note.content ? prev : { ...prev, [note.path]: note.content }));
      })
      .catch((error) => {
        console.error("[Workspace] Failed to read note", error);
        toast.error("Failed to open note");
      });

    return () => {
      cancelled = true;
    };
  }, [activePath, notes]);

  useEffect(() => {
    if (!activePath) return;
    setOpenTabs((current) => (current.includes(activePath) ? current : [...current, activePath]));
  }, [activePath]);

  useEffect(() => {
    if (!splitPath) {
      setSplitNote(null);
      return;
    }
    if (splitPath === activePath) {
      setSplitNote(activeNote);
      return;
    }

    let cancelled = false;
    notes.readNote(splitPath)
      .then((note) => {
        if (!cancelled) setSplitNote(note);
      })
      .catch((error) => {
        console.error("[Workspace] Failed to read split note", error);
        if (!cancelled) {
          setSplitLayout(null);
          setSplitPath(null);
          setSplitNote(null);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [activeNote, activePath, notes, splitPath]);

  // Force-save the active note right now (debounce bypassed). Used by Cmd+S
  // and reused by the debounced autosave below — declared above the effect so
  // there's no use-before-declaration concern.
  const saveActiveNote = useCallback(async () => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    if (!activeNote) return;
    setIsSaving(true);
    try {
      const saved = await notes.writeNote({
        path: activeNote.path,
        content: draftRef.current,
        expectedHash: activeNote.contentHash,
        syncName: false,
      });
      setActiveNote(saved);
      setNoteContents((prev) => ({ ...prev, [saved.path]: saved.content }));
      if (saved.path !== activeNote.path) {
        applyRenameInState(activeNote.path, saved);
      } else {
        setNoteList((current) => current.map((note) => (note.path === saved.path ? { ...saved, content: "" } : note)));
      }
    } catch (error) {
      console.error("[Workspace] Save failed", error);
      toast.error(error instanceof Error ? error.message : "Save failed");
    } finally {
      setIsSaving(false);
    }
  }, [activeNote, notes, applyRenameInState]);

  useEffect(() => {
    if (!activeNote || draft === activeNote.content) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => { void saveActiveNote(); }, 700);

    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [activeNote, draft, notes, applyRenameInState, saveActiveNote]);

  useEffect(() => {
    const trimmed = query.trim();
    if (!trimmed) {
      setSearchResults([]);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(() => {
      search.search(trimmed, 40)
        .then((results) => {
          if (!cancelled) setSearchResults(results);
        })
        .catch((error) => {
          console.error("[Workspace] Search failed", error);
          if (!cancelled) setSearchResults([]);
        });
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query, search]);

  const updateAppearanceSettings = useCallback((patch: Partial<WorkspaceAppearanceSettings>) => {
    setAppearanceSettings((current) => {
      const next = mergeAppearanceSettings({ ...current, ...patch });
      settings.set(SETTINGS_STORAGE_KEY, next).catch((error) => {
        console.error("[Workspace] Failed to save appearance settings", error);
        toast.error("Failed to save settings");
      });
      return next;
    });
  }, [settings]);

  const addFontToTarget = useCallback((target: FontTarget, fontName: string) => {
    const cleanName = fontName.trim();
    if (!cleanName) return;
    const nextFonts = uniqueFonts([...appearanceSettings[target].filter((font) => font.toLowerCase() !== cleanName.toLowerCase()), cleanName]);
    updateAppearanceSettings({ [target]: nextFonts } as Partial<WorkspaceAppearanceSettings>);
    setFontInput("");
    setFontSearch("");
  }, [appearanceSettings, updateAppearanceSettings]);

  /** Make `fontName` the ACTIVE (first-choice) font for a target. Prepends it
   *  to the stack so it wins immediately — distinct from addFontToTarget which
   *  appends as a fallback. This is the "Apply" action on a search result. */
  const applyFontToTarget = useCallback((target: FontTarget, fontName: string) => {
    const cleanName = fontName.trim();
    if (!cleanName) return;
    const rest = appearanceSettings[target].filter((font) => font.toLowerCase() !== cleanName.toLowerCase());
    const nextFonts = uniqueFonts([cleanName, ...rest]);
    updateAppearanceSettings({ [target]: nextFonts } as Partial<WorkspaceAppearanceSettings>);
    setFontInput("");
    setFontSearch("");
    toast.success(`${cleanName} applied`);
  }, [appearanceSettings, updateAppearanceSettings]);

  const removeFontFromTarget = useCallback((target: FontTarget, fontName: string) => {
    const nextFonts = appearanceSettings[target].filter((font) => font !== fontName);
    updateAppearanceSettings({ [target]: nextFonts.length ? nextFonts : DEFAULT_APPEARANCE_SETTINGS[target] } as Partial<WorkspaceAppearanceSettings>);
  }, [appearanceSettings, updateAppearanceSettings]);

  const moveFontInTarget = useCallback((target: FontTarget, fontName: string, direction: -1 | 1) => {
    const fonts = appearanceSettings[target];
    const currentIndex = fonts.indexOf(fontName);
    const nextIndex = currentIndex + direction;
    if (currentIndex === -1 || nextIndex < 0 || nextIndex >= fonts.length) return;
    const nextFonts = [...fonts];
    [nextFonts[currentIndex], nextFonts[nextIndex]] = [nextFonts[nextIndex], nextFonts[currentIndex]];
    updateAppearanceSettings({ [target]: nextFonts } as Partial<WorkspaceAppearanceSettings>);
  }, [appearanceSettings, updateAppearanceSettings]);

  const resetAppearanceSettings = useCallback(() => {
    updateAppearanceSettings(DEFAULT_APPEARANCE_SETTINGS);
    toast.success("Appearance reset");
  }, [updateAppearanceSettings]);

  const handleCreateNote = useCallback(async (folder = "") => {
    const notePath = createUntitledPath(noteList, folder);
    const title = titleFromPath(notePath);
    try {
      const note = await notes.writeNote({
        path: notePath,
        content: `# ${title}\n\n`,
      });
      setOpenTabs((current) => (current.includes(note.path) ? current : [...current, note.path]));
      await refreshNotes(note.path);
      toast.success("Note created");
    } catch (error) {
      console.error("[Workspace] Create note failed", error);
      toast.error("Failed to create note");
    }
  }, [noteList, notes, refreshNotes]);

  // Cmd+P toggles the command palette. Esc closes the full-screen Agent
  // Consultant page. Cmd+N = new note (in the active note's folder), Cmd+S =
  // force-save the active note, Cmd+F = in-note find. These match the muscle
  // memory of every desktop note app (Obsidian / VS Code / Bear).
  // ponytail: must live below handleCreateNote/saveActiveNote — its deps array
  // reads them at render time, so declaring it above them = TDZ white-screen.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const mod = event.metaKey || event.ctrlKey;
      const key = event.key.toLowerCase();
      if (mod && key === "p") {
        event.preventDefault();
        setCommandOpen((value) => !value);
      } else if (mod && key === "n") {
        event.preventDefault();
        void handleCreateNote(activeNote ? folderFromPath(activeNote.path) : "");
      } else if (mod && key === "s") {
        event.preventDefault();
        void saveActiveNote();
      } else if (mod && key === "f") {
        // In-note find → CodeMirror's search panel. Only when an editor is
        // mounted AND no text input is already capturing keystrokes.
        const ed = editorInstanceRef.current;
        const target = event.target;
        if (ed && !(target instanceof HTMLInputElement) && !(target instanceof HTMLTextAreaElement)) {
          event.preventDefault();
          ed.openSearch();
        }
      } else if (event.key === "Escape" && consultantOpen) {
        event.preventDefault();
        closeConsultant();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [consultantOpen, closeConsultant, activeNote, handleCreateNote, saveActiveNote]);

  const handleCreateFolder = useCallback(async (parentFolder = "") => {
    const name = await askInput({ title: "New folder", placeholder: "Folder name", defaultValue: "New folder", confirmLabel: "Create" });
    if (!name?.trim()) return;
    try {
      await notes.createFolder(joinVaultPath(parentFolder, name.trim()));
      await refreshNotes(activePath);
      toast.success("Folder created");
    } catch (error) {
      console.error("[Workspace] Create folder failed", error);
      toast.error(error instanceof Error ? error.message : "Failed to create folder");
    }
  }, [activePath, askInput, notes, refreshNotes]);

  const handleDeleteNote = useCallback(async () => {
    if (!activeNote) return;
    const confirmed = await askConfirm({ title: `Delete ${activeNote.title || titleFromPath(activeNote.path)}?`, description: "This removes the Markdown file from the vault.", destructive: true, confirmLabel: "Delete" });
    if (!confirmed) return;
    try {
      await notes.deleteNote(activeNote.path);
      const remaining = noteList.filter((note) => note.path !== activeNote.path);
      setOpenTabs((current) => current.filter((path) => path !== activeNote.path));
      if (splitPath === activeNote.path) {
        setSplitLayout(null);
        setSplitPath(null);
        setSplitNote(null);
      }
      setNoteList(remaining);
      setEntryList((cur) => cur.filter((e) => e.path !== activeNote.path));
      setActivePath(remaining[0]?.path || null);
      void refreshNotesList();
      toast.success("Note deleted");
    } catch (error) {
      console.error("[Workspace] Delete note failed", error);
      toast.error("Failed to delete note");
    }
  }, [activeNote, askConfirm, noteList, notes, refreshNotesList, splitPath]);

  const handleDeleteEntry = useCallback(async (entry: VaultEntry) => {
    const confirmed = await askConfirm({
      title: `Delete ${basenameFromPath(entry.path)}?`,
      description: entry.kind === "folder" ? "This removes the folder and everything inside it." : "This removes the Markdown file from the vault.",
      destructive: true,
      confirmLabel: "Delete",
    });
    if (!confirmed) return;
    try {
      if (entry.kind === "folder") {
        await notes.deleteFolder(entry.path);
        setNoteList((cur) => cur.filter((n) => !n.path.startsWith(`${entry.path}/`)));
        setEntryList((cur) => cur.filter((e) => e.path !== entry.path && !e.path.startsWith(`${entry.path}/`)));
        setOpenTabs((current) => current.filter((path) => !path.startsWith(`${entry.path}/`)));
        if (activePath?.startsWith(`${entry.path}/`)) setActivePath(null);
        if (splitPath?.startsWith(`${entry.path}/`)) {
          setSplitLayout(null);
          setSplitPath(null);
          setSplitNote(null);
        }
      } else {
        await notes.deleteNote(entry.path);
        setNoteList((cur) => cur.filter((n) => n.path !== entry.path));
        setEntryList((cur) => cur.filter((e) => e.path !== entry.path));
        setOpenTabs((current) => current.filter((path) => path !== entry.path));
        if (splitPath === entry.path) {
          setSplitLayout(null);
          setSplitPath(null);
          setSplitNote(null);
        }
        if (activePath === entry.path) setActivePath(null);
      }
      await refreshNotes(activePath === entry.path || activePath?.startsWith(`${entry.path}/`) ? null : activePath, false);
      toast.success(entry.kind === "folder" ? "Folder deleted" : "Note deleted");
    } catch (error) {
      console.error("[Workspace] Delete entry failed", error);
      toast.error(error instanceof Error ? error.message : "Failed to delete");
    }
  }, [activePath, askConfirm, notes, refreshNotes, splitPath]);

  // Shared move/rename: relocate an entry to newPath and fix up tabs/active/split state.
  const relocateEntry = useCallback(async (entry: VaultEntry, newPath: string, successMessage: (moved: VaultEntry) => string) => {
    if (!newPath || newPath === entry.path) return;
    try {
      const moved = await notes.renamePath({ oldPath: entry.path, newPath });
      if (entry.kind === "note") noteOrder.rename(entry.path, moved.path); // carry order weight across move/rename
      let preferredPath = activePath;
      if (entry.kind === "note") {
        setOpenTabs((current) => current.map((path) => (path === entry.path ? moved.path : path)));
        if (splitPath === entry.path) setSplitPath(moved.path);
        if (activePath === entry.path) {
          preferredPath = moved.path;
          setActivePath(moved.path);
        }
      } else {
        const oldPrefix = `${entry.path}/`;
        const nextPrefix = `${moved.path}/`;
        setOpenTabs((current) => current.map((path) => (path.startsWith(oldPrefix) ? `${nextPrefix}${path.slice(oldPrefix.length)}` : path)));
        if (splitPath?.startsWith(oldPrefix)) setSplitPath(`${nextPrefix}${splitPath.slice(oldPrefix.length)}`);
        if (activePath?.startsWith(oldPrefix)) {
          preferredPath = `${nextPrefix}${activePath.slice(oldPrefix.length)}`;
          setActivePath(preferredPath);
        }
      }
      await refreshNotes(preferredPath);
      toast.success(successMessage(moved));
    } catch (error) {
      console.error("[Workspace] Relocate entry failed", error);
      toast.error(error instanceof Error ? error.message : "Failed to move");
    }
  }, [activePath, notes, refreshNotes, splitPath]);

  const handleRenameEntry = useCallback(async (entry: VaultEntry) => {
    const currentName = entry.kind === "note" ? basenameFromPath(entry.path).replace(/\.md$/i, "") : entry.name;
    const nextName = await askInput({ title: `Rename ${entry.kind}`, placeholder: "Name", defaultValue: currentName, confirmLabel: "Rename" });
    if (!nextName?.trim() || nextName === currentName) return;
    const parent = parentFromPath(entry.path);
    const targetName = entry.kind === "note" ? `${nextName.trim().replace(/\.md$/i, "")}.md` : nextName.trim();
    await relocateEntry(entry, joinVaultPath(parent, targetName), (moved) => `Renamed to ${moved.name}`);
  }, [askInput, relocateEntry]);

  const handleMoveEntry = useCallback(async (entry: VaultEntry) => {
    const dest = await askInput({ title: "Move to folder", description: "Leave blank to move to the vault root.", placeholder: "Destination folder", defaultValue: parentFromPath(entry.path), confirmLabel: "Move" });
    if (dest === null) return;
    const newPath = joinVaultPath(dest.trim().replace(/^\/+|\/+$/g, ""), basenameFromPath(entry.path));
    await relocateEntry(entry, newPath, () => `Moved to ${newPath}`);
  }, [askInput, relocateEntry]);

  // Drag-and-drop move: drop a row onto a folder → relocate it there. Guards a folder
  // being dropped into itself or its own descendant (would orphan the subtree).
  const moveEntryViaDnd = useCallback((source: VaultEntry, targetFolder: string) => {
    if (source.kind === "folder" && (targetFolder === source.path || targetFolder.startsWith(`${source.path}/`))) {
      toast.error("Can't move a folder into itself");
      return;
    }
    const newPath = joinVaultPath(targetFolder, basenameFromPath(source.path));
    if (newPath === source.path) return; // already in this folder
    void relocateEntry(source, newPath, () => `Moved to ${targetFolder || "Repository"}`);
  }, [relocateEntry]);

  // Drag-and-drop reorder: drop a note above/below another note in the SAME folder →
  // rewrite that folder's persisted order weights. (Cross-folder drops are a move, above.)
  // ponytail: browser/IndexedDB only — the Electron disk runtime still lists alphabetically;
  // promote the order weights to a per-folder on-disk file when desktop reorder is needed.
  const reorderEntry = useCallback((source: VaultEntry, targetPath: string, before: boolean) => {
    if (source.kind !== "note" || source.path === targetPath) return;
    const parent = parentFromPath(source.path);
    if (parentFromPath(targetPath) !== parent) return; // different folder → handled by move
    const order = entryList.filter((e) => e.kind === "note" && parentFromPath(e.path) === parent).map((e) => e.path);
    const without = order.filter((p) => p !== source.path);
    const at = without.indexOf(targetPath);
    if (at < 0) return;
    without.splice(before ? at : at + 1, 0, source.path);
    noteOrder.setOrder(without);
    void refreshNotesList();
  }, [entryList, refreshNotesList]);

  const handleDuplicateEntry = useCallback(async (entry: VaultEntry) => {
    try {
      if (entry.kind === "note") {
        const source = await notes.readNote(entry.path);
        if (!source) return;
        const parent = parentFromPath(entry.path);
        const base = basenameFromPath(entry.path).replace(/\.md$/i, "");
        const existing = new Set(noteList.map((note) => note.path));
        let candidate = joinVaultPath(parent, `${base} copy.md`);
        let counter = 2;
        while (existing.has(candidate)) {
          candidate = joinVaultPath(parent, `${base} copy ${counter}.md`);
          counter += 1;
        }
        const created = await notes.writeNote({ path: candidate, content: source.content });
        await refreshNotes(created.path);
        toast.success("Note duplicated");
      } else {
        const folderPaths = new Set(entryList.filter((item) => item.kind === "folder").map((item) => item.path));
        let target = `${entry.path} copy`;
        let counter = 2;
        while (folderPaths.has(target)) {
          target = `${entry.path} copy ${counter}`;
          counter += 1;
        }
        await notes.createFolder(target);
        const prefix = `${entry.path}/`;
        for (const child of entryList) {
          if (!child.path.startsWith(prefix)) continue;
          const rel = child.path.slice(prefix.length);
          if (child.kind === "folder") {
            await notes.createFolder(`${target}/${rel}`);
          } else {
            const src = await notes.readNote(child.path);
            if (src) await notes.writeNote({ path: `${target}/${rel}`, content: src.content });
          }
        }
        await refreshNotes(activePath);
        toast.success("Folder duplicated");
      }
    } catch (error) {
      console.error("[Workspace] Duplicate failed", error);
      toast.error(error instanceof Error ? error.message : "Failed to duplicate");
    }
  }, [activePath, entryList, noteList, notes, refreshNotes]);

  const handleSearchInFolder = useCallback((entry: VaultEntry) => {
    setQuery(entry.name);
  }, []);

  const handleOpenToSide = useCallback((entry: VaultEntry) => {
    if (entry.kind !== "note") return;
    if (!activePath) openNotePath(entry.path);
    splitTab(entry.path, "right");
  }, [activePath, openNotePath, splitTab]);

  const handleRevealEntry = useCallback(async (entry: VaultEntry) => {
    try {
      await notes.revealPath(entry.path);
    } catch (error) {
      // Browser can't open the file manager — this is an expected limitation,
      // not an error. Fall back to copying the path so the action is still useful.
      void error;
      try {
        await navigator.clipboard.writeText(entry.path);
        toast(`Reveal in ${FILE_MANAGER} is desktop-only — path copied instead`);
      } catch {
        toast(`Reveal in ${FILE_MANAGER} is available in the desktop app`);
      }
    }
  }, [notes]);

  const handleCopyEntryPath = useCallback(async (entry: VaultEntry) => {
    try {
      await navigator.clipboard.writeText(entry.path);
      toast.success("Path copied");
    } catch {
      toast.error("Failed to copy path");
    }
  }, []);

  const handleOpenVault = useCallback(async () => {
    setIsVaultBusy(true);
    try {
      const opened = await vault.openVault();
      if (!opened) return;
      setNeedsReopenFolder(false);
      clearWorkspaceSession();
      await refreshVaults();
      await refreshSkills();
      await refreshNotes(null, true);
      toast.success(`Opened ${opened.name}`);
    } catch (error) {
      console.error("[Workspace] Open vault failed", error);
      toast.error(error instanceof Error ? error.message : "Failed to open vault");
    } finally {
      setIsVaultBusy(false);
    }
  }, [clearWorkspaceSession, refreshNotes, refreshSkills, refreshVaults, vault]);

  const handleCreateVault = useCallback(async () => {
    setIsVaultBusy(true);
    try {
      const created = await vault.createVault({ name: newVaultName });
      if (!created) return;
      setCreateVaultOpen(false);
      clearWorkspaceSession();
      await refreshVaults();
      await refreshSkills();
      await refreshNotes(null, true);
      toast.success(`Created ${created.name}`);
    } catch (error) {
      console.error("[Workspace] Create vault failed", error);
      toast.error(error instanceof Error ? error.message : "Failed to create vault");
    } finally {
      setIsVaultBusy(false);
    }
  }, [clearWorkspaceSession, newVaultName, refreshNotes, refreshSkills, refreshVaults, vault]);

  const handleSwitchVault = useCallback(async (vaultPath: string) => {
    if (isVaultBusy || vaultPath === activeVault?.path) return; // no-op when already active
    setIsVaultBusy(true);
    try {
      await vault.switchVault(vaultPath);
      // Load ALL of the new vault's data before touching any UI state, then swap it
      // in one synchronous batch. The old flow blanked the editor (activePath=null)
      // and awaited three refreshes in series — each await = a separate render, which
      // is the flicker. One await boundary → one re-render → a smooth switch.
      const [active, recents, list, entries] = await Promise.all([
        vault.getActiveVault(),
        vault.listVaults(),
        notes.listNotes({ limit: 500 }),
        notes.listEntries(),
      ]);
      clearWorkspaceSession();              // clears old tabs/split/draft + collapses folders
      setActiveVault(active);
      setRecentVaults(recents);
      setNoteList(list);
      setEntryList(sortVaultEntries(entries));
      const first = list[0]?.path || null;  // batched with the null above → the blank never renders
      activePathRef.current = first;
      setActivePath(first);
      refreshSkills();                        // skills don't affect the tree/editor — no need to await
      toast.success(`Switched to ${active.name}`);
    } catch (error) {
      console.error("[Workspace] Switch vault failed", error);
      toast.error(error instanceof Error ? error.message : "Failed to switch vault");
    } finally {
      setIsVaultBusy(false);
    }
  }, [activeVault, isVaultBusy, notes, vault, clearWorkspaceSession, refreshSkills]);

  const handleRevealVault = useCallback(async () => {
    try {
      await vault.revealActiveVault();
    } catch {
      toast("Opening the vault location is available in the desktop app");
    }
  }, [vault]);

  const handleForgetVault = useCallback(async (vaultPath: string) => {
    try {
      await vault.forgetVault(vaultPath);
      await refreshVaults();
    } catch (error) {
      console.error("[Workspace] Forget vault failed", error);
      toast.error("Couldn't remove that vault from Recent");
    }
  }, [refreshVaults, vault]);

  const handleToggleSkill = useCallback(async (skillId: string, enabled: boolean) => {
    setIsSkillBusy(true);
    try {
      const updated = await skills.setSkillEnabled({ skillId, enabled });
      await refreshSkills();
      toast.success(`${updated.manifest.name} ${updated.enabled ? "enabled" : "disabled"}`);
    } catch (error) {
      console.error("[Workspace] Toggle skill failed", error);
      toast.error(error instanceof Error ? error.message : "Failed to update skill");
    } finally {
      setIsSkillBusy(false);
    }
  }, [refreshSkills, skills]);

  const promptLinkAndApply = useCallback(async () => {
    const editor = editorInstanceRef.current;
    if (!editor) return;
    editor.focus();
    const url = await askInput({ title: "Add link", placeholder: "https://", defaultValue: "https://", confirmLabel: "Apply" });
    if (url === null) return;
    editor.runCommand("link", { url: url.trim() });
  }, [askInput]);

  const applyMarkdownCommand = useCallback((command: MarkdownCommand) => {
    const editor = editorInstanceRef.current;
    if (!editor || !activeNote) return;
    if (command === "link") {
      void promptLinkAndApply();
      return;
    }
    editor.focus();
    editor.runCommand(command);
  }, [activeNote, promptLinkAndApply]);

  // CodeMirror owns ⌘B/I/K — keep this as a no-op shim for the host div.
  const handleEditorKeyDown = useCallback((_event: ReactKeyboardEvent<HTMLDivElement>) => { }, []);

  const settingsItems = useMemo(() => [
    { id: "general" as const, label: "General", icon: UserCircle },
    { id: "editor" as const, label: "Editor", icon: Pen },
    { id: "files" as const, label: "Files and links", icon: FolderPathConnect },
    { id: "appearance" as const, label: "Appearance", icon: Tuning2 },
    { id: "sync" as const, label: "Sync", icon: Refresh },
    { id: "skills" as const, label: "Skills", icon: MagicStick3 },
  ], []);

  // Registry of customizable ribbon actions (all real). Settings stays pinned separately.
  const ribbonActions = useMemo(() => ([
    { id: "files", label: "Files", icon: Notebook, iconSize: "h-[20px] w-[20px]", run: () => setSidebarOpen(true), active: sidebarOpen },
    { id: "new-note", label: "New note", icon: IconEdit, iconSize: "h-[18px] w-[18px]", run: () => handleCreateNote(activeNote ? folderFromPath(activeNote.path) : "") },
    { id: "new-folder", label: "New folder", icon: IconFolderPlus, iconSize: "h-[18px] w-[18px]", run: () => handleCreateFolder() },
    { id: "search", label: "Search", icon: Magnifer, iconSize: "h-[19px] w-[19px]", run: () => openSearchModal() },
    { id: "graph", label: "Graph view", icon: BranchingPathsDown, iconSize: "h-[20px] w-[20px]", run: () => openGraphView(), active: graphOpen },
    { id: "command-palette", label: "Command palette", icon: Command, iconSize: "h-[18px] w-[18px]", run: () => setCommandOpen(true) },
    { id: "skills", label: "Skills", icon: MagicStick3, iconSize: "h-[19px] w-[19px]", run: () => setSkillsOpen(true), active: skillsOpen },
  ]), [sidebarOpen, skillsOpen, graphOpen, activeNote, handleCreateNote, handleCreateFolder, openSearchModal, openGraphView]);

  const toggleRibbonItem = useCallback((id: string) => {
    const current = appearanceSettings.ribbonItems;
    const next = current.includes(id) ? current.filter((value) => value !== id) : [...current, id];
    updateAppearanceSettings({ ribbonItems: next.length ? next : DEFAULT_RIBBON_ITEMS });
  }, [appearanceSettings.ribbonItems, updateAppearanceSettings]);

  // Resolve bookmark paths to live entries (drops stale paths that no longer exist).
  const bookmarkEntries = useMemo(
    () => bookmarks.map((path) => entryList.find((entry) => entry.path === path)).filter(Boolean) as VaultEntry[],
    [bookmarks, entryList],
  );

  // Backfill note contents once when the backlinks pane OR graph view opens —
  // both need every note's body to compute the link graph.
  useEffect(() => {
    if ((!backlinksOpen && !graphOpen) || backlinkBackfilledRef.current || !noteList.length) return;
    backlinkBackfilledRef.current = true;
    let cancelled = false;
    (async () => {
      const queue = noteList.filter((note) => !(note.path in noteContents));
      const CONCURRENT = 16;
      for (let i = 0; i < queue.length && !cancelled; i += CONCURRENT) {
        const batch = await Promise.all(queue.slice(i, i + CONCURRENT).map((meta) => notes.readNote(meta.path).catch(() => null)));
        if (cancelled) return;
        const patch: Record<string, string> = {};
        for (const full of batch) if (full) patch[full.path] = full.content;
        if (Object.keys(patch).length) setNoteContents((prev) => ({ ...prev, ...patch }));
      }
    })();
    return () => { cancelled = true; };
  }, [backlinksOpen, graphOpen, noteList, notes, noteContents]);

  // useDeferredValue keeps typing at 60fps: draft updates immediately for the editor,
  // but the expensive backlinks/wikilink-resolution work defers to idle time.
  const deferredDraft = useDeferredValue(draft);
  const deferredNoteContents = useDeferredValue(noteContents);

  // Notes with available content (used by wikilink resolution + backlinks).
  const liveNotes = useMemo(
    () => noteList.map((note) => ({ ...note, content: note.path === activePath ? deferredDraft : deferredNoteContents[note.path] || "" })),
    [noteList, deferredNoteContents, activePath, deferredDraft],
  );

  const wikiNotes = useMemo(() => liveNotes.map((note) => ({ path: note.path, title: note.title || titleFromPath(note.path) })), [liveNotes]);

  const dataviewNotes = useMemo(
    () =>
      liveNotes.map((note) => ({
        path: note.path,
        title: note.title || titleFromPath(note.path),
        content: note.path === activeNote?.path ? draft : note.content,
      })),
    [liveNotes, activeNote?.path, draft]
  );

  const isResolvedWikilink = useCallback((target: string) => !!resolveWikilinkTarget(target, liveNotes), [liveNotes]);

  const handleWikilinkActivate = useCallback((target: string) => {
    const note = resolveWikilinkTarget(target, liveNotes);
    if (note) openNotePath(note.path);
    else toast(`No note found for [[${target}]]`);
  }, [liveNotes, openNotePath]);

  // Resolves an `![[Target]]` to that note's full body. Used by NoteReader's
  // EmbedBlock for inline transclusion. Triggers a cache warm-up for embeds
  // whose body isn't loaded yet so they appear on the next render tick.
  const getEmbedContent = useCallback((target: string): string | null => {
    const note = resolveWikilinkTarget(target, liveNotes);
    if (!note) return null;
    const cached = deferredNoteContents[note.path];
    if (cached != null) return cached;
    // Cache cold — kick off a read so the next render fills it in.
    notes.readNote(note.path).then((full) => {
      if (full) setNoteContents((prev) => prev[full.path] === full.content ? prev : { ...prev, [full.path]: full.content });
    }).catch(() => { });
    return null;
  }, [liveNotes, deferredNoteContents, notes]);

  // Backlinks for the active note: for each other note's content, find wikilinks resolving to active.
  const backlinks = useMemo(() => {
    if (!activeNote) return [] as { from: NoteFile; snippet: string }[];
    const out: { from: NoteFile; snippet: string }[] = [];
    for (const note of liveNotes) {
      if (note.path === activeNote.path || !note.content) continue;
      WIKILINK_RE_GLOBAL.lastIndex = 0;
      let match: RegExpExecArray | null;
      while ((match = WIKILINK_RE_GLOBAL.exec(note.content)) !== null) {
        const resolved = resolveWikilinkTarget(match[1].trim(), liveNotes);
        if (resolved && resolved.path === activeNote.path) {
          const start = Math.max(0, match.index - 60);
          const end = Math.min(note.content.length, match.index + match[0].length + 60);
          out.push({ from: note, snippet: note.content.slice(start, end).replace(/\s+/g, " ").trim() });
          break;
        }
      }
    }
    return out;
  }, [activeNote, liveNotes]);

  // Outline headings parser for current note content (draft)
  const headings = useMemo(() => {
    const matches = [...draft.matchAll(/^(#{2,3})\s+(.*)$/gm)];
    return matches.map((m) => ({
      level: m[1].length,
      text: m[2],
    }));
  }, [draft]);

  // Outgoing wikilinks parser for current note content (draft)
  const outgoingLinks = useMemo(() => {
    const matches = [...draft.matchAll(/\[\[(.*?)\]\]/g)];
    return matches.map((m) => {
      const raw = m[1];
      const [target, label] = raw.split("|");
      return { target: target.trim(), label: (label || target).trim() };
    });
  }, [draft]);

  // Warm the note cache on hover so clicking opens instantly (was inline on the tree row
  // before <NoteTree> was extracted — moved here verbatim so the component stays presentational).
  const prefetchNote = useCallback((notePath: string) => {
    notes.readNote(notePath).then((full) => {
      if (full) setNoteContents((prev) => prev[notePath] === full.content ? prev : { ...prev, [notePath]: full.content });
    }).catch(() => { });
  }, [notes]);

  // Cross-cutting tree/vault actions bundled into ONE stable object so the memoized
  // <NoteTree> doesn't re-render when the host re-renders (e.g. on debounced editor keystrokes).
  const sidebarActions = useMemo<SidebarActions>(() => ({
    createNote: handleCreateNote,
    createFolder: handleCreateFolder,
    duplicate: handleDuplicateEntry,
    move: handleMoveEntry,
    searchInFolder: handleSearchInFolder,
    toggleBookmark: handleToggleBookmark,
    openToSide: handleOpenToSide,
    copyPath: handleCopyEntryPath,
    reveal: handleRevealEntry,
    rename: handleRenameEntry,
    remove: handleDeleteEntry,
    openVault: handleOpenVault,
  }), [handleCreateNote, handleCreateFolder, handleDuplicateEntry, handleMoveEntry, handleSearchInFolder, handleToggleBookmark, handleOpenToSide, handleCopyEntryPath, handleRevealEntry, handleRenameEntry, handleDeleteEntry, handleOpenVault]);

  // Stable tab-action object so TabStrip (React.memo) doesn't re-render on
  // every host state change.
  const tabActions = useMemo(() => ({
    onOpen: openNotePath,
    onClose: closeTab,
    onCloseOthers: closeOtherTabs,
    onCloseAll: closeAllTabs,
    onSplit: splitTab,
    onCopyPath: handleCopyEntryPath,
    onRevealEntry: handleRevealEntry,
    onRename: handleRenameEntry,
  }), [openNotePath, closeTab, closeOtherTabs, closeAllTabs, splitTab, handleCopyEntryPath, handleRevealEntry, handleRenameEntry]);

  const isDesktopShell = typeof window !== "undefined" && Boolean(window.beebotDesktop);
  const FILE_MANAGER = platformFileManager(); // "Finder" | "Explorer" | "Files"
  const draggableRegion = { WebkitAppRegion: "drag" } as CSSProperties;
  const interactiveRegion = { WebkitAppRegion: "no-drag" } as CSSProperties;
  // Dense desktop chrome buttons: neutralize the Button component's 40px touch-target
  // floor so header/toolbar icons sit small with breathing room (Codex-style).
  const denseIcon = "min-h-0 min-w-0 sm:min-h-0 sm:min-w-0 sm:h-7 sm:w-7";
  const chromeButtonClass = `h-8 w-8 ${denseIcon} rounded-md text-[var(--bb-text-3)] hover:bg-[var(--bb-bg-3)] hover:text-[var(--bb-text-1)] transition-colors`;
  // Shared "active chrome" recipe (neutral bg + inset hairline) — see .bb-active-chrome
  // in index.css. One source of truth for ribbon / chrome buttons / tabs.
  const chromeButtonActiveClass = "bb-active-chrome";
  const ribbonButtonClass = `h-[38px] w-[38px] min-h-0 min-w-0 sm:min-h-0 sm:min-w-0 sm:h-[38px] sm:w-[38px] rounded-[12px] text-[#9b9b9d] hover:bg-[#1a1a1c] hover:text-[#ededed] transition-colors duration-[130ms] flex items-center justify-center shrink-0`;
  const toolbarButtonClass = `h-7 w-7 ${denseIcon} rounded-lg text-[var(--bb-text-3)] hover:bg-[var(--bb-bg-4)] hover:text-[var(--bb-text-1)]`;

  const renderNoteHeader = () => null;

  if (!ready || !userId) {
    return (
      <div className="h-full w-full bg-background flex items-center justify-center text-muted-foreground">
        <div className="h-9 w-9 rounded-full border-2 border-border/40 border-t-primary animate-spin" />
      </div>
    );
  }

  return (
    <div
      className="bb-shell h-full w-full overflow-hidden bg-[var(--bb-bg-0)] text-foreground"
      style={{
        fontFamily: interfaceFontStack,
        "--beebot-accent": appearanceSettings.accentColor,
        "--bb-accent": appearanceSettings.accentColor,
        "--beebot-text-font": textFontStack,
        "--beebot-mono-font": monospaceFontStack,
        "--beebot-note-font-size": `${appearanceSettings.fontSize}px`,
      } as CSSProperties}
    >
      <div
        className="h-full min-h-0 flex flex-col"
        style={{
          paddingTop: "env(safe-area-inset-top, 0px)",
          paddingBottom: "env(safe-area-inset-bottom, 0px)",
          paddingLeft: "env(safe-area-inset-left, 0px)",
          paddingRight: "env(safe-area-inset-right, 0px)",
        }}
      >


        <div className="flex-1 min-h-0 flex bg-[var(--bb-bg-0)]">
          {appearanceSettings.showRibbon && (
            <ContextMenu>
              <ContextMenuTrigger asChild>
                <nav className="bb-glass hidden md:flex w-[52px] shrink-0 border-r border-[rgba(255,255,255,0.07)] flex-col items-center justify-between py-[14px]">
                  <div className="flex flex-col items-center gap-2">
                    {ribbonActions
                      .filter((action) => appearanceSettings.ribbonItems.includes(action.id))
                      .map((action) => {
                        const ActionIcon = action.icon;
                        return (
                          <Button key={action.id} title={action.label} variant="ghost" size="icon" className={cn(ribbonButtonClass, action.active && chromeButtonActiveClass)} onClick={action.run}>
                            <ActionIcon className={cn(action.iconSize || "h-[18px] w-[18px]", "shrink-0")} />
                          </Button>
                        );
                      })}
                  </div>
                  <div className="flex flex-col items-center gap-2">
                    <Button title="Settings" variant="ghost" size="icon" className={cn(ribbonButtonClass, settingsOpen && chromeButtonActiveClass)} onClick={() => setSettingsOpen(true)}>
                      <SolarSettings className="h-[18px] w-[18px]" />
                    </Button>
                  </div>
                </nav>
              </ContextMenuTrigger>
              <ContextMenuContent className="w-56">
                {ribbonActions.map((action) => {
                  const enabled = appearanceSettings.ribbonItems.includes(action.id);
                  const ActionIcon = action.icon;
                  return (
                    <ContextMenuItem key={action.id} onClick={() => toggleRibbonItem(action.id)}>
                      <Check className={cn("mr-2 h-4 w-4", enabled ? "opacity-100 text-[var(--beebot-accent)]" : "opacity-0")} />
                      <ActionIcon className="mr-2 h-4 w-4" strokeWidth={1.8} />
                      {action.label}
                    </ContextMenuItem>
                  );
                })}
                <ContextMenuSeparator />
                <ContextMenuItem onClick={() => updateAppearanceSettings({ showRibbon: false })}>
                  <PanelRightClose className="mr-2 h-4 w-4" />
                  Hide ribbon
                </ContextMenuItem>
              </ContextMenuContent>
            </ContextMenu>
          )}
          <aside
            className={cn(
              "bb-glass shrink-0 flex-col min-h-0 overflow-hidden",
              showSidebar ? "flex" : "hidden",
              isMobile
                ? "w-full flex-1 m-0 rounded-none border-0"
                : "m-[10px_0_10px_10px] rounded-[18px] border-[0.5px] border-[rgba(255,255,255,0.08)] shadow-[0_18px_50px_-16px_rgba(0,0,0,0.6)]",
              !isMobile && resizing !== "sidebar" ? "transition-[width] duration-200 ease-out" : "",
            )}
            style={{
              ...(!isMobile ? { width: sidebarWidth } : {}),
            }}
          >
            <SidebarHeader
              showSidebar={showSidebar}
              isDesktopShell={isDesktopShell}
              sidebarWidth={sidebarWidth}
              draggableRegion={draggableRegion}
              activeVault={activeVault}
              recentVaults={recentVaults}
              isVaultBusy={isVaultBusy}
              onSearch={openSearchModal}
              onNewNote={() => handleCreateNote()}
              onNewFolder={() => handleCreateFolder()}
              onOpenVault={handleOpenVault}
              onCreateVault={() => setCreateVaultOpen(true)}
              onRevealVault={handleRevealVault}
              onSwitchVault={handleSwitchVault}
              onForgetVault={handleForgetVault}
              onExpandAll={expandAllFolders}
              onCollapseAll={collapseAllFolders}
            />

            <AppNav onOpenConsultant={openConsultant} onOpenCfo={openCfo} />

            {needsReopenFolder && (
              <div className="px-2.5 pb-2">
                <button
                  onClick={handleReopenFolder}
                  className="w-full rounded-md border border-[var(--bb-border)] bg-[var(--bb-bg-1)] px-3 py-2 text-left transition-colors hover:bg-[var(--bb-bg-3)]"
                >
                  <span className="block text-[11px] font-semibold text-[var(--beebot-accent)]">Reopen vault folder</span>
                  <span className="block text-[11px] text-[var(--bb-text-3)]">Grant access again to continue editing on disk.</span>
                </button>
              </div>
            )}
            <BookmarksSection
              entries={bookmarkEntries}
              onOpenNote={openNotePath}
              onRevealFolder={revealFolderInTree}
              onToggleBookmark={handleToggleBookmark}
            />
            <NoteTree
              visibleEntries={visibleEntries}
              rowVirtualizer={rowVirtualizer}
              treeScrollRef={treeScrollRef}
              isLoading={isLoading}
              activePath={activePath}
              expandedFolders={expandedFolders}
              highlightedTreePath={highlightedTreePath}
              bookmarks={bookmarks}
              noteContents={noteContents}
              onToggleFolder={toggleFolder}
              onOpenNote={openNotePath}
              onPrefetch={prefetchNote}
              onMoveEntry={moveEntryViaDnd}
              onReorderEntry={reorderEntry}
              actions={sidebarActions}
            />

            {/* Sidebar footer — Settings, pinned to the bottom. */}
            <div className="mt-auto shrink-0 border-t border-[rgba(255,255,255,0.05)] p-[8px_10px]">
              <button
                type="button"
                title="Settings"
                onClick={() => setSettingsOpen(true)}
                className={cn(
                  "group flex w-full items-center gap-2.5 rounded-[10px] px-2.5 py-1.5 text-left text-[13px] text-[#c4c4c6] transition-colors duration-[130ms] hover:bg-[#1a1a1c] hover:text-[#ededed]",
                  settingsOpen && "bg-[#1a1a1c] text-[#ededed]"
                )}
              >
                <span className="flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-[8px] bg-[#1a1a1c] text-[#9b9b9d] group-hover:text-[var(--beebot-accent)] transition-colors duration-[130ms]">
                  <SolarSettings className="h-[15px] w-[15px]" />
                </span>
                <span className="truncate">Settings</span>
              </button>
            </div>
          </aside>

          {/* Sidebar ↔ Main resize handle — hairline default, accent on hover/drag. */}
          {!isMobile && showSidebar && showMainEditor && (
            <div
              role="separator"
              aria-orientation="vertical"
              aria-label="Resize sidebar"
              onPointerDown={(event) => beginResize("sidebar", event)}
              className={cn(
                // Flush handle hugging the sidebar's right edge — no floating
                // offsets now that the sidebar is flush against the ribbon.
                "group relative w-1 shrink-0 cursor-col-resize select-none transition-colors",
                resizing === "sidebar" ? "bg-[var(--bb-accent)]" : "bg-transparent hover:bg-[var(--bb-accent-soft)]",
              )}
              style={{ touchAction: "none" }}
            />
          )}

          <main className={cn(
            "min-w-0 min-h-0 flex-col bg-transparent",
            showMainContent ? "flex" : "hidden",
            isMobile ? "w-full" : "flex-1 mt-[10px]",
          )}>
            <header
              // Header has no own bg — the two child columns provide visually-aligned
              // surfaces: a glass strip for the sidebar half and a transparent area
              // for the main half. Together they look like the sidebar + main panels
              // extend all the way up to the window's top edge (macOS / Telegram /
              // Codex sidebar pattern).
              className="h-[44px] shrink-0 text-[var(--bb-text-1)] flex items-center overflow-hidden px-1.5"
              style={draggableRegion}
            >


              <TabStrip
                tabs={openTabNotes}
                activePath={activePath}
                isDirty={isDirty}
                actions={tabActions}
                onCreateNote={() => handleCreateNote(activeNote ? folderFromPath(activeNote.path) : "")}
                onCreateFolder={() => handleCreateFolder(activeNote ? folderFromPath(activeNote.path) : "")}
                onOpenVault={handleOpenVault}
                onOpenCommandPalette={() => setCommandOpen(true)}
                showSidebar={showSidebar}
                fileManagerLabel={FILE_MANAGER}
                draggableRegion={draggableRegion}
                interactiveRegion={interactiveRegion}
              />

              <ChromeCluster
                sidebarOpen={sidebarOpen}
                editorMode={editorMode}
                skillsOpen={skillsOpen}
                settingsOpen={settingsOpen}
                agentOpen={agentOpen}
                onToggleSidebar={() => setSidebarOpen((value) => !value)}
                onSetEditorMode={setEditorMode}
                onOpenSkills={() => setSkillsOpen(true)}
                onOpenSettings={() => setSettingsOpen(true)}
                onToggleAgent={() => setAgentOpen((value) => !value)}
                showSkillsButton={appearanceSettings.showSkillsButton}
                showPanelButton={appearanceSettings.showPanelButton}
                chromeButtonClass={chromeButtonClass}
                chromeButtonActiveClass={chromeButtonActiveClass}
                interactiveRegion={interactiveRegion}
              />
            </header>
            {/* Editor Section */}
            {(!isMobile || mobileView === "editor") && (
              <section className="flex-1 min-h-0 min-w-0 flex flex-col rounded-[16px_0_0_0]">
                  <div className="min-h-0 w-full flex-1 flex flex-col">
                    <ContextMenu>
                      <ContextMenuTrigger asChild>
                        <div
                          className="h-full min-h-0 overflow-y-auto bg-[var(--bb-bg-0)] flex-1"
                          style={{ viewTransitionName: "bb-note" } as CSSProperties}
                          onKeyDown={handleEditorKeyDown}
                        >
                          <div className={cn("mx-auto p-[30px_32px_96px]", appearanceSettings.readableLineLength ? "max-w-[740px]" : "max-w-none")}>
                            {renderNoteHeader()}
                            <Suspense fallback={<div className="h-32 animate-pulse rounded-lg bg-[var(--bb-bg-2)]" aria-label="Loading workspace" />}>
                              {editorMode === "edit" ? (
                                <LiveMarkdownEditor
                                  value={draft}
                                  onChange={onEditorType}
                                  editable={Boolean(activeNote)}
                                  spellCheck={appearanceSettings.spellcheck}
                                  fontFamily={textFontStack}
                                  editorRef={editorInstanceRef}
                                  onLinkShortcut={promptLinkAndApply}
                                  onBlur={flushTitleSync}
                                  placeholder="Start writing…"
                                  notes={wikiNotes}
                                  onWikilinkActivate={handleWikilinkActivate}
                                  isResolvedTarget={isResolvedWikilink}
                                />
                              ) : (
                                <div style={{ fontFamily: textFontStack }}>
                                  <NoteReader
                                    content={draft}
                                    onWikilinkActivate={handleWikilinkActivate}
                                    isResolvedTarget={isResolvedWikilink}
                                    getNoteContent={getEmbedContent}
                                    notes={dataviewNotes}
                                    className="max-w-none"
                                  />
                                </div>
                              )}
                            </Suspense>
                          </div>
                        </div>
                      </ContextMenuTrigger>
                      <ContextMenuContent className="w-64">
                        {editorMode === "edit" ? (
                          <>
                            <ContextMenuItem disabled={!activeNote} onClick={() => applyMarkdownCommand("link")}>
                              Add link
                            </ContextMenuItem>
                            <ContextMenuItem disabled={!activeNote} onClick={() => applyMarkdownCommand("link")}>
                              Add external link
                            </ContextMenuItem>
                            <ContextMenuSeparator />
                            <ContextMenuSub>
                              <ContextMenuSubTrigger>Format</ContextMenuSubTrigger>
                              <ContextMenuSubContent className="w-48">
                                <ContextMenuItem disabled={!activeNote} onClick={() => applyMarkdownCommand("bold")}>Bold</ContextMenuItem>
                                <ContextMenuItem disabled={!activeNote} onClick={() => applyMarkdownCommand("italic")}>Italic</ContextMenuItem>
                                <ContextMenuItem disabled={!activeNote} onClick={() => applyMarkdownCommand("strikethrough")}>Strikethrough</ContextMenuItem>
                                <ContextMenuItem disabled={!activeNote} onClick={() => applyMarkdownCommand("highlight")}>Highlight</ContextMenuItem>
                                <ContextMenuItem disabled={!activeNote} onClick={() => applyMarkdownCommand("inline-code")}>Code</ContextMenuItem>
                                <ContextMenuItem disabled={!activeNote} onClick={() => applyMarkdownCommand("math")}>Math</ContextMenuItem>
                                <ContextMenuItem disabled={!activeNote} onClick={() => applyMarkdownCommand("comment")}>Comment</ContextMenuItem>
                                <ContextMenuSeparator />
                                <ContextMenuItem disabled={!activeNote} onClick={() => applyMarkdownCommand("clear")}>Clear formatting</ContextMenuItem>
                              </ContextMenuSubContent>
                            </ContextMenuSub>
                            <ContextMenuSub>
                              <ContextMenuSubTrigger>Paragraph</ContextMenuSubTrigger>
                              <ContextMenuSubContent className="w-48">
                                <ContextMenuItem disabled={!activeNote} onClick={() => applyMarkdownCommand("bullet-list")}>Bullet list</ContextMenuItem>
                                <ContextMenuItem disabled={!activeNote} onClick={() => applyMarkdownCommand("numbered-list")}>Numbered list</ContextMenuItem>
                                <ContextMenuItem disabled={!activeNote} onClick={() => applyMarkdownCommand("task-list")}>Task list</ContextMenuItem>
                                <ContextMenuSeparator />
                                {[1, 2, 3, 4, 5, 6].map((level) => (
                                  <ContextMenuItem disabled={!activeNote} key={level} onClick={() => applyMarkdownCommand(`heading-${level}` as MarkdownCommand)}>
                                    Heading {level}
                                  </ContextMenuItem>
                                ))}
                                <ContextMenuSeparator />
                                <ContextMenuItem disabled={!activeNote} onClick={() => applyMarkdownCommand("body")}>Body</ContextMenuItem>
                                <ContextMenuItem disabled={!activeNote} onClick={() => applyMarkdownCommand("quote")}>Quote</ContextMenuItem>
                              </ContextMenuSubContent>
                            </ContextMenuSub>
                            <ContextMenuSub>
                              <ContextMenuSubTrigger>Insert</ContextMenuSubTrigger>
                              <ContextMenuSubContent className="w-48">
                                <ContextMenuItem disabled={!activeNote} onClick={() => applyMarkdownCommand("footnote")}>Footnote</ContextMenuItem>
                                <ContextMenuItem disabled={!activeNote} onClick={() => applyMarkdownCommand("table")}>Table</ContextMenuItem>
                                <ContextMenuItem disabled={!activeNote} onClick={() => applyMarkdownCommand("callout")}>Callout</ContextMenuItem>
                                <ContextMenuItem disabled={!activeNote} onClick={() => applyMarkdownCommand("horizontal-rule")}>Horizontal rule</ContextMenuItem>
                                <ContextMenuSeparator />
                                <ContextMenuItem disabled={!activeNote} onClick={() => applyMarkdownCommand("code-block")}>Code block</ContextMenuItem>
                                <ContextMenuItem disabled={!activeNote} onClick={() => applyMarkdownCommand("math-block")}>Math block</ContextMenuItem>
                              </ContextMenuSubContent>
                            </ContextMenuSub>
                            <ContextMenuSeparator />
                            <ContextMenuItem onClick={() => document.execCommand('cut')}>Cut</ContextMenuItem>
                            <ContextMenuItem onClick={() => document.execCommand('copy')}>Copy</ContextMenuItem>
                            <ContextMenuItem onClick={() => document.execCommand('paste')}>Paste</ContextMenuItem>
                            <ContextMenuItem onClick={() => document.execCommand('insertText')}>Paste as plain text</ContextMenuItem>
                            <ContextMenuItem onClick={() => document.execCommand('selectAll')}>Select all</ContextMenuItem>
                          </>
                        ) : (
                          <>
                            <ContextMenuItem onClick={() => document.execCommand('copy')}>Copy</ContextMenuItem>
                            <ContextMenuItem onClick={() => document.execCommand('selectAll')}>Select all</ContextMenuItem>
                          </>
                        )}
                      </ContextMenuContent>
                    </ContextMenu>
                  </div>
              </section>
            )}
          </main>

          {/* Right Rail / Agent Resizer */}
          {!isMobile && railOpen && (
            <div
              onPointerDown={(event) => beginResize("agent", event)}
              className={cn(
                "group relative w-1 shrink-0 cursor-col-resize select-none transition-colors",
                resizing === "agent" ? "bg-[var(--bb-accent)]" : "bg-transparent hover:bg-[var(--bb-accent-soft)]"
              )}
              style={{ touchAction: "none" }}
            />
          )}

          {/* Unified Floating Right Panel */}
          {(isMobile ? mobileView === "agent" : railOpen) && (
            <aside
              className={cn(
                "bb-glass shrink-0 m-[10px_10px_10px_0] rounded-[18px] border-[0.5px] border-[rgba(255,255,255,0.08)] shadow-[0_18px_50px_-16px_rgba(0,0,0,0.6)] overflow-hidden flex flex-col min-h-0",
                isMobile ? "w-full flex-1 m-0 rounded-none border-0" : "",
                !isMobile && resizing !== "agent" ? "transition-[width] duration-200 ease-out" : ""
              )}
              style={{
                ...(!isMobile ? { width: agentWidth } : {})
              }}
            >
                  {/* Segmented Control Header */}
                  <div className="p-[10px_14px] flex-shrink-0 bg-transparent flex items-center justify-between border-b border-[rgba(255,255,255,0.06)]">
                    <div className="flex bg-[#161618] border border-[rgba(255,255,255,0.06)] rounded-[10px] p-[2px] gap-[2px] flex-1">
                      {[
                        { key: "assistant", label: "Assistant", Icon: ChatRoundLine },
                        { key: "outline", label: "Outline", Icon: SolarList },
                        { key: "links", label: "Links", Icon: LinkRound },
                      ].map((tab) => {
                        const isActive = railTab === tab.key;
                        const TabIcon = tab.Icon;
                        return (
                          <button
                            key={tab.key}
                            type="button"
                            onClick={() => setRailTab(tab.key as any)}
                            className={cn(
                              "flex-1 h-[28px] rounded-[8px] flex items-center justify-center gap-1.5 text-[12px] font-medium transition-all duration-[130ms]",
                              isActive
                                ? "bg-[rgba(255,255,255,0.09)] text-[#f2f2f2] shadow-[0_1px_3px_rgba(0,0,0,0.4)]"
                                : "text-[#9b9b9d] hover:text-[#ededed]"
                            )}
                          >
                            <TabIcon className="h-3.5 w-3.5 shrink-0" />
                            <span>{tab.label}</span>
                            {tab.key === "links" && backlinks.length > 0 && (
                              <span className="text-[10px] px-1 bg-[#1a1a1c] rounded-full text-[#9b9b9d]">{backlinks.length}</span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Context Pill */}
                  {railTab === "assistant" && (
                    <div className="p-[8px_14px] border-b border-[rgba(255,255,255,0.05)] flex items-center gap-1.5 text-[11.5px] text-[#9b9b9d] flex-shrink-0">
                      <span className="inline-block w-1.5 h-1.5 rounded-full bg-[#0a84ff] shrink-0" />
                      <span>Context:</span>
                      <span className="text-[#ededed] font-medium truncate">
                        {activeNote ? (activeNote.title || activeNote.path.split("/").pop()?.replace(/\.md$/i, "")) : "BeeBot Architecture"}
                      </span>
                      <span className="ml-auto text-[10.5px] text-[#7a7a7c] font-mono shrink-0">note</span>
                    </div>
                  )}

                  {/* Tab Contents */}
                  <div className={cn("flex-1 min-h-0 flex flex-col", railTab === "assistant" ? "p-0 overflow-hidden" : "p-4 overflow-y-auto")}>
                    {railTab === "assistant" && (
                      <div className="flex-1 min-h-0 flex flex-col">
                        <Suspense fallback={<div className="flex-1 flex items-center justify-center text-xs text-muted-foreground">Loading BeeBot...</div>}>
                          <BeeBotChatView
                            key={location.key}
                            userId={userId}
                            open={true}
                            initialMessage={initialMessage}
                            embedded
                          />
                        </Suspense>
                      </div>
                    )}

                    {railTab === "outline" && (
                      <div className="flex flex-col gap-3 min-h-0">
                        <h2 className="text-[13px] font-semibold text-[#f2f2f2] mb-1">On this page</h2>
                        {headings.length === 0 ? (
                          <span className="text-xs text-[#7a7a7c] italic">No headings in this note</span>
                        ) : (
                          <div className="flex flex-col gap-1">
                            {headings.map((h, i) => (
                              <button
                                key={i}
                                type="button"
                                className={cn(
                                  "w-full text-left py-1.5 px-3 rounded-[9px] text-[12.5px] transition-colors duration-[130ms] hover:bg-[#1a1a1c] hover:text-[#ededed]",
                                  h.level === 3 ? "pl-6 text-[#9b9b9d]" : "text-[#f2f2f2] font-medium"
                                )}
                              >
                                {h.text}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                    {railTab === "links" && (
                      <div className="flex flex-col gap-4 min-h-0">
                        {/* Backlinks */}
                        <div className="flex flex-col gap-2">
                          <span className="text-[10.5px] font-semibold uppercase tracking-[0.09em] text-[#7a7a7c]">
                            Backlinks · {backlinks.length}
                          </span>
                          {backlinks.length === 0 ? (
                            <span className="text-xs text-[#7a7a7c] italic px-1">No backlinks to this note</span>
                          ) : (
                            backlinks.map((bl) => (
                              <button
                                key={bl.from.path}
                                type="button"
                                onClick={() => openNotePath(bl.from.path)}
                                className="w-full text-left p-3 rounded-[13px] bg-[#161618] border border-[rgba(255,255,255,0.06)] hover:bg-[#1a1a1c] transition-colors duration-[130ms]"
                              >
                                <div className="text-[12.5px] font-semibold text-[#f2f2f2] mb-1 truncate">
                                  {bl.from.title || bl.from.path.split("/").pop()?.replace(/\.md$/i, "")}
                                </div>
                                <div className="text-[11px] text-[#9b9b9d] line-clamp-2 leading-relaxed">
                                  {bl.snippet}
                                </div>
                              </button>
                            ))
                          )}
                        </div>

                        {/* Outgoing links */}
                        <div className="flex flex-col gap-2 pt-2 border-t border-[rgba(255,255,255,0.05)]">
                          <span className="text-[10.5px] font-semibold uppercase tracking-[0.09em] text-[#7a7a7c]">
                            Outgoing · {outgoingLinks.length}
                          </span>
                          {outgoingLinks.length === 0 ? (
                            <span className="text-xs text-[#7a7a7c] italic px-1">No outgoing links from this note</span>
                          ) : (
                            <div className="flex flex-wrap gap-1.5">
                              {outgoingLinks.map((ol, idx) => (
                                <button
                                  key={idx}
                                  type="button"
                                  onClick={() => handleWikilinkActivate(ol.target)}
                                  className="px-2.5 py-1 text-xs rounded-full bg-[#161618] border border-[rgba(255,255,255,0.06)] text-[#ededed] hover:bg-[#1a1a1c] transition-colors duration-[130ms]"
                                >
                                  {ol.label}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </aside>
              )}
        </div>

        <nav
          className="bb-glass-strong md:hidden shrink-0 grid grid-cols-4 border-t border-[var(--bb-glass-border)]"
          style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
        >
          {[
            { key: "files", label: "Files", icon: FolderOpen, onClick: () => setMobileView("files"), active: mobileView === "files" },
            { key: "editor", label: "Editor", icon: FileText, onClick: () => setMobileView("editor"), active: mobileView === "editor" },
            { key: "agent", label: "BeeBot", icon: Bot, onClick: () => setMobileView("agent"), active: mobileView === "agent" },
            { key: "settings", label: "Settings", icon: Settings, onClick: () => setSettingsOpen(true), active: settingsOpen },
          ].map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.key}
                onClick={item.onClick}
                className={cn(
                  "min-h-[54px] flex flex-col items-center justify-center gap-1 text-[10px] font-medium transition-colors",
                  item.active ? "text-[var(--beebot-accent)]" : "text-[var(--bb-text-3)] active:bg-[var(--bb-bg-3)]",
                )}
              >
                <Icon className="h-5 w-5" strokeWidth={1.8} />
                {item.label}
              </button>
            );
          })}
        </nav>
      </div>
      <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
        <DialogContent hideCloseButton className="w-screen max-w-[100vw] h-[100dvh] rounded-none p-0 sm:p-0 md:p-0 md:w-[min(72rem,92vw)] md:max-w-[min(72rem,92vw)] md:h-[min(84vh,860px)] md:rounded-[var(--bb-radius)] overflow-hidden border-[var(--bb-border)] bg-[var(--bb-bg-1)] text-[var(--bb-text-1)]" style={{ boxShadow: "var(--bb-shadow)" }}>
          <div className="h-full min-h-0 flex flex-col md:flex-row">
            <aside className="w-full md:w-64 shrink-0 border-b md:border-b-0 md:border-r border-[var(--bb-border)] bg-[var(--bb-bg-1)] flex flex-col">
              {/* Desktop: back-to-app + search + grouped nav */}
              <div className="hidden md:flex md:flex-col md:flex-1 md:min-h-0 p-3">
                <button
                  onClick={() => setSettingsOpen(false)}
                  className="mb-2 h-9 rounded-lg px-2.5 flex items-center gap-2 text-sm text-[var(--bb-text-2)] hover:bg-[var(--bb-bg-3)] hover:text-[var(--bb-text-1)] transition-colors"
                >
                  <ChevronLeft className="h-4 w-4" />
                  Back to app
                </button>
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
                    {SETTINGS_GROUPS.map((group) => {
                      const items = settingsItems.filter(
                        (it) => group.ids.includes(it.id) && it.label.toLowerCase().includes(settingsSearch.trim().toLowerCase()),
                      );
                      if (!items.length) return null;
                      return (
                        <div key={group.label}>
                          <div className="px-2.5 mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-[var(--bb-text-4)]">{group.label}</div>
                          <div className="space-y-0.5">
                            {items.map((item) => {
                              const Icon = item.icon;
                              const active = settingsPane === item.id;
                              return (
                                <button
                                  key={item.id}
                                  onClick={() => setSettingsPane(item.id)}
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
                    <div>
                      <div className="px-2.5 mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-[var(--bb-text-4)]">Core</div>
                      <div className="space-y-0.5">
                        {[
                          ["Backlinks", Link2],
                          ["Command palette", Command],
                          ["Hotkeys", Keyboard],
                          ["Keychain", KeyRound],
                          ["Local runtime", ShieldCheck],
                        ].map(([label, Icon]) => (
                          <div key={String(label)} className="h-8 px-2.5 flex items-center gap-2.5 text-sm text-[var(--bb-text-4)]">
                            <Icon className="h-4 w-4 shrink-0" />
                            <span className="truncate">{String(label)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </ScrollArea>
              </div>
              {/* Mobile: horizontal pane strip */}
              <div className="md:hidden flex gap-1 overflow-x-auto p-2">
                {settingsItems.map((item) => {
                  const Icon = item.icon;
                  const active = settingsPane === item.id;
                  return (
                    <button
                      key={item.id}
                      onClick={() => setSettingsPane(item.id)}
                      className={cn(
                        "shrink-0 h-9 rounded-lg px-3 flex items-center gap-2 text-sm whitespace-nowrap transition-colors",
                        active ? "bg-[var(--bb-bg-3)] text-[var(--bb-text-1)]" : "text-[var(--bb-text-2)] hover:bg-[var(--bb-bg-3)]",
                      )}
                    >
                      <Icon className="h-4 w-4 shrink-0" />
                      <span>{item.label}</span>
                    </button>
                  );
                })}
              </div>
            </aside>
            <section className="relative flex-1 min-w-0 min-h-0 flex flex-col bg-[var(--bb-bg-1)]">
              <Button
                variant="ghost"
                size="icon"
                className="absolute right-3 top-3 z-10 h-8 w-8 rounded-lg text-[var(--bb-text-3)] hover:bg-[var(--bb-bg-3)] hover:text-[var(--bb-text-1)]"
                onClick={() => setSettingsOpen(false)}
                aria-label="Close settings"
              >
                <X className="h-4 w-4" />
              </Button>
              <ScrollArea className="flex-1 min-h-0">
                <div className="mx-auto max-w-3xl px-5 md:px-10 py-7 md:py-10 space-y-8 md:space-y-10">
                  <div>
                    <DialogTitle className="text-2xl font-semibold tracking-tight text-[var(--bb-text-1)]">{SETTINGS_META[settingsPane].title}</DialogTitle>
                    <p className="mt-1.5 text-sm text-[var(--bb-text-3)]">{SETTINGS_META[settingsPane].subtitle}</p>
                  </div>
                  {settingsPane === "general" && (
                    <>
                      <section className="rounded-2xl border border-[var(--bb-border)] bg-[var(--bb-bg-2)] p-5 md:p-6 space-y-4">
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
                          <VersionCheck />
                        </div>
                        <div className="flex items-center justify-between gap-5 border-t border-[var(--bb-bg-3)] pt-4">
                          <div>
                            <div className="font-medium text-[var(--bb-text-1)]">JARVIS voice assistant <span className="ml-1 rounded bg-[var(--bb-bg-4)] px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-[var(--bb-text-3)]">Dev</span></div>
                            <div className="text-sm text-[var(--bb-text-3)]">Voice control (⌘J). Off by default — experimental.</div>
                          </div>
                          <Switch checked={jarvisOn} onCheckedChange={(checked) => { jarvisEnabled.set(checked); setJarvisOn(checked); }} />
                        </div>
                        {jarvisOn && (
                          <div className="flex flex-col gap-3 rounded-2xl border border-[var(--bb-border)] bg-[var(--bb-bg-2)] p-4">
                            <div className="flex items-center justify-between gap-4">
                              <div>
                                <div className="text-sm font-medium text-[var(--bb-text-1)]">Live mode <span className="ml-1 rounded bg-[var(--bb-bg-4)] px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-[var(--bb-text-3)]">Realtime</span></div>
                                <div className="text-xs text-[var(--bb-text-3)]">Phone-call mode — one duplex WebSocket (server VAD, barge-in, sub-second). Reopen the orb after toggling.</div>
                              </div>
                              <Switch checked={jarvisLive} onCheckedChange={(checked) => { jarvisLiveMode.set(checked); setJarvisLive(checked); }} />
                            </div>
                            <div className="flex items-center justify-between gap-4 border-t border-[var(--bb-bg-3)] pt-3">
                              <div>
                                <div className="text-sm font-medium text-[var(--bb-text-1)]">Wake word <span className="ml-1 rounded bg-[var(--bb-bg-4)] px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-[var(--bb-text-3)]">Hands-free</span></div>
                                <div className="text-xs text-[var(--bb-text-3)]">Say “Jarvis” to open the orb while it's closed. Listens continuously via browser speech — the mic stays on.</div>
                              </div>
                              <Switch checked={jarvisWake} onCheckedChange={(checked) => { jarvisWakeWord.set(checked); setJarvisWake(checked); }} />
                            </div>
                            {jarvisLive && (
                              <div className="flex items-center justify-between gap-4 border-t border-[var(--bb-bg-3)] pt-3">
                                <div>
                                  <div className="text-sm font-medium text-[var(--bb-text-1)]">Live model</div>
                                  <div className="text-xs text-[var(--bb-text-3)]">One model does STT + reasoning + speech over the socket.</div>
                                </div>
                                <select
                                  value={jarvisLiveModel}
                                  onChange={(e) => { jarvisModels.setLive(e.target.value); setJarvisLiveModel(e.target.value); }}
                                  className="rounded-lg border border-[var(--bb-border)] bg-[var(--bb-bg-4)] px-3 py-1.5 text-sm text-[var(--bb-text-1)] outline-none"
                                >
                                  {jarvisModels.liveOptions.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
                                </select>
                              </div>
                            )}
                            <div className="flex items-center justify-between gap-4 border-t border-[var(--bb-bg-3)] pt-3">
                              <div>
                                <div className="text-sm font-medium text-[var(--bb-text-1)]">Brain model <span className="text-[var(--bb-text-3)]">(voice → understanding)</span></div>
                                <div className="text-xs text-[var(--bb-text-3)]">Turn-based path only (Live mode off). Transcribes + understands your speech.</div>
                              </div>
                              <select
                                value={jarvisBrainModel}
                                onChange={(e) => { jarvisModels.setBrain(e.target.value); setJarvisBrainModel(e.target.value); }}
                                className="rounded-lg border border-[var(--bb-border)] bg-[var(--bb-bg-4)] px-3 py-1.5 text-sm text-[var(--bb-text-1)] outline-none"
                              >
                                {jarvisModels.brainOptions.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
                              </select>
                            </div>
                            <div className="flex items-center justify-between gap-4 border-t border-[var(--bb-bg-3)] pt-3">
                              <div>
                                <div className="text-sm font-medium text-[var(--bb-text-1)]">Voice model <span className="text-[var(--bb-text-3)]">(TTS)</span></div>
                                <div className="text-xs text-[var(--bb-text-3)]">Speaks the reply. 3.1 Flash TTS is more expressive & multilingual.</div>
                              </div>
                              <select
                                value={jarvisTtsModel}
                                onChange={(e) => { jarvisModels.setTts(e.target.value); setJarvisTtsModel(e.target.value); }}
                                className="rounded-lg border border-[var(--bb-border)] bg-[var(--bb-bg-4)] px-3 py-1.5 text-sm text-[var(--bb-text-1)] outline-none"
                              >
                                {jarvisModels.ttsOptions.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
                              </select>
                            </div>

                            {/* ── Gemini API key manager ──
                                Cyber-security hardening: the key is a Google credential with billing/quota
                                implications. We (1) never show it in plaintext by default — masked to last 4,
                                (2) reveal only on an explicit eye-toggle, (3) clear the draft + revert to masked
                                view on save/cancel, (4) never log it, (5) the input has autoComplete=off +
                                spellcheck off so browser autofill/history can't capture it. Reveal is a
                                conscious, momentary action — like showing a password. */}
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
                                    <span className="font-mono text-xs text-[var(--bb-text-2)]">
                                      {jarvisKeyReveal ? geminiKey.get() : `••••••••••${geminiKey.get().slice(-4)}`}
                                    </span>
                                    <button
                                      type="button"
                                      onClick={() => setJarvisKeyReveal((v) => !v)}
                                      className="ml-1 text-[var(--bb-text-4)] hover:text-[var(--bb-text-2)]"
                                      aria-label={jarvisKeyReveal ? "Hide key" : "Reveal key"}
                                    >
                                      {jarvisKeyReveal ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                                    </button>
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
                                      onClick={() => { geminiKey.set(""); setJarvisKeyDraft(""); setJarvisKeyReveal(false); }}
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
                                      onClick={() => setJarvisKeyReveal((v) => !v)}
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
                                      onClick={() => { geminiKey.set(jarvisKeyDraft.trim()); setJarvisKeyDraft(""); setJarvisKeyReveal(false); setJarvisKeyEditing(false); }}
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
                                    🔒 Stored only on this device (localStorage). Never sent anywhere except Google's API. Get a free key at aistudio.google.com/apikey.
                                  </p>
                                </div>
                              )}
                            </div>
                          </div>
                        )}
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
                            { value: "edit" as EditorMode, icon: IconEdit, title: "Editing view", desc: "Live Markdown with inline formatting." },
                            { value: "preview" as EditorMode, icon: IconBook2, title: "Reading view", desc: "Rendered, distraction-free reading." },
                          ]).map((opt) => {
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
                        ].map(([title, description, key]) => (
                          <div key={key} className="flex items-center justify-between gap-5 border-b border-[var(--bb-bg-3)] last:border-b-0 pb-4 last:pb-0">
                            <div>
                              <div className="font-medium text-[var(--bb-text-1)]">{title}</div>
                              <div className="text-sm text-[var(--bb-text-3)]">{description}</div>
                            </div>
                            <Switch
                              checked={Boolean(appearanceSettings[key as keyof WorkspaceAppearanceSettings])}
                              onCheckedChange={(checked) => updateAppearanceSettings({ [key]: checked } as Partial<WorkspaceAppearanceSettings>)}
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
                          <Button variant="secondary" className="bg-[var(--bb-bg-4)] text-[var(--bb-text-1)] hover:bg-[var(--bb-border-strong)]" onClick={() => search.rebuildNoteIndex().then(() => toast.success("Index rebuilt")).catch(() => toast.error("Index rebuild failed"))}>
                            Rebuild
                          </Button>
                        </div>
                      </section>
                    </>
                  )}

                  {settingsPane === "appearance" && (
                    <>
                      <section className="rounded-2xl border border-[var(--bb-border)] bg-[var(--bb-bg-2)] p-5 md:p-6 space-y-4">
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
                          onSaved={(newId) => updateAppearanceSettings({ customThemeId: newId })}
                        />
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
                      </section>

                      <section className="space-y-3">
                        <div className="text-xs font-semibold uppercase tracking-wide text-[var(--bb-text-4)]">Font</div>
                        <div className="rounded-2xl border border-[var(--bb-border)] bg-[var(--bb-bg-2)] p-5 md:p-6 space-y-4">
                          {[
                            ["Interface font", "Set base font for the app shell.", "interfaceFonts"],
                            ["Text font", "Set font for editing and reading views.", "textFonts"],
                            ["Monospace font", "Set font for Markdown source and code.", "monospaceFonts"],
                          ].map(([title, description, key]) => {
                            const fonts = appearanceSettings[key as FontTarget];
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
                                    setFontTarget(key as FontTarget);
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
                              <Slider value={[appearanceSettings.fontSize]} min={13} max={22} step={1} onValueChange={([value]) => updateAppearanceSettings({ fontSize: value })} />
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
                      ) : groupedSkills.map(([category, categorySkills]) => (
                        <div key={category} className="rounded-2xl border border-[var(--bb-border)] bg-[var(--bb-bg-2)] p-5 md:p-6 space-y-4">
                          <div className="text-xs font-semibold uppercase tracking-normal text-[var(--bb-text-3)]">{category}</div>
                          {categorySkills.map((skill) => (
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
                {appearanceSettings[fontTarget].map((font, index) => {
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

              {/* Search / add by name. First focus triggers a one-shot device-font
                  load (a user gesture — satisfies queryLocalFonts's requirement
                  and avoids the eager-load perf hit on app boot). */}
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

              {/* Suggestions — every font rendered in its own typeface. Click the
                  row to ADD as a fallback; click "Apply" to make it the ACTIVE
                  (first-choice) font immediately. */}
              {fontSuggestions.length > 0 && (
                <div className="max-h-72 overflow-auto rounded-xl border border-[var(--bb-border)] bg-[var(--bb-bg-2)] p-1">
                  {fontSuggestions.slice(0, 120).map((font) => (
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
              {groupedSkills.map(([category, categorySkills]) => (
                <section key={category} className="space-y-2">
                  <div className="text-xs font-semibold uppercase tracking-normal text-muted-foreground">{category}</div>
                  <div className="space-y-2">
                    {categorySkills.map((skill) => (
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
                          {skill.manifest.permissions.map((permission) => (
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
            <CommandItem onSelect={() => runCommand(() => (isMobile ? setMobileView("agent") : setAgentOpen((value) => !value)))}>
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
                {noteList.slice(0, 50).map((note) => (
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

      {/* Hash-routed Search dialog — lazy mounted, no idle cost when closed. */}
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
                placeholder="Search notes, headings, content…"
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
                searchResults.slice(0, 50).map((result) => (
                  <button
                    key={`${result.source}:${result.path}`}
                    type="button"
                    onClick={() => { if (result.path) openNotePath(result.path); closeSearchModal(); }}
                    className="flex w-full items-start gap-2 rounded-md px-3 py-2 text-left transition-colors hover:bg-[var(--bb-bg-3)]"
                  >
                    <FileText className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--bb-text-3)]" />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm text-[var(--bb-text-1)]">{result.title || titleFromPath(result.path || "")}</div>
                      {result.snippet && <div className="mt-0.5 line-clamp-1 text-[11.5px] text-[var(--bb-text-3)]">{result.snippet}</div>}
                    </div>
                  </button>
                ))
              )}
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>

      {/* Hash-routed Graph view — force-directed visualization of the vault's wikilink web. */}
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
                  notes={liveNotes.map((n) => ({ path: n.path, title: n.title || titleFromPath(n.path), content: n.content }))}
                  activePath={activePath}
                  resolve={(target) => resolveWikilinkTarget(target, liveNotes)?.path ?? null}
                  onNodeClick={(path) => { openNotePath(path); closeGraphView(); }}
                />
              )}
            </Suspense>
          </div>
        </DialogContent>
      </Dialog>

      {/* Hash-routed Version history — local File Recovery for the active note. */}
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
                versions.map((version, index) => (
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

      {/* Personal CFO (FlowState) — lazy, hash-routed (#cfo). Closing returns to notes. */}
      {cfoOpen && userId && (
        <Suspense fallback={null}>
          <FlowStateDialog open={cfoOpen} onOpenChange={(open) => { if (!open) closeCfo(); }} userId={userId} />
        </Suspense>
      )}

      {/* Agent Consultant — full-screen page (hash-routed #consultant). Back button + Esc return to notes. */}
      {consultantOpen && userId && (
        <div className="fixed inset-0 z-50 bg-[var(--bb-bg-1)] flex flex-col">
          <div
            className="h-10 shrink-0 border-b border-[var(--bb-border)] px-3 flex items-center gap-2 bg-[var(--bb-bg-2)]"
            // Reserve the traffic-light gutter so the OS lights sit to the LEFT of
            // "Back to notes" (which shifts right). Drag the window by this bar.
            style={{ ...draggableRegion, paddingLeft: "calc(0.75rem + var(--titlebar-safe))" }}
          >
            <Button variant="ghost" size="sm" onClick={closeConsultant} className="gap-1.5 h-7 px-2 text-xs" style={interactiveRegion}>
              <ArrowLeft className="h-4 w-4" /> Back to notes
            </Button>
            <span className="text-xs font-semibold text-[var(--bb-text-2)] ml-2" style={interactiveRegion}>Agent Consultant</span>
          </div>
          {/* flex flex-col is required: AgentConsultantPanel's root is `flex-1 min-h-0`
              and needs a flex-column parent, or its inner `overflow-y-auto` column never
              gets a bounded height and the dashboard can't scroll (content gets clipped). */}
          <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
            <Suspense fallback={<div className="h-full flex items-center justify-center text-xs text-muted-foreground">Loading Consultant...</div>}>
              <AgentConsultantPanel userId={userId} onClose={closeConsultant} />
            </Suspense>
          </div>
        </div>
      )}
    </div>
  );
}
