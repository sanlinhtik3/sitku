import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Database, Search, Trash2, Eye, Brain, BookOpen, Users, Zap, RefreshCw, Plus, TrendingUp, Activity, Settings, AlertTriangle, CheckCircle2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { DataTable } from "@/components/ui/data-table";
import { ColumnDef } from "@tanstack/react-table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { ContentViewDialog } from "./ContentViewDialog";
import { AddTrainingContentDialog } from "./AddTrainingContentDialog";
import { NeuroBrainSettingsDialog } from "./NeuroBrainSettingsDialog";
import { SyncProgressDialog } from "./SyncProgressDialog";
import { SyncSingleItemDialog } from "./SyncSingleItemDialog";
import { format } from "date-fns";
import { motion } from "motion/react";

interface KnowledgeItem {
  id: string;
  title: string;
  content: string;
  category: string | null;
  language: string | null;
  source_type: string | null;
  quality_score: number | null;
  created_at: string;
  profiles?: { full_name: string } | null;
  // Auto-sync status fields
  embedding_status: 'pending' | 'processing' | 'synced' | 'failed' | null;
  embedding_synced_at: string | null;
  embedding_error: string | null;
}

interface MemoryStats {
  context_type: string;
  count: number;
}

interface EpisodicStats {
  total: number;
  avgImportance: number;
  recentCount: number;
  hasEmbeddings: boolean;
}

// Clean title display - remove slug patterns
const cleanTitle = (title: string | null): string => {
  if (!title) return "Untitled";
  return title
    .replace(/^_+|_+$/g, "")
    .replace(/__+/g, " - ")
    .replace(/_/g, " ")
    .trim() || "Untitled";
};

