import { Suspense, startTransition, useCallback, useDeferredValue, useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent } from "react";
import { lazyWithRetry } from "@/lib/lazyWithRetry";
import { useLocation, useSearchParams } from "react-router-dom";
import { WorkspaceEditorContext, WorkspaceShellContext, reuseContextValue } from "./workspace/WorkspaceContext";
import { WorkspaceLayout } from "./workspace/WorkspaceLayout";
import { MicroErrorBoundary } from "@/components/MicroErrorBoundary";
import { Icon } from "@iconify/react";
import { ChatRoundLine, Notebook, Magnifer, BranchingPathsDown, MagicStick3, Settings as SolarSettings, UserCircle, Pen, FolderPathConnect, Tuning2, Refresh } from "@solar-icons/react";
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
import type { LiveEditorHandle, MarkdownCommand } from "@/components/editor/LiveMarkdownEditor";
// Split CodeMirror (~300KB) into its own chunk so the workspace shell loads first.
const LiveMarkdownEditor = lazyWithRetry(() => import("@/components/editor/LiveMarkdownEditor").then((m) => ({ default: m.LiveMarkdownEditor })));
const NoteReader = lazyWithRetry(() => import("@/components/editor/NoteReader").then((m) => ({ default: m.NoteReader })));
// Force-directed graph view — only loaded when the user opens #graph.
const GraphView = lazyWithRetry(() => import("@/components/editor/GraphView").then((m) => ({ default: m.GraphView })));
const WorkspaceModals = lazyWithRetry(() =>
  import("./workspace/WorkspaceModals").then((m) => ({ default: m.WorkspaceModals })),
);
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
import { evEnabled as jarvisEnabled, evModels as jarvisModels, evWakeWord as jarvisWakeWord, geminiKey } from "@/features/ev-voice";
import { cn } from "@/lib/utils";
import { platformFileManager, reduceEffects } from "@/lib/desktopChrome";
import { nativeHaptic, nativeViewTransition } from "@/lib/nativeExperience";
import { applyAccent } from "@/lib/accentColor";
import { applyThemeVariables, applyTypographyVariables } from "@/lib/theme/themeEngine";
import { themeStore } from "@/repositories/local/themeStore";
import { noteOrder } from "@/repositories/local/noteOrderStore";
import { sortVaultEntries } from "@/features/notes/sortEntries";
import { ThemeStorePanel } from "@/components/settings/ThemeStorePanel";
import { ThemeEditorDialog } from "@/components/settings/ThemeEditorDialog";
import { VersionCheck } from "@/components/settings/VersionCheck";
import { useWorkspaceIdentity } from "@/hooks/useWorkspaceIdentity";
import { useIsMobile } from "@/hooks/use-mobile";
import { useIsolatedRoom } from "@/hooks/useIsolatedRoom";
import {
  createSnapshotId,
  registerWorkspaceActionPort,
  registerWorkspaceContextPort,
  stableContentHash,
} from "@/features/ev-voice/workspace/workspaceContext";
import type {
  WorkspaceActiveFile,
  WorkspaceOpenFile,
} from "@/features/ev-voice/workspace/contracts";
import { useRepositories } from "@/repositories/runtime/RepositoryProvider";
import type { NoteFile, NoteVersion, VaultEntry } from "@/repositories/contracts/notes";
import { NoteTree } from "@/features/notes/sidebar/NoteTree";
import { SidebarHeader } from "@/features/notes/sidebar/SidebarHeader";
import { AppNav } from "@/features/notes/sidebar/AppNav";
import { BookmarksSection } from "@/features/notes/sidebar/BookmarksSection";
import { useNoteTree } from "@/features/notes/sidebar/useNoteTree";
import { TabStrip } from "@/features/notes/tabs/TabStrip";
import { ChromeCluster } from "@/features/notes/chrome/ChromeCluster";
import { atomicBlockMerge } from "@/lib/crdt/atomicBlockMerge";
import type { SidebarActions } from "@/features/notes/sidebar/types";
import type { WorkspaceHealthError } from "@/features/notes/health/workspaceHealth";
import type { SearchResult } from "@/repositories/contracts/search";
import type { InstalledSkill, SkillRegistrySummary } from "@/repositories/contracts/skills";
import type { VaultInfo } from "@/repositories/contracts/vault";
import {
  isMatchingLocalWriteEcho,
  rememberLocalNoteWrite,
  shouldAnimateNoteSwitch,
  type LocalWriteMarker,
} from "./workspace/notePerformance";

