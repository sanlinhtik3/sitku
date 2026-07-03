import { useState, useCallback } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Brain, Search, Grid3X3, List, RefreshCw } from "lucide-react";
import { PageHeader, GlassmorphicCard } from "@/components/ui/FuturisticElements";
import { KnowledgeSearchBar } from "@/components/knowledge/KnowledgeSearchBar";
import { KnowledgeCard } from "@/components/knowledge/KnowledgeCard";
import { EmbeddingHealthMonitor } from "@/components/knowledge/EmbeddingHealthMonitor";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

const FILTER_CHIPS = ["All", "url_ingest", "text_digest", "ai_generated", "manual"] as const;
const TAG_FILTERS = ["#Finance", "#AI", "#Tech", "#Health", "#ReadingList", "#Business", "#Learning", "#Personal", "#News", "#Research"];

const Knowledge = () => {
  const { user } = useAuth();
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [activeFilter, setActiveFilter] = useState<string>("All");
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [searchResults, setSearchResults] = useState<any[] | null>(null);
  const [isSearching, setIsSearching] = useState(false);

  // Fetch all personal knowledge items
  const { data: items, isLoading, refetch } = useQuery({
    queryKey: ["personal-knowledge", user?.id, activeFilter, activeTag],
    queryFn: async () => {
      if (!user?.id) return [];
      let query = supabase
        .from("ai_generated_content")
        .select("id, title, content, category, tags, source_type, embedding_status, created_at, metadata")
        .eq("user_id", user.id)
        .eq("is_personal", true)
        .order("created_at", { ascending: false })
        .limit(50);

      if (activeFilter !== "All") {
        query = query.eq("source_type", activeFilter);
      }
      if (activeTag) {
        query = query.contains("tags", [activeTag]);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    },
    enabled: !!user?.id,
  });

  // Embedding health stats
  const { data: healthStats } = useQuery({
    queryKey: ["embedding-health", user?.id],
    queryFn: async () => {
      if (!user?.id) return { synced: 0, pending: 0, failed: 0 };
      const { data } = await supabase
        .from("ai_generated_content")
        .select("embedding_status")
        .eq("user_id", user.id)
        .eq("is_personal", true);

      const stats = { synced: 0, pending: 0, failed: 0 };
      (data || []).forEach((item: any) => {
        if (item.embedding_status === "synced") stats.synced++;
        else if (item.embedding_status === "pending") stats.pending++;
        else if (item.embedding_status === "failed") stats.failed++;
        else stats.pending++; // null = pending
      });
      return stats;
    },
    enabled: !!user?.id,
  });

  const handleSemanticSearch = useCallback(async (query: string) => {
    if (!query.trim() || !user?.id) {
      setSearchResults(null);
      return;
    }
    setIsSearching(true);
    try {
      // Call edge function to generate embedding and search
      const { data, error } = await supabase.functions.invoke("search-knowledge", {
        body: { query, user_id: user.id },
      });
      if (error) throw error;
      setSearchResults(data?.results || []);
    } catch (e: any) {
      console.error("Search error:", e);
      toast.error("Search failed. Falling back to text search.");
      // Fallback: text search
      const { data } = await supabase
        .from("ai_generated_content")
        .select("id, title, content, category, tags, source_type, embedding_status, created_at, metadata")
        .eq("user_id", user.id)
        .eq("is_personal", true)
        .or(`title.ilike.%${query}%,content.ilike.%${query}%`)
        .order("created_at", { ascending: false })
        .limit(20);
      setSearchResults(data || []);
    } finally {
      setIsSearching(false);
    }
  }, [user?.id]);

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from("ai_generated_content").delete().eq("id", id);
    if (error) {
      toast.error("Delete failed");
    } else {
      toast.success("Knowledge item deleted");
      refetch();
      if (searchResults) setSearchResults(prev => prev?.filter(r => r.id !== id) || null);
    }
  };

  const handleResync = async (id: string) => {
    const { error } = await supabase
      .from("ai_generated_content")
      .update({ embedding_status: "pending" })
      .eq("id", id);
    if (error) {
      toast.error("Re-sync failed");
    } else {
      toast.success("Queued for re-embedding");
      refetch();
    }
  };

  const displayItems = searchResults ?? items ?? [];
  const filterLabel = (f: string) => {
    const map: Record<string, string> = {
      All: "All", url_ingest: "🔗 URLs", text_digest: "📄 Text",
      ai_generated: "🤖 AI", manual: "✍️ Manual",
    };
    return map[f] || f;
  };

  return (
    <div className="min-h-screen p-3 sm:p-6 space-y-4 sm:space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <PageHeader
        icon={Brain}
        title="Knowledge Base"
        subtitle="Your personal library of AI-indexed insights"
        actions={
          <div className="flex items-center gap-2">
            <EmbeddingHealthMonitor stats={healthStats || { synced: 0, pending: 0, failed: 0 }} />
            <Button
              variant="ghost"
              size="icon"
              onClick={() => refetch()}
              className="h-9 w-9 rounded-xl"
            >
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>
        }
      />

      {/* Semantic Search */}
      <KnowledgeSearchBar onSearch={handleSemanticSearch} isSearching={isSearching} />

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        {/* Source type filters */}
        {FILTER_CHIPS.map((f) => (
          <button
            key={f}
            onClick={() => { setActiveFilter(f); setSearchResults(null); }}
            className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-all duration-200 ${
              activeFilter === f
                ? "bg-primary/20 text-primary border border-primary/30"
                : "bg-card/30 text-muted-foreground border border-white/[0.06] hover:border-white/[0.1]"
            }`}
          >
            {filterLabel(f)}
          </button>
        ))}

        {/* Divider */}
        <div className="w-px h-6 bg-white/[0.08] self-center mx-1" />

        {/* Tag filters */}
        <div className="flex flex-wrap gap-1.5">
          {TAG_FILTERS.map((tag) => (
            <button
              key={tag}
              onClick={() => { setActiveTag(activeTag === tag ? null : tag); setSearchResults(null); }}
              className={`px-2 py-1 rounded-lg text-[10px] font-medium transition-all ${
                activeTag === tag
                  ? "bg-primary/15 text-primary border border-primary/20"
                  : "bg-card/20 text-muted-foreground/60 hover:text-muted-foreground border border-transparent"
              }`}
            >
              {tag}
            </button>
          ))}
        </div>
      </div>

      {/* View toggle + count */}
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          {searchResults ? `${displayItems.length} search results` : `${displayItems.length} items`}
        </p>
        <div className="flex items-center gap-1 bg-card/30 rounded-lg p-0.5 border border-white/[0.06]">
          <button
            onClick={() => setViewMode("grid")}
            className={`p-1.5 rounded-md transition-all ${viewMode === "grid" ? "bg-primary/20 text-primary" : "text-muted-foreground"}`}
          >
            <Grid3X3 className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={() => setViewMode("list")}
            className={`p-1.5 rounded-md transition-all ${viewMode === "list" ? "bg-primary/20 text-primary" : "text-muted-foreground"}`}
          >
            <List className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Content Grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <GlassmorphicCard key={i} className="h-48 animate-pulse" hover={false}>
              <div className="p-4 space-y-3">
                <div className="h-4 bg-muted/30 rounded w-3/4" />
                <div className="h-3 bg-muted/20 rounded w-full" />
                <div className="h-3 bg-muted/20 rounded w-2/3" />
              </div>
            </GlassmorphicCard>
          ))}
        </div>
      ) : displayItems.length === 0 ? (
        <GlassmorphicCard className="p-8 sm:p-12 text-center" hover={false}>
          <Brain className="h-12 w-12 text-muted-foreground/30 mx-auto mb-3" />
          <h3 className="text-sm font-medium text-foreground/80 mb-1">No knowledge yet</h3>
          <p className="text-xs text-muted-foreground/60">
            Use BeeBot's <code className="text-primary/80">ingest_url</code> or <code className="text-primary/80">digest_text</code> tools to start building your personal knowledge base.
          </p>
        </GlassmorphicCard>
      ) : (
        <div className={
          viewMode === "grid"
            ? "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4"
            : "flex flex-col gap-2"
        }>
          {displayItems.map((item: any) => (
            <KnowledgeCard
              key={item.id}
              item={item}
              viewMode={viewMode}
              similarity={item.similarity}
              onDelete={handleDelete}
              onResync={handleResync}
            />
          ))}
        </div>
      )}
    </div>
  );
};

export default Knowledge;