export const NeuroDigitalBrain = () => {
  const [activeTab, setActiveTab] = useState("knowledge");
  const [knowledge, setKnowledge] = useState<KnowledgeItem[]>([]);
  const [memoryStats, setMemoryStats] = useState<MemoryStats[]>([]);
  const [episodicStats, setEpisodicStats] = useState<EpisodicStats>({
    total: 0,
    avgImportance: 0,
    recentCount: 0,
    hasEmbeddings: false,
  });
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [tablePageIndex, setTablePageIndex] = useState(0);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [viewContent, setViewContent] = useState<any>(null);
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [syncProgressOpen, setSyncProgressOpen] = useState(false);
  const [singleSyncDialogOpen, setSingleSyncDialogOpen] = useState(false);
  const [singleSyncItem, setSingleSyncItem] = useState<{ id: string; title: string } | null>(null);
  const [hasApiKey, setHasApiKey] = useState(false);
  const [autoSyncEnabled, setAutoSyncEnabled] = useState(true);

  // Stats for header cards
  const [headerStats, setHeaderStats] = useState({
    knowledgeCount: 0,
    memoriesCount: 0,
    episodicCount: 0,
    avgQuality: 0,
    syncedCount: 0,
    pendingCount: 0,
  });

  // Check auto-sync status
  const checkAutoSyncStatus = useCallback(async () => {
    try {
      const { data } = await supabase
        .from('ai_model_settings')
        .select('auto_sync_enabled')
        .single();
      setAutoSyncEnabled(data?.auto_sync_enabled !== false);
    } catch (error) {
      console.error("Failed to check auto-sync status:", error);
      setAutoSyncEnabled(true);
    }
  }, []);

  // Check API key status
  const checkApiKeyStatus = useCallback(async () => {
    try {
      const { data } = await supabase.rpc("check_system_api_key_exists");
      setHasApiKey(!!data);
    } catch (error) {
      console.error("Failed to check API key status:", error);
      setHasApiKey(false);
    }
  }, []);

  useEffect(() => {
    loadAllData();
    checkApiKeyStatus();
    checkAutoSyncStatus();

    // Real-time subscription for knowledge changes AND embedding status updates
    const channel = supabase
      .channel("neuro-brain-changes")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "ai_generated_content", filter: "is_global=eq.true" },
        (payload) => {
          // For UPDATE events, update the specific item in state immediately
          if (payload.eventType === "UPDATE" && payload.new) {
            setKnowledge(prev => prev.map(item =>
              item.id === payload.new.id
                ? { 
                    ...item, 
                    embedding_status: payload.new.embedding_status as KnowledgeItem['embedding_status'],
                    embedding_synced_at: payload.new.embedding_synced_at,
                    embedding_error: payload.new.embedding_error
                  }
                : item
            ));
            // Update stats
            updateSyncStats();
          } else {
            // For INSERT/DELETE, reload full list
            loadKnowledge();
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [checkApiKeyStatus, checkAutoSyncStatus]);

  const loadAllData = async () => {
    setLoading(true);
    await Promise.all([loadKnowledge(), loadMemoryStats(), loadEpisodicStats()]);
    setLoading(false);
  };

  const loadKnowledge = async () => {
    try {
      const { data, error } = await supabase
        .from("ai_generated_content")
        .select(`
          id, title, content, category, language, source_type, quality_score, created_at,
          embedding_status, embedding_synced_at, embedding_error,
          profiles:user_id (full_name)
        `)
        .eq("is_global", true)
        .order("created_at", { ascending: false });

      if (error) throw error;
      setKnowledge((data as KnowledgeItem[]) || []);

      // Calculate header stats
      const avgQuality = data?.length
        ? data.reduce((sum, item) => sum + (item.quality_score || 0), 0) / data.length
        : 0;
      
      // Calculate sync stats
      const syncedCount = data?.filter(item => item.embedding_status === 'synced').length || 0;
      const pendingCount = data?.filter(item => 
        item.embedding_status === 'pending' || 
        item.embedding_status === 'failed' || 
        !item.embedding_status
      ).length || 0;

      setHeaderStats((prev) => ({
        ...prev,
        knowledgeCount: data?.length || 0,
        avgQuality: Math.round(avgQuality),
        syncedCount,
        pendingCount,
      }));
    } catch (error: any) {
      toast.error("Knowledge Base ကို ဖတ်ယူ၍မရပါ။");
      console.error(error);
    }
  };

  // Update sync stats without full reload
  const updateSyncStats = () => {
    setKnowledge(prev => {
      const syncedCount = prev.filter(item => item.embedding_status === 'synced').length;
      const pendingCount = prev.filter(item => 
        item.embedding_status === 'pending' || 
        item.embedding_status === 'failed' || 
        !item.embedding_status
      ).length;
      
      setHeaderStats(h => ({ ...h, syncedCount, pendingCount }));
      return prev;
    });
  };

  const loadMemoryStats = async () => {
    try {
      const { data, error } = await supabase
        .from("agent_learning_context")
        .select("context_type");

      if (error) throw error;

      // Group by context_type
      const grouped: Record<string, number> = {};
      data?.forEach((item) => {
        const type = item.context_type || "unknown";
        grouped[type] = (grouped[type] || 0) + 1;
      });

      const stats = Object.entries(grouped).map(([context_type, count]) => ({
        context_type,
        count,
      }));

      setMemoryStats(stats);
      setHeaderStats((prev) => ({
        ...prev,
        memoriesCount: data?.length || 0,
      }));
    } catch (error) {
      console.error("Failed to load memory stats:", error);
    }
  };

  const loadEpisodicStats = async () => {
    try {
      // Get total count
      const { count: total } = await supabase
        .from("chat_memory_embeddings")
        .select("*", { count: "exact", head: true });

      // Get average importance and recent count
      const { data } = await supabase
        .from("chat_memory_embeddings")
        .select("importance_score, created_at")
        .order("created_at", { ascending: false })
        .limit(100);

      const avgImportance = data?.length
        ? data.reduce((sum, item) => sum + (item.importance_score || 0), 0) / data.length
        : 0;

      // Count recent (last 7 days)
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      const recentCount = data?.filter(
        (item) => new Date(item.created_at) >= sevenDaysAgo
      ).length || 0;

      setEpisodicStats({
        total: total || 0,
        avgImportance: Math.round(avgImportance * 100) / 100,
        recentCount,
        hasEmbeddings: (total || 0) > 0,
      });

      setHeaderStats((prev) => ({
        ...prev,
        episodicCount: total || 0,
      }));
    } catch (error) {
      console.error("Failed to load episodic stats:", error);
    }
  };

  const handleSyncEmbeddings = async () => {
    setSyncing(true);
    try {
      const { data, error } = await supabase.functions.invoke("sync-kb-embeddings", {
        body: { action: "sync_all" },
      });

      if (error) throw error;
      
      const queuedCount = data?.queued || 0;
      if (queuedCount > 0) {
        // Open progress dialog to show live progress
        setSyncProgressOpen(true);
        toast.success(`Item ${queuedCount} ခုကို Sync Queue ထဲသို့ ထည့်ပြီးပါပြီ။`);
      } else {
        toast.info("Item အားလုံး Sync ပြီးသားဖြစ်ပါသည် ✓");
      }
    } catch (error: any) {
      toast.error("Sync မအောင်မြင်ပါ: " + error.message);
    } finally {
      setSyncing(false);
    }
  };

  // Sync only pending/failed items
  const handleSyncPending = async () => {
    setSyncing(true);
    try {
      const { data, error } = await supabase.functions.invoke("sync-kb-embeddings", {
        body: { action: "sync_pending" },
      });

      if (error) throw error;
      
      const queuedCount = data?.queued || 0;
      if (queuedCount > 0) {
        setSyncProgressOpen(true);
        toast.success(`Item ${queuedCount} ခုကို Sync Queue ထဲသို့ ထည့်ပြီးပါပြီ။`);
      } else {
        toast.info("Item အားလုံး Sync ပြီးသားဖြစ်ပါသည် ✓");
      }
    } catch (error: any) {
      toast.error("Sync မအောင်မြင်ပါ: " + error.message);
    } finally {
      setSyncing(false);
    }
  };

  // Sync a single item - opens live progress dialog
  const handleSyncSingle = (contentId: string, contentTitle: string) => {
    // Optimistic update - show processing immediately
    setKnowledge(prev => prev.map(item =>
      item.id === contentId
        ? { ...item, embedding_status: "processing" as const, embedding_error: null }
        : item
    ));
    
    // Open the live sync dialog
    setSingleSyncItem({ id: contentId, title: contentTitle });
    setSingleSyncDialogOpen(true);
  };

  // Handle single sync completion - memoized to prevent useEffect re-triggers
  const handleSingleSyncComplete = useCallback((success: boolean, contentId: string) => {
    if (success) {
      toast.success("အောင်မြင်ပါသည်။ AI Brain ထဲသို့ အောင်မြင်စွာ ထည့်သွင်းပြီးပါပြီ။");
      
      // OPTIMISTIC UPDATE: Instantly update local state without waiting for realtime
      setKnowledge(prev => prev.map(item =>
        item.id === contentId
          ? { 
              ...item, 
              embedding_status: "synced" as const,
              embedding_synced_at: new Date().toISOString(),
              embedding_error: null
            }
          : item
      ));
      
      // Update header stats immediately
      setHeaderStats(prev => ({
        ...prev,
        syncedCount: prev.syncedCount + 1,
        pendingCount: Math.max(0, prev.pendingCount - 1)
      }));
    } else {
      toast.error("အမှားအယွင်းရှိပါသည်။ Error details ကို စစ်ဆေးပါ။");
      // Refetch to get actual error message from DB
      loadKnowledge();
    }
  }, [loadKnowledge]);

  const handleDelete = async () => {
    if (!deleteId) return;

    try {
      // Step 1: Remove from sync queue (prevents trigger constraint violation)
      await supabase
        .from("kb_embedding_sync_queue")
        .delete()
        .eq("content_id", deleteId);

      // Step 2: Remove embeddings
      await supabase
        .from("knowledge_base_embeddings")
        .delete()
        .eq("content_id", deleteId);

      // Step 3: Delete main content
      const { error } = await supabase
        .from("ai_generated_content")
        .delete()
        .eq("id", deleteId);

      if (error) throw error;

      // Optimistic state update
      setKnowledge(prev => prev.filter(item => item.id !== deleteId));
      setHeaderStats(prev => ({
        ...prev,
        knowledgeCount: prev.knowledgeCount - 1,
      }));
      toast.success("အောင်မြင်ပါသည်။ Knowledge Entry ကို ဖျက်ပြီးပါပြီ။");
    } catch (error: any) {
      if (error.message?.includes("unique constraint")) {
        toast.error("ဒေတာဖျက်၍မရပါ။ စနစ်၏ Queue ထဲတွင် အချက်အလက်များ ငြိနေသောကြောင့် ဖြစ်ပါသည်။ ကျေးဇူးပြု၍ ခဏကြာမှ ပြန်ကြိုးစားပါ။");
      } else {
        toast.error("ဒေတာဖျက်၍မရပါ။ " + error.message);
      }
    } finally {
      setDeleteId(null);
    }
  };

  // Filter knowledge based on search, category, and status
  const filteredKnowledge = knowledge.filter((item) => {
    const matchesSearch =
      !searchQuery ||
      cleanTitle(item.title).toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.content?.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory =
      categoryFilter === "all" || item.category === categoryFilter;
    const matchesStatus =
      statusFilter === "all" ||
      (statusFilter === "pending" && (!item.embedding_status || item.embedding_status === "pending")) ||
      item.embedding_status === statusFilter;
    return matchesSearch && matchesCategory && matchesStatus;
  });

  // Get unique categories
  const categories = Array.from(
    new Set(knowledge.map((k) => k.category).filter(Boolean))
  ) as string[];

  // Knowledge table columns
  const knowledgeColumns: ColumnDef<KnowledgeItem>[] = [
    {
      accessorKey: "title",
      header: "Title",
      cell: ({ row }) => (
        <div className="max-w-[300px]">
          <p className="font-medium truncate">{cleanTitle(row.original.title)}</p>
          <p className="text-xs text-muted-foreground truncate">
            {row.original.content?.substring(0, 60)}...
          </p>
        </div>
      ),
    },
    {
      accessorKey: "source_type",
      header: "Source",
      cell: ({ row }) => (
        <Badge variant="outline" className="capitalize">
          {row.original.source_type || "manual"}
        </Badge>
      ),
    },
    {
      accessorKey: "category",
      header: "Category",
      cell: ({ row }) => (
        <Badge variant="secondary" className="capitalize">
          {row.original.category || "general"}
        </Badge>
      ),
    },
    {
      accessorKey: "language",
      header: "Language",
      cell: ({ row }) => (
        <span className="text-sm capitalize">
          {row.original.language || "any"}
        </span>
      ),
    },
    {
      accessorKey: "quality_score",
      header: "Quality",
      cell: ({ row }) => (
        <div className="flex items-center gap-2">
          <div className="w-12 h-2 bg-muted rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-purple-500 to-cyan-500"
              style={{ width: `${row.original.quality_score || 0}%` }}
            />
          </div>
          <span className="text-xs">{row.original.quality_score || 0}%</span>
        </div>
      ),
    },
    {
      accessorKey: "created_at",
      header: "Date",
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground">
          {format(new Date(row.original.created_at), "MMM d, yyyy")}
        </span>
      ),
    },
    {
      accessorKey: "embedding_status",
      header: "Sync",
      cell: ({ row }) => {
        const status = row.original.embedding_status;
        const error = row.original.embedding_error;
        
        const badges: Record<string, { className: string; icon: string; text: string }> = {
          synced: { className: "bg-green-500/20 text-green-400 border-green-500/30", icon: "✓", text: "Synced" },
          processing: { className: "bg-blue-500/20 text-blue-400 border-blue-500/30 animate-pulse", icon: "⏳", text: "Syncing" },
          failed: { className: "bg-red-500/20 text-red-400 border-red-500/30", icon: "✗", text: "Failed" },
          pending: { className: "bg-amber-500/20 text-amber-400 border-amber-500/30", icon: "○", text: "Pending" }
        };
        
        const config = badges[status || 'pending'] || badges.pending;
        
        return (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="inline-flex">
                  <Badge className={config.className}>
                    {config.icon} {config.text}
                  </Badge>
                </span>
              </TooltipTrigger>
              {error && (
                <TooltipContent className="max-w-xs">
                  <p className="text-red-400">Error: {error}</p>
                </TooltipContent>
              )}
            </Tooltip>
          </TooltipProvider>
        );
      },
    },
    {
      id: "actions",
      header: "Actions",
      cell: ({ row }) => (
        <div className="flex gap-1">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => handleSyncSingle(row.original.id, row.original.title)}
                  disabled={row.original.embedding_status === "processing"}
                >
                  <RefreshCw className={`h-4 w-4 ${
                    row.original.embedding_status === "processing" ? "animate-spin" : ""
                  }`} />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Sync this item</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setViewContent(row.original)}
          >
            <Eye className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setDeleteId(row.original.id)}
          >
            <Trash2 className="h-4 w-4 text-destructive" />
          </Button>
        </div>
      ),
    },
  ];

  // Memory type labels
  const memoryTypeLabels: Record<string, { label: string; color: string }> = {
    explicit_memory: { label: "Explicit Memories", color: "bg-purple-500" },
    user_profile: { label: "User Profiles", color: "bg-blue-500" },
    session_summary: { label: "Session Summaries", color: "bg-cyan-500" },
    learned_kb: { label: "Learned Knowledge", color: "bg-emerald-500" },
    preference: { label: "Preferences", color: "bg-amber-500" },
    unknown: { label: "Other", color: "bg-gray-500" },
  };

  return (
    <div className="relative min-h-screen">
      {/* Futuristic background */}
      <div className="absolute inset-0 bg-gradient-to-br from-background via-background to-purple-950/20 opacity-50" />
      <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGRlZnM+PHBhdHRlcm4gaWQ9ImdyaWQiIHdpZHRoPSI2MCIgaGVpZ2h0PSI2MCIgcGF0dGVyblVuaXRzPSJ1c2VyU3BhY2VPblVzZSI+PHBhdGggZD0iTSA2MCAwIEwgMCAwIDAgNjAiIGZpbGw9Im5vbmUiIHN0cm9rZT0iIzMzMzM0NCIgc3Ryb2tlLXdpZHRoPSIxIiBvcGFjaXR5PSIwLjMiLz48L3BhdHRlcm4+PC9kZWZzPjxyZWN0IHdpZHRoPSIxMDAlIiBoZWlnaHQ9IjEwMCUiIGZpbGw9InVybCgjZ3JpZCkiLz48L3N2Zz4=')] opacity-30" />

      <div className="relative z-10 space-y-6 p-6">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-col md:flex-row md:items-center justify-between gap-4"
        >
          <div className="flex items-center gap-3">
            <div className="relative">
              <div className="absolute inset-0 bg-purple-500/50 rounded-full blur-xl animate-pulse" />
              <div className="relative p-3 rounded-full bg-gradient-to-br from-purple-500 to-cyan-500">
                <Brain className="h-8 w-8 text-white" />
              </div>
            </div>
            <div>
              <h1 className="text-2xl font-bold bg-gradient-to-r from-purple-400 to-cyan-400 bg-clip-text text-transparent">
                NeuroDigitalBrain
              </h1>
              <p className="text-sm text-muted-foreground">
                Total Awareness RAG Architecture
              </p>
            </div>
          </div>

          <div className="flex gap-2 items-center">
            {/* Auto-Sync Status Indicator */}
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                    autoSyncEnabled 
                      ? 'bg-green-500/10 text-green-400 border border-green-500/30' 
                      : 'bg-amber-500/10 text-amber-400 border border-amber-500/30'
                  }`}>
                    {autoSyncEnabled ? (
                      <>
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        Auto: ON
                      </>
                    ) : (
                      <>
                        <AlertTriangle className="h-3.5 w-3.5" />
                        Auto: OFF
                      </>
                    )}
                  </div>
                </TooltipTrigger>
                <TooltipContent>
                  <p>{autoSyncEnabled 
                    ? "Auto-Sync enabled - content changes will be queued automatically" 
                    : "Auto-Sync disabled - use manual sync only"
                  }</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>

            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => setSettingsOpen(true)}
                    className={`border-purple-500/30 hover:bg-purple-500/10 ${!hasApiKey ? 'border-amber-500/50 animate-pulse' : ''}`}
                    title="API Key Settings"
                  >
                    <Settings className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>{hasApiKey ? "API Key Settings" : "⚠️ Configure API Key first"}</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span>
                    <Button
                      variant="outline"
                      onClick={handleSyncPending}
                      disabled={syncing || !hasApiKey || headerStats.pendingCount === 0}
                      className="gap-2"
                    >
                      <RefreshCw className={`h-4 w-4 ${syncing ? "animate-spin" : ""}`} />
                      Sync Pending ({headerStats.pendingCount})
                    </Button>
                  </span>
                </TooltipTrigger>
                {!hasApiKey ? (
                  <TooltipContent>
                    <p>Configure System API Key first</p>
                  </TooltipContent>
                ) : headerStats.pendingCount === 0 ? (
                  <TooltipContent>
                    <p>All items are already synced ✓</p>
                  </TooltipContent>
                ) : null}
              </Tooltip>
            </TooltipProvider>
            <Button
              onClick={() => setAddDialogOpen(true)}
              className="gap-2 bg-gradient-to-r from-purple-600 to-cyan-600 hover:from-purple-700 hover:to-cyan-700"
            >
              <Plus className="h-4 w-4" />
              Add Knowledge
            </Button>
          </div>
        </motion.div>

        {/* Stats Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
          >
            <Card className="bg-gradient-to-br from-purple-500/10 to-purple-500/5 border-purple-500/20">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-purple-500/20">
                    <BookOpen className="h-5 w-5 text-purple-400" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold">{headerStats.knowledgeCount}</p>
                    <p className="text-xs text-muted-foreground">Global Knowledge</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
          >
            <Card className="bg-gradient-to-br from-green-500/10 to-green-500/5 border-green-500/20">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-green-500/20">
                    <Database className="h-5 w-5 text-green-400" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold">
                      <span className="text-green-400">{headerStats.syncedCount}</span>
                      <span className="text-muted-foreground text-lg">/{headerStats.knowledgeCount}</span>
                    </p>
                    <p className="text-xs text-muted-foreground">Embeddings Synced</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
          >
            <Card className="bg-gradient-to-br from-cyan-500/10 to-cyan-500/5 border-cyan-500/20">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-cyan-500/20">
                    <Activity className="h-5 w-5 text-cyan-400" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold">{headerStats.episodicCount}</p>
                    <p className="text-xs text-muted-foreground">Episodic Memories</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
          >
            <Card className="bg-gradient-to-br from-amber-500/10 to-amber-500/5 border-amber-500/20">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-amber-500/20">
                    <Users className="h-5 w-5 text-amber-400" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold">{headerStats.memoriesCount}</p>
                    <p className="text-xs text-muted-foreground">User Memories</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        </div>

        {/* Tabs Content */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
          <TabsList className="bg-background/50 backdrop-blur-xl border">
            <TabsTrigger value="knowledge" className="gap-2">
              <BookOpen className="h-4 w-4" />
              Global Knowledge
            </TabsTrigger>
            <TabsTrigger value="memories" className="gap-2">
              <Users className="h-4 w-4" />
              User Memories
            </TabsTrigger>
            <TabsTrigger value="episodic" className="gap-2">
              <Activity className="h-4 w-4" />
              Episodic Stats
            </TabsTrigger>
          </TabsList>

          {/* Global Knowledge Tab */}
          <TabsContent value="knowledge" className="space-y-4">
            <Card className="bg-background/50 backdrop-blur-xl border-border/50">
              <CardHeader className="pb-4">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <CardTitle className="text-lg">Knowledge Base Entries</CardTitle>
                  <div className="flex gap-2">
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        placeholder="Search knowledge..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="pl-9 w-[200px]"
                      />
                    </div>
                    <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                      <SelectTrigger className="w-[150px]">
                        <SelectValue placeholder="Category" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Categories</SelectItem>
                        {categories.map((cat) => (
                          <SelectItem key={cat} value={cat}>
                            {cat}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Select value={statusFilter} onValueChange={setStatusFilter}>
                      <SelectTrigger className="w-[140px]">
                        <SelectValue placeholder="Status" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">အားလုံး</SelectItem>
                        <SelectItem value="pending">
                          <span className="flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full bg-amber-500" />
                            Pending
                          </span>
                        </SelectItem>
                        <SelectItem value="processing">
                          <span className="flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
                            Syncing
                          </span>
                        </SelectItem>
                        <SelectItem value="synced">
                          <span className="flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full bg-green-500" />
                            Synced
                          </span>
                        </SelectItem>
                        <SelectItem value="failed">
                          <span className="flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full bg-red-500" />
                            Failed
                          </span>
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <div className="flex items-center justify-center h-48">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
                  </div>
                ) : (
                  <DataTable
                    columns={knowledgeColumns}
                    data={filteredKnowledge}
                    searchKey="title"
                    pageIndex={tablePageIndex}
                    onPageChange={setTablePageIndex}
                  />
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* User Memories Tab */}
          <TabsContent value="memories" className="space-y-4">
            <Card className="bg-background/50 backdrop-blur-xl border-border/50">
              <CardHeader>
                <CardTitle className="text-lg">User Memory Distribution</CardTitle>
              </CardHeader>
              <CardContent>
                {memoryStats.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    No user memories recorded yet
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {memoryStats.map((stat) => {
                      const config = memoryTypeLabels[stat.context_type] || memoryTypeLabels.unknown;
                      return (
                        <motion.div
                          key={stat.context_type}
                          initial={{ opacity: 0, scale: 0.95 }}
                          animate={{ opacity: 1, scale: 1 }}
                          className="p-4 rounded-lg bg-gradient-to-br from-background to-muted/30 border"
                        >
                          <div className="flex items-center gap-3">
                            <div className={`w-3 h-3 rounded-full ${config.color}`} />
                            <div className="flex-1">
                              <p className="font-medium">{config.label}</p>
                              <p className="text-sm text-muted-foreground">
                                {stat.context_type}
                              </p>
                            </div>
                            <p className="text-2xl font-bold">{stat.count}</p>
                          </div>
                        </motion.div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Episodic Stats Tab */}
          <TabsContent value="episodic" className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Card className="bg-background/50 backdrop-blur-xl border-border/50">
                <CardContent className="p-6">
                  <div className="flex items-center gap-4">
                    <div className="p-3 rounded-xl bg-cyan-500/20">
                      <Database className="h-6 w-6 text-cyan-400" />
                    </div>
                    <div>
                      <p className="text-3xl font-bold">{episodicStats.total}</p>
                      <p className="text-sm text-muted-foreground">Total Memories</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-background/50 backdrop-blur-xl border-border/50">
                <CardContent className="p-6">
                  <div className="flex items-center gap-4">
                    <div className="p-3 rounded-xl bg-purple-500/20">
                      <TrendingUp className="h-6 w-6 text-purple-400" />
                    </div>
                    <div>
                      <p className="text-3xl font-bold">{episodicStats.avgImportance}</p>
                      <p className="text-sm text-muted-foreground">Avg Importance</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-background/50 backdrop-blur-xl border-border/50">
                <CardContent className="p-6">
                  <div className="flex items-center gap-4">
                    <div className="p-3 rounded-xl bg-amber-500/20">
                      <Zap className="h-6 w-6 text-amber-400" />
                    </div>
                    <div>
                      <p className="text-3xl font-bold">{episodicStats.recentCount}</p>
                      <p className="text-sm text-muted-foreground">Last 7 Days</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            <Card className="bg-background/50 backdrop-blur-xl border-border/50">
              <CardHeader>
                <CardTitle className="text-lg">Vector Embedding Health</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-4 p-4 rounded-lg bg-muted/30">
                  <div
                    className={`w-4 h-4 rounded-full ${
                      episodicStats.hasEmbeddings ? "bg-emerald-500" : "bg-amber-500"
                    } animate-pulse`}
                  />
                  <div>
                    <p className="font-medium">
                      {episodicStats.hasEmbeddings
                        ? "Embeddings Active"
                        : "No Embeddings Found"}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {episodicStats.hasEmbeddings
                        ? `${episodicStats.total} vector embeddings stored (768 dimensions)`
                        : "Chat with BeeBot to generate episodic memories"}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      {/* Dialogs */}
      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Knowledge Entry ကို ဖျက်မှာ သေချာပါသလား?</AlertDialogTitle>
            <AlertDialogDescription>
              ဤ Knowledge ကို NeuroDigitalBrain မှ အပြီးတိုင် ဖျက်ပစ်မည်ဖြစ်ပါသည်။ ပြန်လည်ရယူ၍ မရနိုင်ပါ။
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>မလုပ်တော့ပါ</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground">
              ဖျက်မည်
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {viewContent && (
        <ContentViewDialog
          content={viewContent}
          open={!!viewContent}
          onClose={() => setViewContent(null)}
        />
      )}

      <AddTrainingContentDialog
        open={addDialogOpen}
        onClose={() => setAddDialogOpen(false)}
        onSave={() => {
          setAddDialogOpen(false);
          loadKnowledge();
        }}
      />

      <NeuroBrainSettingsDialog
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        onKeyUpdated={checkApiKeyStatus}
        onAutoSyncChanged={setAutoSyncEnabled}
      />

      <SyncProgressDialog
        open={syncProgressOpen}
        onOpenChange={setSyncProgressOpen}
        onComplete={() => {
          loadKnowledge();
        }}
      />

      <SyncSingleItemDialog
        contentId={singleSyncItem?.id || null}
        contentTitle={singleSyncItem?.title || ""}
        open={singleSyncDialogOpen}
        onOpenChange={(open) => {
          setSingleSyncDialogOpen(open);
          if (!open) setSingleSyncItem(null);
        }}
        onComplete={handleSingleSyncComplete}
      />
    </div>
  );
};
