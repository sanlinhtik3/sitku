import { useState, useCallback, useMemo } from "react";
import { useHashRoute } from "@/hooks/useHashRoute";

// ═══ Hash Constants ═══
const HASH = {
  TASKS: "#settings/scheduled-tasks",
  
  CONSULTANT: "#consultant",
  PROFILE: "#profile",
  // Connectors root
  CONNECTORS_BUILTIN: "#connectors/built-in",
  CONNECTORS_CUSTOM: "#connectors/custom-api",
  // Built-in sub-routes
  CONNECTORS_TELEGRAM: "#connectors/built-in/telegram",
  CONNECTORS_SOUL: "#connectors/built-in/soul",
  CONNECTORS_FACEBOOK: "#connectors/built-in/facebook",
  CONNECTORS_N8N: "#connectors/built-in/n8n",
  CONNECTORS_NOTION: "#connectors/built-in/notion",
  // Custom API sub-routes
  CONNECTORS_GEMINI: "#connectors/custom-api/gemini",
  CONNECTORS_ANTHROPIC: "#connectors/custom-api/anthropic",
  CONNECTORS_OPENROUTER: "#connectors/custom-api/openrouter",
  CONNECTORS_GROK: "#connectors/custom-api/grok",
  CONNECTORS_TAVILY: "#connectors/custom-api/tavily",
} as const;

// Map custom-api sub-route suffixes to AIContentApiKeyDialog tab names
const API_TAB_MAP: Record<string, string> = {
  gemini: "gemini",
  anthropic: "claude",
  openrouter: "openrouter",
  grok: "xai",
};