const BeeBotChatView = lazyWithRetry(() =>
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
const DEFAULT_RIBBON_ITEMS = ["files", "new-note", "new-folder", "search", "graph", "command-palette", "skills"];
const BOOKMARKS_STORAGE_KEY = "workspace.bookmarks";

const LEGACY_INTERFACE_FONTS = ["Inter", "SF Pro Text", "Helvetica Neue", "Arial"];
const DEFAULT_APPEARANCE_SETTINGS: WorkspaceAppearanceSettings = {
  accentColor: "#f4d35e",
  theme: "dark",
  customThemeId: null, // Fresh installs start on the pristine System Default; Flat Dark is opt-in
  colorCustomizations: {},
  interfaceFonts: ["SF Pro Text", "-apple-system", "Helvetica Neue", "Arial"],
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

const EMPTY_FONT_LIST: string[] = [];

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

// ponytail: these MUST live at module scope. Vite/Rolldown hoists pure expressions
// out of component bodies into module scope anyway, but places them AFTER the
// component's useCallback closures that reference them → TDZ crash
// ("Cannot access 'Oo' before initialization"). Declaring them here explicitly
// guarantees they're initialized before any component code runs.
const IS_DESKTOP_SHELL = typeof window !== "undefined" && Boolean((window as unknown as Record<string, unknown>).beebotDesktop);
const FILE_MANAGER = platformFileManager(); // "Finder" | "Explorer" | "Files"
const DRAGGABLE_REGION = { WebkitAppRegion: "drag" } as CSSProperties;
const INTERACTIVE_REGION = { WebkitAppRegion: "no-drag" } as CSSProperties;
const DENSE_ICON = "min-h-0 min-w-0 sm:min-h-0 sm:min-w-0 sm:h-7 sm:w-7";
const CHROME_BUTTON_CLASS = `h-8 w-8 ${DENSE_ICON} rounded-md text-[var(--bb-text-3)] hover:bg-[var(--bb-bg-3)] hover:text-[var(--bb-text-1)] transition-colors`;
const CHROME_BUTTON_ACTIVE_CLASS = "bb-active-chrome";
const RIBBON_BUTTON_CLASS = `h-[38px] w-[38px] min-h-0 min-w-0 sm:min-h-0 sm:min-w-0 sm:h-[38px] sm:w-[38px] rounded-[12px] text-[#9b9b9d] hover:bg-[#1a1a1c] hover:text-[#ededed] transition-colors duration-[130ms] flex items-center justify-center shrink-0`;
const TOOLBAR_BUTTON_CLASS = `h-7 w-7 ${DENSE_ICON} rounded-lg text-[var(--bb-text-3)] hover:bg-[var(--bb-bg-4)] hover:text-[var(--bb-text-1)]`;

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

// ponytail: replace O(N) linear array scans with a cached O(1) Hash Map lookup so graph building and wikilinks never freeze the UI thread!
let cachedNotesRef: NoteFile[] | null = null;
let noteIndexMap: Map<string, NoteFile> = new Map();

function getNoteIndexMap(notes: NoteFile[]): Map<string, NoteFile> {
  if (cachedNotesRef === notes && noteIndexMap.size > 0) return noteIndexMap;
  cachedNotesRef = notes;
  noteIndexMap = new Map();
  for (const note of notes) {
    const p = note.path.toLowerCase();
    const t = (note.title || "").toLowerCase();
    const tp = titleFromPath(note.path).toLowerCase();
    noteIndexMap.set(p, note);
    if (t && !noteIndexMap.has(t)) noteIndexMap.set(t, note);
    if (tp && !noteIndexMap.has(tp)) noteIndexMap.set(tp, note);
    if (p.endsWith(".md")) {
      const base = p.replace(/\.md$/, "");
      const slashIdx = base.lastIndexOf("/");
      const name = slashIdx >= 0 ? base.slice(slashIdx + 1) : base;
      if (!noteIndexMap.has(name)) noteIndexMap.set(name, note);
      if (!noteIndexMap.has(`${name}.md`)) noteIndexMap.set(`${name}.md`, note);
    }
  }
  return noteIndexMap;
}

function resolveWikilinkTarget(target: string, notes: NoteFile[]): NoteFile | null {
  if (!target) return null;
  const map = getNoteIndexMap(notes);
  const needle = target.toLowerCase();
  return map.get(needle) || map.get(`${needle}.md`) || null;
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
  const storedInterfaceFonts = input?.interfaceFonts;
  const usesLegacyDefault = storedInterfaceFonts?.length === LEGACY_INTERFACE_FONTS.length
    && storedInterfaceFonts.every((font, index) => font === LEGACY_INTERFACE_FONTS[index]);
  return {
    ...DEFAULT_APPEARANCE_SETTINGS,
    ...(input || {}),
    interfaceFonts: storedInterfaceFonts?.length && !usesLegacyDefault
      ? storedInterfaceFonts
      : DEFAULT_APPEARANCE_SETTINGS.interfaceFonts,
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
  const baseContentRef = useRef("");
  const titleSyncingRef = useRef(false);
  const isSavingRef = useRef(false); // ponytail: in-flight guard to prevent concurrent save races
  const draftCommitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const editorInstanceRef = useRef<LiveEditorHandle | null>(null);
  const saveQueueRef = useRef<Promise<void>>(Promise.resolve());
  const pendingSaveCountRef = useRef(0);
  const noteFileCacheRef = useRef(new Map<string, NoteFile>());
  const recentLocalWritesRef = useRef(new Map<string, LocalWriteMarker>());
  const [draft, setDraft] = useState("");
  activeNoteRef.current = activeNote;
  // `draftRef` is the always-live text (autosave + title-sync read it). It is kept
  // current by the two setters below, NOT at render time — so debouncing the heavy
  // React re-render never leaves the save path with stale content.
  // Programmatic set (note open / clear): commit immediately, cancel any pending typing commit.
  const setDraftImmediate = useCallback((content: string) => {
    draftRef.current = content;
    baseContentRef.current = content;
    if (draftCommitTimerRef.current) clearTimeout(draftCommitTimerRef.current);
    setDraft(content);
  }, []);
  // Editor keystrokes: keep the ref live instantly, but DEBOUNCE the React state
  // commit (~180ms) so the 3,600-line workspace tree doesn't re-render every keystroke.
  const commitEditorDraft = useCallback((deferred = false) => {
    if (draftCommitTimerRef.current) clearTimeout(draftCommitTimerRef.current);
    draftCommitTimerRef.current = null;
    const content = editorInstanceRef.current?.getMarkdown() ?? draftRef.current;
    draftRef.current = content;
    const updateDraft = () => setDraft((current) => (current === content ? current : content));
    if (deferred) startTransition(updateDraft);
    else updateDraft();
    return content;
  }, []);
  const onEditorType = useCallback(() => {
    if (draftCommitTimerRef.current) clearTimeout(draftCommitTimerRef.current);
    draftCommitTimerRef.current = setTimeout(() => commitEditorDraft(true), 180);
  }, [commitEditorDraft]);
  const [query, setQuery] = useState("");
  const [newVaultName, setNewVaultName] = useState("BeeBot Vault");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [editorMode, setEditorMode] = useState<EditorMode>("edit");
  const [railOpen, setRailOpen] = useState(false);
  const [railTab, setRailTab] = useState<"assistant" | "signals">("assistant");
  const agentOpen = railOpen && railTab === "assistant";
  const setAgentOpen = (open: boolean | ((prev: boolean) => boolean)) => {
    setRailOpen((prev) => {
      const nextOpen = typeof open === "function" ? open(prev && railTab === "assistant") : open;
      if (nextOpen) setRailTab("assistant");
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
  const [healthOpen, setHealthOpen] = useState(() => typeof window !== "undefined" && window.location.hash === "#health");
  // ponytail: Grok-style Isolated Room routing (?_s=cfo/consultant)
  const { activeRoom, openRoom, closeRoom } = useIsolatedRoom();
  const cfoOpen = activeRoom === "cfo";
  const consultantOpen = activeRoom === "consultant";
  const [versions, setVersions] = useState<NoteVersion[]>([]);
  const [versionsLoading, setVersionsLoading] = useState(false);
  const [workspaceErrors, setWorkspaceErrors] = useState<WorkspaceHealthError[]>([]);

  // E.V reads workspace truth on demand. The port keeps editor text in CodeMirror/draftRef
  // until a voice tool explicitly asks for it, so typing never publishes global React state.
  useEffect(() => registerWorkspaceContextPort({
    async capture() {
      const capturedAt = new Date().toISOString();
      const currentPath = activePathRef.current;
      const currentNote = activeNoteRef.current;
      const tabPaths = splitPath && !openTabs.includes(splitPath)
        ? [...openTabs, splitPath]
        : openTabs;
      const openFiles: WorkspaceOpenFile[] = tabPaths.map((path) => {
        const listed = noteList.find((note) => note.path === path);
        const active = path === currentPath;
        const content = active
          ? (editorInstanceRef.current?.getMarkdown() ?? draftRef.current)
          : undefined;
        return {
          path,
          title: listed?.title || (active ? currentNote?.title : undefined) || titleFromPath(path),
          active,
          split: path === splitPath,
          dirty: active && !!currentNote && content !== currentNote.content,
        };
      });

      let activeFile: WorkspaceActiveFile | null = null;
      if (currentPath) {
        const editorContent = editorInstanceRef.current?.getMarkdown();
        if (typeof editorContent === "string" && currentNote?.path === currentPath) {
          activeFile = {
            path: currentPath,
            title: currentNote.title || titleFromPath(currentPath),
            content: editorContent,
            contentHash: stableContentHash(editorContent),
            source: "editor-draft",
            active: true,
            split: currentPath === splitPath,
            dirty: editorContent !== currentNote.content,
            mtimeMs: currentNote.mtimeMs,
          };
        } else if (currentNote?.path === currentPath) {
          const content = draftRef.current || currentNote.content;
          activeFile = {
            path: currentPath,
            title: currentNote.title || titleFromPath(currentPath),
            content,
            contentHash: stableContentHash(content),
            source: "active-cache",
            active: true,
            split: currentPath === splitPath,
            dirty: content !== currentNote.content,
            mtimeMs: currentNote.mtimeMs,
          };
        } else {
          const repositoryNote = await notes.readNote(currentPath);
          if (repositoryNote) {
            activeFile = {
              path: repositoryNote.path,
              title: repositoryNote.title || titleFromPath(repositoryNote.path),
              content: repositoryNote.content,
              contentHash: repositoryNote.contentHash || stableContentHash(repositoryNote.content),
              source: "repository",
              active: true,
              split: currentPath === splitPath,
              dirty: false,
              mtimeMs: repositoryNote.mtimeMs,
            };
          }
        }
      }
      const contentHash = activeFile?.contentHash || "none";
      return {
        snapshotId: createSnapshotId(capturedAt, contentHash),
        capturedAt,
        room: activeRoom,
        vault: activeVault ? { name: activeVault.name, path: activeVault.path } : undefined,
        openFiles,
        activeFile,
      };
    },
  }), [activeRoom, activeVault, noteList, notes, openTabs, splitPath]);

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
  const [jarvisWake, setJarvisWake] = useState(() => jarvisWakeWord.get());
  const [reduceFx, setReduceFx] = useState(() => reduceEffects.get());
  // JARVIS Gemini API key management — view (masked), edit, save, clear. Never expose the raw key
  // in plaintext by default; toggle reveals it only on explicit user action.
  const [jarvisKeyEditing, setJarvisKeyEditing] = useState(false);
  const [jarvisKeyDraft, setJarvisKeyDraft] = useState("");
  const [jarvisKeyReveal, setJarvisKeyReveal] = useState(false);
  const [hasJarvisKey, setHasJarvisKey] = useState(() => Boolean(geminiKey.get()));
  useEffect(() => {
    const sync = () => setHasJarvisKey(Boolean(geminiKey.get()));
    window.addEventListener(geminiKey.EVENT, sync);
    void geminiKey.refresh().then(setHasJarvisKey).catch(() => setHasJarvisKey(false));
    return () => window.removeEventListener(geminiKey.EVENT, sync);
  }, []);
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
  const [fsaSupported] = useState(() => isFileSystemAccessSupported());
  const [needsReopenFolder, setNeedsReopenFolder] = useState(false);
  const isMobile = useIsMobile();
  const [mobileView, setMobileViewState] = useState<"home" | "files" | "editor" | "agent">("home");
  const setMobileView = useCallback((next: "home" | "files" | "editor" | "agent") => {
    if (next === mobileView) return;
    const order = { home: 0, files: 1, editor: 2, agent: 3 } as const;
    const direction = order[next] > order[mobileView] ? "forward" : "back";
    nativeHaptic("selection");
    nativeViewTransition(direction, () => setMobileViewState(next));
  }, [mobileView]);
  const openContentSignals = useCallback(() => {
    const signalsAreOpen = railOpen && railTab === "signals";
    if (signalsAreOpen) {
      setRailOpen(false);
      if (isMobile) setMobileView("editor");
      return;
    }
    setRailTab("signals");
    setRailOpen(true);
    if (isMobile) setMobileView("agent");
  }, [isMobile, railOpen, railTab, setMobileView]);
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

  useEffect(() => {
    window.beebotDesktop?.setDocumentState?.({ path: activePath, edited: isDirty });
  }, [activePath, isDirty]);

  useEffect(() => {
    window.beebotDesktop?.setNativeContextMenus?.(appearanceSettings.nativeMenus);
  }, [appearanceSettings.nativeMenus]);

  useEffect(() => () => {
    window.beebotDesktop?.setDocumentState?.({ path: null, edited: false });
  }, []);
  const interfaceFontStack = fontStack(appearanceSettings.interfaceFonts);
  const textFontStack = fontStack(appearanceSettings.textFonts);
  const recordWorkspaceError = useCallback((area: WorkspaceHealthError["area"], error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    setWorkspaceErrors((current) => [{ at: Date.now(), area, message }, ...current].slice(0, 3));
  }, []);

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
      setHealthOpen(h === "#health");
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
  const openHealth = useCallback(() => {
    if (window.location.hash !== "#health") window.location.hash = "health";
    else setHealthOpen(true);
  }, []);
  const closeHealth = useCallback(() => {
    setHealthOpen(false);
    if (window.location.hash === "#health") history.replaceState(null, "", window.location.pathname + window.location.search);
  }, []);
  // Personal CFO & Agent Consultant — isolated rooms (?_s=cfo/consultant).
  const openCfo = useCallback(() => openRoom("cfo"), [openRoom]);
  const closeCfo = useCallback(() => closeRoom(), [closeRoom]);
  const openConsultant = useCallback(() => openRoom("consultant"), [openRoom]);
  const closeConsultant = useCallback(() => closeRoom(), [closeRoom]);

  const monospaceFontStack = fontStack(appearanceSettings.monospaceFonts);
  useEffect(() => {
    applyTypographyVariables({
      interfaceFont: interfaceFontStack,
      textFont: textFontStack,
      monospaceFont: monospaceFontStack,
    });
  }, [interfaceFontStack, textFontStack, monospaceFontStack]);

  useEffect(() => () => applyTypographyVariables(null), []);
  const currentFontList = fontTarget ? appearanceSettings[fontTarget] : EMPTY_FONT_LIST;
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
    const resultPaths = new Set(searchResults.filter((result) => result.path).map((result) => result.path));
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

  // Responsive pane visibility. Phones open on the E.V command center and move
  // into one full-screen workspace pane at a time; desktop keeps the classic layout.
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
    noteFileCacheRef.current.delete(oldPath);
    noteFileCacheRef.current.set(newPath, saved);
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
    if (activeNoteRef.current?.path === oldPath) activeNoteRef.current = saved;
    setActiveNote((n) => (n?.path === oldPath ? saved : n));
    setActivePath((p) => {
      if (p !== oldPath) return p;
      activePathRef.current = newPath; // keep lockstep so the watch doesn't bounce selection
      return newPath;
    });
  }, []);

  type NoteSaveSnapshot = {
    note: NoteFile;
    content: string;
    baseContent: string;
  };

  const captureActiveNoteSnapshot = useCallback((): NoteSaveSnapshot | null => {
    const note = activeNoteRef.current;
    if (!note) return null;
    const content = commitEditorDraft();
    return {
      note: { ...note },
      content,
      baseContent: baseContentRef.current || note.content,
    };
  }, [commitEditorDraft]);

  const enqueueNoteSave = useCallback((snapshot: NoteSaveSnapshot) => {
    pendingSaveCountRef.current += 1;
    isSavingRef.current = true;
    setIsSaving(true);

    const run = async () => {
      let saved: NoteFile;
      try {
        rememberLocalNoteWrite(
          recentLocalWritesRef.current,
          snapshot.note.path,
          snapshot.content,
        );
        saved = await notes.writeNote({
          path: snapshot.note.path,
          content: snapshot.content,
          expectedHash: snapshot.note.contentHash,
          syncName: false,
        });
      } catch (error) {
        console.error("[Workspace] Save failed", error);
        recordWorkspaceError("save", error);
        const message = error instanceof Error ? error.message : String(error);
        if (!message.includes("changed on disk") && !message.includes("Reload")) {
          toast.error(message);
          return;
        }
        try {
          const fresh = await notes.readNote(snapshot.note.path);
          if (!fresh) throw error;
          const merged = atomicBlockMerge(snapshot.baseContent, snapshot.content, fresh.content);
          saved = await notes.writeNote({
            path: fresh.path,
            content: merged,
            expectedHash: fresh.contentHash,
            syncName: false,
          });
          if (
            activePathRef.current === saved.path
            && draftRef.current === snapshot.content
            && merged !== snapshot.content
          ) {
            setDraftImmediate(merged);
          }
        } catch (retryError) {
          console.error("[Workspace] Save auto-merge failed", retryError);
          recordWorkspaceError("save", retryError);
          toast.error(retryError instanceof Error ? retryError.message : "Failed to save note");
          return;
        }
      }

      noteFileCacheRef.current.set(saved.path, saved);
      setNoteContents((current) => ({ ...current, [saved.path]: saved.content }));
      setNoteList((current) => current.map((note) => (
        note.path === saved.path ? { ...saved, content: "" } : note
      )));
      if (activePathRef.current === saved.path) {
        activeNoteRef.current = saved;
        baseContentRef.current = saved.content;
        setActiveNote(saved);
      }
    };

    const queued = saveQueueRef.current.then(run, run);
    saveQueueRef.current = queued.finally(() => {
      pendingSaveCountRef.current = Math.max(0, pendingSaveCountRef.current - 1);
      const saving = pendingSaveCountRef.current > 0;
      isSavingRef.current = saving;
      setIsSaving(saving);
    });
    return queued;
  }, [notes, recordWorkspaceError, setDraftImmediate]);

  const flushActiveNoteSnapshot = useCallback(() => {
    const snapshot = captureActiveNoteSnapshot();
    if (!snapshot || snapshot.content === snapshot.note.content) return;
    void enqueueNoteSave(snapshot);
  }, [captureActiveNoteSnapshot, enqueueNoteSave]);

  // Silent title→filename sync — runs once on editor blur (NOT on every keystroke).
  // Content is already persisted by autosave; this only renames the file from the
  // H1 when needed. Errors (invalid name / duplicate / lock) are swallowed so the
  // app never crashes — the note simply keeps its current filename.
  const flushTitleSync = useCallback(async () => {
    const note = activeNoteRef.current;
    if (!note || titleSyncingRef.current || isSavingRef.current) return;
    const content = commitEditorDraft();
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
      rememberLocalNoteWrite(recentLocalWritesRef.current, note.path, content);
      const saved = await notes.writeNote({ path: note.path, content, expectedHash: note.contentHash });
      noteFileCacheRef.current.delete(note.path);
      noteFileCacheRef.current.set(saved.path, saved);
      activeNoteRef.current = saved; // ponytail: update ref synchronously immediately
      baseContentRef.current = saved.content;
      setActiveNote(saved);
      setNoteContents((prev) => ({ ...prev, [saved.path]: saved.content }));
      if (saved.path !== note.path) applyRenameInState(note.path, saved);
      else setNoteList((cur) => cur.map((n) => (n.path === saved.path ? { ...saved, content: "" } : n)));
    } catch (error) {
      // Invalid characters, duplicate name, read/write lock, external change, etc.
      console.warn("[Workspace] Title sync skipped", error);
      const errMsg = error instanceof Error ? error.message : String(error);
      if (errMsg.includes("changed on disk") || errMsg.includes("Reload")) {
        try {
          const fresh = await notes.readNote(note.path);
          if (fresh) {
            const base = baseContentRef.current || note.content;
            const merged = atomicBlockMerge(base, draftRef.current, fresh.content);
            activeNoteRef.current = { ...fresh, content: merged };
            baseContentRef.current = fresh.content;
            setActiveNote(activeNoteRef.current);
            setDraftImmediate(merged);
            const retried = await notes.writeNote({ path: fresh.path, content: merged, expectedHash: fresh.contentHash });
            noteFileCacheRef.current.set(retried.path, retried);
            activeNoteRef.current = retried;
            baseContentRef.current = retried.content;
            setActiveNote(retried);
            setNoteContents((prev) => ({ ...prev, [retried.path]: retried.content }));
          }
        } catch (retryErr) {
          console.error("[Workspace] Title sync auto-merge failed", retryErr);
        }
      }
    } finally {
      titleSyncingRef.current = false;
    }
  }, [notes, applyRenameInState, commitEditorDraft, setDraftImmediate]);

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
      activeNoteRef.current = fresh || null;
      if (fresh) {
        noteFileCacheRef.current.set(fresh.path, fresh);
        setActiveNote(fresh);
      }
      toast.success("Restored earlier version");
      closeHistory();
    } catch (error) {
      console.error("[Workspace] Restore version failed", error);
      toast.error("Failed to restore version");
    }
  }, [activePath, notes, closeHistory, setDraftImmediate]);

  const openNotePath = useCallback((notePath: string) => {
    // ponytail: clicking the already-active tab should stay calm and still without triggering View Transition animations!
    if (notePath === activePathRef.current) return;
    flushActiveNoteSnapshot();
    const apply = () => {
      const cached = noteFileCacheRef.current.get(notePath);
      if (cached) {
        activeNoteRef.current = cached;
        setActiveNote(cached);
        setDraftImmediate(cached.content);
      }
      activePathRef.current = notePath;
      setOpenTabs((current) => (current.includes(notePath) ? current : [...current, notePath]));
      setActivePath(notePath);
      if (isMobile) setMobileView("editor");
    };
    // View Transitions API: Chromium 111+, Safari 18+, Electron 28+. Falls back
    // to immediate state update on browsers that don't support it.
    type DocVT = Document & { startViewTransition?: (cb: () => void) => unknown };
    const docVT = document as DocVT;
    if (shouldAnimateNoteSwitch(
      isMobile,
      typeof docVT.startViewTransition === "function",
      window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    )) {
      docVT.startViewTransition(apply);
    } else {
      apply();
    }
  }, [flushActiveNoteSnapshot, isMobile, setDraftImmediate, setMobileView]);

  // JARVIS's open_note tool opens a note by dispatching this event (it lives outside this page's
  // React tree, so a window event is the seam). openNotePath handles the tab + active-note switch.
  useEffect(() => {
    const onOpenNote = (e: Event) => {
      const path = (e as CustomEvent<{ path?: string }>).detail?.path;
      if (path) openNotePath(path);
    };
    window.addEventListener("beebot:open-note", onOpenNote);
    return () => window.removeEventListener("beebot:open-note", onOpenNote);
  }, [openNotePath]);

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
  }, [collapseAllFolders, setDraftImmediate]);

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
      const nextPath = nextTabs[nextTabs.length - 1] || noteList.find((note) => note.path !== notePath)?.path || null;
      if (nextPath) openNotePath(nextPath);
      else {
        flushActiveNoteSnapshot();
        activePathRef.current = null;
        setActivePath(null);
      }
    }
    if (splitPath === notePath) {
      setSplitLayout(null);
      setSplitPath(null);
      setSplitNote(null);
    }
  }, [activePath, flushActiveNoteSnapshot, noteList, openNotePath, openTabs, splitPath]);

  const closeOtherTabs = useCallback((notePath: string) => {
    setOpenTabs([notePath]);
    if (activePathRef.current !== notePath) openNotePath(notePath);
    if (splitPath && splitPath !== notePath) {
      setSplitLayout(null);
      setSplitPath(null);
      setSplitNote(null);
    }
  }, [openNotePath, splitPath]);

  const closeAllTabs = useCallback(() => {
    flushActiveNoteSnapshot();
    setOpenTabs([]);
    activePathRef.current = null;
    setActivePath(null);
    setSplitLayout(null);
    setSplitPath(null);
    setSplitNote(null);
  }, [flushActiveNoteSnapshot]);

  const splitTab = useCallback((notePath: string, layout: Exclude<SplitLayout, null>) => {
    setSplitLayout(layout);
    setSplitPath(notePath);
  }, []);

  useEffect(() => {
    refreshVaults();
    refreshSkills();
    refreshNotes(localStorage.getItem(LAST_NOTE_KEY) || undefined, true); // restore last-open file (if it still exists)
    const subscription = notes.watchNotes((paths) => {
      void (async () => {
        if (await isMatchingLocalWriteEcho(
          paths,
          recentLocalWritesRef.current,
          (path) => notes.readNote(path),
        )) {
          return;
        }
        await search.rebuildNoteIndex(paths).catch((error) => {
          console.error("[Workspace] Failed to refresh search index", error);
          recordWorkspaceError("search", error);
        });
        // External or structural change: refresh ONLY the tree/list — never the
        // active selection. Local autosave echoes are filtered above because the
        // save path already patched all affected React state.
        await refreshNotesList();

        // Live-sync the OPEN note's CONTENT when its file changed on disk (e.g.
        // edited in Obsidian). Refs keep this once-mounted subscription current.
        const note = activeNoteRef.current;
        if (!note || isSavingRef.current || titleSyncingRef.current) return;
        const fresh = await notes.readNote(note.path).catch(() => null);
        if (!fresh || fresh.contentHash === note.contentHash || fresh.content === note.content) return;     // nothing changed on disk
        if (activeNoteRef.current?.path !== note.path) return;    // user switched notes mid-read
        const base = baseContentRef.current || note.content;
        const merged = atomicBlockMerge(base, draftRef.current, fresh.content);
        const mergedNote = { ...fresh, content: merged };
        noteFileCacheRef.current.set(fresh.path, fresh);
        activeNoteRef.current = mergedNote; // ponytail: keep ref current
        setActiveNote(mergedNote);
        setDraftImmediate(merged);
        baseContentRef.current = fresh.content;
        setNoteContents((prev) => ({ ...prev, [fresh.path]: merged }));
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

    const cached = noteFileCacheRef.current.get(activePath) ?? null;
    const stagedContent = cached?.content ?? null;
    if (cached && activeNoteRef.current?.path !== activePath) {
      activeNoteRef.current = cached;
      setActiveNote(cached);
      setDraftImmediate(cached.content);
    }

    let cancelled = false;
    notes.readNote(activePath)
      .then((note) => {
        if (cancelled) return;
        if (note) noteFileCacheRef.current.set(note.path, note);
        const editedSinceStaging = stagedContent !== null
          && activePathRef.current === activePath
          && draftRef.current !== stagedContent;
        activeNoteRef.current = note || null;
        setActiveNote(note);
        if (!editedSinceStaging) {
          setDraftImmediate(note?.content || "");
        } else if (note) {
          baseContentRef.current = note.content;
        }
        if (note) setNoteContents((prev) => (prev[note.path] === note.content ? prev : { ...prev, [note.path]: note.content }));
      })
      .catch((error) => {
        console.error("[Workspace] Failed to read note", error);
        toast.error("Failed to open note");
      });

    return () => {
      cancelled = true;
    };
  }, [activePath, notes, setDraftImmediate]);

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
    if (titleSyncingRef.current) return;
    const snapshot = captureActiveNoteSnapshot();
    if (!snapshot || snapshot.content === snapshot.note.content) return;
    await enqueueNoteSave(snapshot);
  }, [captureActiveNoteSnapshot, enqueueNoteSave]);

  useEffect(() => {
    if (!activeNote || draft === activeNote.content) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => { void saveActiveNote(); }, 180); // ponytail: 180ms debounce save as requested to minimize unflushed buffer window

    return () => {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
      }
    };
  }, [activeNote, draft, saveActiveNote]);

  // Pillar 3: Zero-Data-Loss "Durability Guarantee" (Flush-on-Unload)
  // Synchronously saves unflushed editor buffers on beforeunload, visibilitychange, and pagehide.
  // Replaces async saveActiveNote (which browsers cancel during unload) with synchronous localStorage journal.
  useEffect(() => {
    const emergencyFlush = () => {
      const note = activeNoteRef.current;
      const currentDraft = editorInstanceRef.current?.getMarkdown() ?? draftRef.current;
      if (!note || !currentDraft) return;
      if (currentDraft === note.content) return; // already in sync

      console.warn("[Pillar 3] Synchronous emergency flush triggered for:", note.path);
      notes.emergencySaveSync?.(note.path, currentDraft, note.contentHash);
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        emergencyFlush();
      }
    };

    window.addEventListener("beforeunload", emergencyFlush);
    window.addEventListener("pagehide", emergencyFlush);
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      window.removeEventListener("beforeunload", emergencyFlush);
      window.removeEventListener("pagehide", emergencyFlush);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [notes]);


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
          recordWorkspaceError("search", error);
          if (!cancelled) setSearchResults([]);
        });
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query, search, recordWorkspaceError]);

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

  // The macOS menu owns these accelerators in the desktop build, so route the
  // same actions through one native command listener when the menu is used.
  useEffect(() => window.beebotDesktop?.onDesktopCommand?.((command) => {
    if (command === "new-note") void handleCreateNote(activeNote ? folderFromPath(activeNote.path) : "");
    else if (command === "save-note") void saveActiveNote();
    else if (command === "command-palette") setCommandOpen(true);
    else if (command === "search-notes") openSearchModal();
  }), [activeNote, handleCreateNote, openSearchModal, saveActiveNote]);

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
      noteOrder.rename(entry.path, moved.path); // carry order weight across move/rename
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

  // E.V note actions use the same repository and state transitions as direct UI actions.
  // This is intentionally registered next to the CRUD callbacks so a voice write cannot
  // persist successfully while leaving tabs/editor state stale.
  useEffect(() => registerWorkspaceActionPort({
    async createNote(input) {
      const saved = await notes.writeNote({ path: input.path, content: input.content || "", syncName: false });
      noteFileCacheRef.current.set(saved.path, saved);
      openNotePath(saved.path);
      await refreshNotes(saved.path, false);
      return {
        path: saved.path,
        title: saved.title || titleFromPath(saved.path),
        contentHash: saved.contentHash || stableContentHash(saved.content),
        active: activePathRef.current === saved.path,
      };
    },
    async openNote(input) {
      const note = await notes.readNote(input.path);
      if (!note) throw new Error(`FILE_NOT_FOUND: note not found: ${input.path}`);
      noteFileCacheRef.current.set(note.path, note);
      openNotePath(note.path);
      return {
        path: note.path,
        title: note.title || titleFromPath(note.path),
        contentHash: note.contentHash || stableContentHash(note.content),
        active: activePathRef.current === note.path,
      };
    },
    async updateNote(input) {
      const existing = await notes.readNote(input.path);
      if (!existing) throw new Error(`FILE_NOT_FOUND: note not found: ${input.path}`);
      const isActive = activePathRef.current === input.path;
      const currentContent = isActive
        ? (editorInstanceRef.current?.getMarkdown() ?? draftRef.current)
        : existing.content;
      if (input.expectedContentHash && stableContentHash(currentContent) !== input.expectedContentHash) {
        throw new Error(`CONTENT_CHANGED: note changed before update: ${input.path}`);
      }
      const saved = await notes.writeNote({
        path: input.path,
        content: input.content ?? currentContent,
        expectedHash: existing.contentHash,
        syncName: false,
      });
      noteFileCacheRef.current.set(saved.path, saved);
      setNoteList((current) => current.map((note) => note.path === saved.path ? { ...saved, content: "" } : note));
      if (isActive) {
        activeNoteRef.current = saved;
        baseContentRef.current = saved.content;
        setActiveNote(saved);
        setDraftImmediate(saved.content);
      }
      return {
        path: saved.path,
        title: saved.title || titleFromPath(saved.path),
        contentHash: saved.contentHash || stableContentHash(saved.content),
        active: isActive,
      };
    },
    async deleteNote(input) {
      const existing = await notes.readNote(input.path);
      if (!existing) throw new Error(`FILE_NOT_FOUND: note not found: ${input.path}`);
      const isActive = activePathRef.current === input.path;
      const currentContent = isActive
        ? (editorInstanceRef.current?.getMarkdown() ?? draftRef.current)
        : existing.content;
      if (input.expectedContentHash && stableContentHash(currentContent) !== input.expectedContentHash) {
        throw new Error(`CONTENT_CHANGED: note changed before delete: ${input.path}`);
      }
      await notes.deleteNote(input.path);
      noteFileCacheRef.current.delete(input.path);
      setOpenTabs((current) => current.filter((path) => path !== input.path));
      if (splitPath === input.path) {
        setSplitLayout(null);
        setSplitPath(null);
        setSplitNote(null);
      }
      if (isActive) {
        activePathRef.current = null;
        activeNoteRef.current = null;
        setActivePath(null);
        setActiveNote(null);
        setDraftImmediate("");
        await refreshNotes(null, false);
      } else {
        await refreshNotes(undefined, false);
      }
      return {
        path: input.path,
        title: existing.title || titleFromPath(existing.path),
        contentHash: existing.contentHash || stableContentHash(existing.content),
        active: false,
      };
    },
    async renameNote(input) {
      if (!input.newPath) throw new Error("INVALID_INPUT: new note path is required");
      const existing = await notes.readNote(input.path);
      if (!existing) throw new Error(`FILE_NOT_FOUND: note not found: ${input.path}`);
      const wasActive = activePathRef.current === input.path;
      await notes.renamePath({ oldPath: input.path, newPath: input.newPath });
      const saved = await notes.readNote(input.newPath);
      if (!saved) throw new Error(`ACTION_VERIFICATION_FAILED: renamed note missing: ${input.newPath}`);
      if (wasActive) activePathRef.current = saved.path;
      applyRenameInState(input.path, saved);
      return {
        path: saved.path,
        title: saved.title || titleFromPath(saved.path),
        contentHash: saved.contentHash || stableContentHash(saved.content),
        active: wasActive,
      };
    },
  }), [applyRenameInState, notes, openNotePath, refreshNotes, setDraftImmediate, splitPath]);

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

  // Drag-and-drop reorder: drop an entry above/below another in the SAME folder →
  // rewrite that folder's persisted order weights.
  const reorderEntry = useCallback((source: VaultEntry, targetPath: string, before: boolean) => {
    if (source.path === targetPath) return;
    const parent = parentFromPath(source.path);
    if (parentFromPath(targetPath) !== parent) return; // different folder → handled by move
    const order = entryList.filter((e) => e.kind === source.kind && parentFromPath(e.path) === parent).map((e) => e.path);
    const without = order.filter((p) => p !== source.path);
    const at = without.indexOf(targetPath);
    if (at < 0) {
      if (source.kind === "folder") without.push(source.path);
      else without.unshift(source.path);
    } else {
      without.splice(before ? at : at + 1, 0, source.path);
    }
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

  // Backfill note contents once when the graph view opens.
  useEffect(() => {
    if (!graphOpen || backlinkBackfilledRef.current || !noteList.length) return;
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
  }, [graphOpen, noteList, notes, noteContents]);

  // useDeferredValue keeps typing at 60fps: draft updates immediately for the editor,
  // but the expensive backlinks/wikilink-resolution work defers to idle time.
  const deferredDraft = useDeferredValue(draft);
  const deferredNoteContents = useDeferredValue(noteContents);

  // Notes with available content (used by wikilink resolution + backlinks).
  const liveNotes = useMemo(
    () => noteList.map((note) => ({ ...note, content: note.path === activePath ? deferredDraft : deferredNoteContents[note.path] || "" })),
    [noteList, deferredNoteContents, activePath, deferredDraft],
  );

  const dataviewNotes = useMemo(
    () =>
      liveNotes.map((note) => ({
        path: note.path,
        title: note.title || titleFromPath(note.path),
        content: note.path === activeNote?.path ? deferredDraft : note.content,
      })),
    [liveNotes, activeNote?.path, deferredDraft]
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
      if (full) {
        noteFileCacheRef.current.set(full.path, full);
        setNoteContents((prev) => prev[full.path] === full.content ? prev : { ...prev, [full.path]: full.content });
      }
    }).catch(() => { });
    return null;
  }, [liveNotes, deferredNoteContents, notes]);


  // Warm the note cache on hover so clicking opens instantly (was inline on the tree row
  // before <NoteTree> was extracted — moved here verbatim so the component stays presentational).
  const prefetchNote = useCallback((notePath: string) => {
    notes.readNote(notePath).then((full) => {
      if (full) {
        noteFileCacheRef.current.set(full.path, full);
        setNoteContents((prev) => prev[notePath] === full.content ? prev : { ...prev, [notePath]: full.content });
      }
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

  // ponytail: moved to module scope (IS_DESKTOP_SHELL, FILE_MANAGER, etc.) to
  // prevent bundler TDZ crash — see module-scope comment above SETTINGS_STORAGE_KEY.
  const isDesktopShell = IS_DESKTOP_SHELL;
  const draggableRegion = DRAGGABLE_REGION;
  const interactiveRegion = INTERACTIVE_REGION;
  const chromeButtonClass = CHROME_BUTTON_CLASS;
  const chromeButtonActiveClass = CHROME_BUTTON_ACTIVE_CLASS;
  const ribbonButtonClass = RIBBON_BUTTON_CLASS;
  const toolbarButtonClass = TOOLBAR_BUTTON_CLASS;

  const renderNoteHeader = useCallback(() => null, []);

  // CRITICAL: MUST be called BEFORE any early return to obey React Rules of Hooks.
  const prevShellValueRef = useRef<Record<string, unknown> | null>(null);
  const nextWorkspaceValue = {
    location, searchParams, setSearchParams, userId, ready, notes, search, vault, skills, settings,
    activeVault, setActiveVault, recentVaults, setRecentVaults, skillList, setSkillList,
    skillSummary, setSkillSummary, noteList, setNoteList, entryList, setEntryList,
    activePath, setActivePath, activeNote, setActiveNote, openTabs, setOpenTabs,
    splitLayout, setSplitLayout, splitPath, setSplitPath, splitNote, setSplitNote,
    draft, setDraft, query, setQuery, newVaultName, setNewVaultName, searchResults, setSearchResults,
    editorMode, setEditorMode, railOpen, setRailOpen, railTab, setRailTab, agentOpen, setAgentOpen, openContentSignals,
    sidebarOpen, setSidebarOpen, createVaultOpen, setCreateVaultOpen,
    skillsOpen, setSkillsOpen, settingsOpen, setSettingsOpen, settingsPane, setSettingsPane,
    settingsSearch, setSettingsSearch, commandOpen, setCommandOpen, searchModalOpen, setSearchModalOpen,
    graphOpen, setGraphOpen, historyOpen, setHistoryOpen, healthOpen, setHealthOpen, activeRoom, openRoom, closeRoom,
    cfoOpen, consultantOpen, versions, setVersions, versionsLoading, setVersionsLoading,
    sidebarWidth, setSidebarWidth, agentWidth, setAgentWidth, resizing, setResizing,
    beginResize, fontTarget, setFontTarget, fontInput, setFontInput, fontSearch, setFontSearch,
    fontsLoading, setFontsLoading, systemFonts, setSystemFonts, fontPermission, setFontPermission,
    appearanceSettings, updateAppearanceSettings, resetAppearanceSettings,
    isThemeEditorOpen, setIsThemeEditorOpen, editingThemeId, setEditingThemeId,
    isMobile, mobileView, setMobileView, reduceFx, setReduceFx, jarvisOn, setJarvisOn,
    jarvisWake, setJarvisWake,
    jarvisBrainModel, setJarvisBrainModel, jarvisKeyDraft, setJarvisKeyDraft,
    jarvisKeyReveal, setJarvisKeyReveal, jarvisKeyEditing, setJarvisKeyEditing, hasJarvisKey, setHasJarvisKey,
    promptDialog, setPromptDialog, promptValue, setPromptValue, resolvePrompt,
    confirmDialog, setConfirmDialog, resolveConfirm,
    bookmarks, setBookmarks, isVaultBusy, setIsVaultBusy, isSkillBusy, setIsSkillBusy,
    openSearchModal, closeSearchModal, openGraphView, closeGraphView, openHistory, closeHistory, openHealth, closeHealth,
    closeCfo, closeConsultant, openConsultant, openCfo, openNotePath, closeTab, closeOtherTabs, closeAllTabs,
    splitTab, handleCopyEntryPath, handleRevealEntry, handleRenameEntry,
    handleCreateNote, handleCreateFolder, handleOpenVault, handleCreateVault,
    handleRevealVault, handleSwitchVault, handleForgetVault, handleToggleSkill, handleRestoreVersion,
    handleToggleBookmark, moveEntryViaDnd, reorderEntry, toggleFolder, expandAllFolders, collapseAllFolders,
    prefetchNote, promptLinkAndApply, flushTitleSync, handleWikilinkActivate, isResolvedWikilink, getEmbedContent,
    applyMarkdownCommand, onEditorType, commitEditorDraft, handleEditorKeyDown, renderNoteHeader, runCommand,
    liveNotes, dataviewNotes, noteContents, visibleEntries, bookmarkEntries, rowVirtualizer, treeScrollRef,
    isLoading, expandedFolders, highlightedTreePath, sidebarActions, ribbonActions, tabActions,
    folderFromPath, titleFromPath,
    interfaceFontStack, textFontStack, monospaceFontStack, fontStack, firstAvailableFont,
    moveFontInTarget, removeFontFromTarget, loadSystemFonts, addFontToTarget, fontSuggestions, applyFontToTarget,
    isDesktopShell, draggableRegion, interactiveRegion, chromeButtonClass, chromeButtonActiveClass,
    ribbonButtonClass, toolbarButtonClass, FILE_MANAGER, DENSE_ICON, formatVersionTime, resolveWikilinkTarget,
    SETTINGS_GROUPS, SETTINGS_META, settingsItems, reduceEffects, jarvisEnabled, jarvisWakeWord,
    jarvisModels, geminiKey, themeStore, showSidebar, showMainContent, showMainEditor, showAgentPane, editorInstanceRef,
    groupedSkills, handleDeleteNote, handleDeleteEntry, toggleRibbonItem, saveActiveNote,
    openTabNotes, isDirty, isSaving, fsaSupported, initialMessage, needsReopenFolder, handleReopenFolder, revealFolderInTree,
    workspaceErrors, recordWorkspaceError,
  };

  const modalVisible = settingsOpen || createVaultOpen || skillsOpen || commandOpen || searchModalOpen
    || graphOpen || historyOpen || healthOpen || cfoOpen || consultantOpen || isThemeEditorOpen
    || Boolean(promptDialog) || Boolean(confirmDialog);
  const editorVolatileKeys = modalVisible ? new Set<string>() : new Set([
    "draft", "setDraft", "liveNotes", "dataviewNotes", "isResolvedWikilink",
    "handleWikilinkActivate", "getEmbedContent",
    "isDirty", "isSaving", "onEditorType", "renderNoteHeader", "setAgentOpen",
  ]);
  const shellValue = reuseContextValue(prevShellValueRef.current, nextWorkspaceValue, editorVolatileKeys);
  prevShellValueRef.current = shellValue;
  const prevEditorValueRef = useRef<Record<string, unknown> | null>(null);
  const nextEditorValue = {
    showMainContent, isMobile, draggableRegion, openTabNotes, activePath, isDirty, tabActions,
    handleCreateNote, activeNote, folderFromPath, handleCreateFolder, handleOpenVault, setCommandOpen,
    showSidebar, FILE_MANAGER, interactiveRegion, sidebarOpen, editorMode, skillsOpen, settingsOpen,
    agentOpen, setSidebarOpen, setEditorMode, setSkillsOpen, setSettingsOpen, setAgentOpen, openContentSignals,
    appearanceSettings, chromeButtonClass, chromeButtonActiveClass, mobileView, handleEditorKeyDown,
    setMobileView,
    textFontStack, renderNoteHeader, draft, onEditorType, commitEditorDraft, editorInstanceRef,
    promptLinkAndApply, flushTitleSync, dataviewNotes, handleWikilinkActivate, isResolvedWikilink,
    getEmbedContent, applyMarkdownCommand, railOpen, beginResize, resizing, agentWidth, railTab,
    setRailTab, location, userId, initialMessage,
  };
  const editorValue = reuseContextValue(prevEditorValueRef.current, nextEditorValue, new Set());
  prevEditorValueRef.current = editorValue;

  if (!ready || !userId) {
    return (
      <div className="h-full w-full bg-background flex items-center justify-center text-muted-foreground">
        <div className="h-9 w-9 rounded-full border-2 border-border/40 border-t-primary animate-spin" />
      </div>
    );
  }

  return (
    <WorkspaceShellContext.Provider value={shellValue}>
      <WorkspaceEditorContext.Provider value={editorValue}>
        <WorkspaceLayout />
      </WorkspaceEditorContext.Provider>
      {modalVisible && (
        <MicroErrorBoundary name="Workspace Modals">
          <Suspense fallback={null}>
            <WorkspaceModals />
          </Suspense>
        </MicroErrorBoundary>
      )}
    </WorkspaceShellContext.Provider>
  );
}