export function useAgentDialogState() {
  const { hash, setHash, clearHash } = useHashRoute();

  const [sidebarOpen, setSidebarOpen] = useState(() => window.innerWidth >= 1024);
  const [telemetryOpen, setTelemetryOpen] = useState(false);
  const [sourcesMessageId, setSourcesMessageId] = useState<string | null>(null);
  const [apiSource, setApiSource] = useState<'personal' | 'system'>(() => {
    if (typeof window === "undefined") return "personal";
    const saved = localStorage.getItem("beebot-api-source");
    return saved === "system" ? "system" : "personal";
  });

  // ═══ Hash-derived dialog states ═══
  const tasksOpen = hash === HASH.TASKS;

  // #consultant is now the full-screen workspace page (KnowledgeWorkspacePage owns it).
  // The agent rail only handles sub-routes like #consultant/posts as a fallback.
  const consultantOpen = hash.startsWith("#consultant/");
  const consultantTab = useMemo(() => {
    if (!hash.startsWith("#consultant/")) return "dashboard";
    const sub = hash.replace("#consultant/", "");
    const valid = ["dashboard", "posts", "finance", "chat"];
    return valid.includes(sub) ? sub : "dashboard";
  }, [hash]);
  
  // Profile: open for #profile or any #profile/* sub-route
  const profileOpen = hash === "#profile" || hash.startsWith("#profile/");
  const profileTab = useMemo(() => {
    if (!hash.startsWith("#profile/")) return "profile";
    const sub = hash.replace("#profile/", "");
    const validTabs = ["profile", "billing", "usage", "security", "notifications", "learning", "memory", "skills", "ai-models"];
    return validTabs.includes(sub) ? sub : "profile";
  }, [hash]);

  // Connectors dialog: open when hash starts with #connectors/ but NOT a specific sub-dialog
  const connectorsDialogOpen = hash === HASH.CONNECTORS_BUILTIN || hash === HASH.CONNECTORS_CUSTOM;
  const connectorsTab = hash === HASH.CONNECTORS_CUSTOM ? "custom-api" : "apps";

  // Sub-dialogs derived from specific hash routes
  const telegramDialogOpen = hash === HASH.CONNECTORS_TELEGRAM;
  const soulEditorOpen = hash === HASH.CONNECTORS_SOUL;
  const facebookDialogOpen = hash === HASH.CONNECTORS_FACEBOOK;
  const n8nDialogOpen = hash === HASH.CONNECTORS_N8N;
  const notionDialogOpen = hash === HASH.CONNECTORS_NOTION;
  const tavilyKeyOpen = hash === HASH.CONNECTORS_TAVILY;

  // API key dialog: open for any custom-api sub-route (gemini/anthropic/openrouter/grok)
  const apiKeyDialogOpen = hash === HASH.CONNECTORS_GEMINI
    || hash === HASH.CONNECTORS_ANTHROPIC
    || hash === HASH.CONNECTORS_OPENROUTER
    || hash === HASH.CONNECTORS_GROK;

  // Derive which tab to show in API key dialog
  const apiKeyInitialTab = useMemo(() => {
    const suffix = hash.replace("#connectors/custom-api/", "");
    return API_TAB_MAP[suffix] || "gemini";
  }, [hash]);

  // ═══ Setters ═══
  const setTasksOpen = useCallback((open: boolean) => {
    open ? setHash(HASH.TASKS) : clearHash();
  }, [setHash, clearHash]);




  const setConsultantOpen = useCallback((open: boolean) => {
    open ? setHash(HASH.CONSULTANT) : clearHash();
  }, [setHash, clearHash]);

  const setConsultantTab = useCallback((tab: string) => {
    setHash(tab === "dashboard" ? HASH.CONSULTANT : `#consultant/${tab}`);
  }, [setHash]);

  const setProfileOpen = useCallback((open: boolean) => {
    open ? setHash(HASH.PROFILE) : clearHash();
  }, [setHash, clearHash]);

  const setProfileTab = useCallback((tab: string) => {
    if (tab === "profile") {
      setHash(HASH.PROFILE);
    } else {
      setHash(`#profile/${tab}`);
    }
  }, [setHash]);

  const setConnectorsDialogOpen = useCallback((open: boolean, tab?: "apps" | "custom-api") => {
    if (open) {
      setHash(tab === "custom-api" ? HASH.CONNECTORS_CUSTOM : HASH.CONNECTORS_BUILTIN);
    } else {
      clearHash();
    }
  }, [setHash, clearHash]);

  const setConnectorsTab = useCallback((tab: "apps" | "custom-api") => {
    setHash(tab === "custom-api" ? HASH.CONNECTORS_CUSTOM : HASH.CONNECTORS_BUILTIN);
  }, [setHash]);

  const setTelegramDialogOpen = useCallback((open: boolean) => {
    open ? setHash(HASH.CONNECTORS_TELEGRAM) : clearHash();
  }, [setHash, clearHash]);

  const setSoulEditorOpen = useCallback((open: boolean) => {
    open ? setHash(HASH.CONNECTORS_SOUL) : clearHash();
  }, [setHash, clearHash]);

  const setFacebookDialogOpen = useCallback((open: boolean) => {
    open ? setHash(HASH.CONNECTORS_FACEBOOK) : clearHash();
  }, [setHash, clearHash]);

  const setN8nDialogOpen = useCallback((open: boolean) => {
    open ? setHash(HASH.CONNECTORS_N8N) : clearHash();
  }, [setHash, clearHash]);

  const setNotionDialogOpen = useCallback((open: boolean) => {
    open ? setHash(HASH.CONNECTORS_NOTION) : clearHash();
  }, [setHash, clearHash]);

  const setTavilyKeyOpen = useCallback((open: boolean) => {
    open ? setHash(HASH.CONNECTORS_TAVILY) : clearHash();
  }, [setHash, clearHash]);

  // API key dialog: accepts tab name to set the right hash
  const setApiKeyDialogOpen = useCallback((open: boolean) => {
    if (!open) { clearHash(); return; }
    // Default to gemini if just opening generically
    setHash(HASH.CONNECTORS_GEMINI);
  }, [setHash, clearHash]);

  const setApiKeyInitialTab = useCallback((tab: string) => {
    // Map tab names to hash routes
    const tabToHash: Record<string, string> = {
      gemini: HASH.CONNECTORS_GEMINI,
      claude: HASH.CONNECTORS_ANTHROPIC,
      openrouter: HASH.CONNECTORS_OPENROUTER,
      xai: HASH.CONNECTORS_GROK,
    };
    const targetHash = tabToHash[tab];
    if (targetHash) setHash(targetHash);
  }, [setHash]);

  // ═══ Non-hash state ═══
  const handleApiSourceChange = useCallback((source: 'personal' | 'system') => {
    setApiSource(source);
    localStorage.setItem("beebot-api-source", source);
  }, []);

  const toggleSidebar = useCallback(() => setSidebarOpen(prev => !prev), []);

  const handleCloseSources = useCallback(() => {
    setSourcesMessageId(null);
  }, []);

  return {
    sidebarOpen, setSidebarOpen, toggleSidebar,

    telegramDialogOpen, setTelegramDialogOpen,
    tavilyKeyOpen, setTavilyKeyOpen,
    tasksOpen, setTasksOpen,
    
    consultantOpen, setConsultantOpen, consultantTab, setConsultantTab,
    soulEditorOpen, setSoulEditorOpen,
    facebookDialogOpen, setFacebookDialogOpen,
    n8nDialogOpen, setN8nDialogOpen,
    notionDialogOpen, setNotionDialogOpen,
    apiKeyDialogOpen, setApiKeyDialogOpen,
    apiKeyInitialTab, setApiKeyInitialTab,
    telemetryOpen, setTelemetryOpen,
    sourcesMessageId, setSourcesMessageId,
    apiSource, handleApiSourceChange,
    handleCloseSources,
    profileOpen, setProfileOpen,
    profileTab, setProfileTab,
    // New connectors-specific
    connectorsDialogOpen, setConnectorsDialogOpen,
    connectorsTab, setConnectorsTab,
  };
}
