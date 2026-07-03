import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Database, Search, Trash2, Eye, TrendingUp, Activity, Server, Zap, Globe, Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { DataTable } from "@/components/ui/data-table";
import { ColumnDef } from "@tanstack/react-table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
import { ContentViewDialog } from "./ContentViewDialog";
import { AddTrainingContentDialog } from "./AddTrainingContentDialog";
import { format } from "date-fns";
import { motion } from "motion/react";
import { calculateContentMetrics } from "@/lib/contentMetrics";

export const MasterKnowledgeHub = () => {
  const [contents, setContents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [viewContent, setViewContent] = useState<any>(null);
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [stats, setStats] = useState({
    totalRecords: 0,
    categories: 0,
    avgQuality: 0,
    totalViews: 0
  });

  useEffect(() => {
    loadGlobalContent();
    loadStats();
    
    // Real-time subscription
    const channel = supabase
      .channel('global-knowledge-changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'ai_generated_content', filter: 'is_global=eq.true' },
        () => {
          loadGlobalContent();
          loadStats();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const loadGlobalContent = async () => {
    try {
      const { data, error } = await supabase
        .from("ai_generated_content")
        .select(`
          *,
          profiles:user_id (
            full_name,
            avatar_url
          )
        `)
        .eq("is_global", true)
        .order("created_at", { ascending: false });

      if (error) throw error;
      setContents(data || []);
    } catch (error: any) {
      toast.error("Failed to load global content");
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const loadStats = async () => {
    try {
      const { data } = await supabase
        .from("ai_generated_content")
        .select("category, quality_score, usage_count")
        .eq("is_global", true);

      if (data) {
        const categories = new Set(data.map(item => item.category).filter(Boolean));
        const avgQuality = data.reduce((sum, item) => sum + (item.quality_score || 0), 0) / data.length;
        const totalViews = data.reduce((sum, item) => sum + (item.usage_count || 0), 0);

        setStats({
          totalRecords: data.length,
          categories: categories.size,
          avgQuality: Math.round(avgQuality),
          totalViews
        });
      }
    } catch (error) {
      console.error("Failed to load stats:", error);
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;

    try {
      const { error } = await supabase
        .from("ai_generated_content")
        .delete()
        .eq("id", deleteId);

      if (error) throw error;
      toast.success("Global content deleted");
      loadGlobalContent();
      loadStats();
    } catch (error: any) {
      toast.error("Failed to delete content");
    } finally {
      setDeleteId(null);
    }
  };

  const handleUnpublish = async (id: string) => {
    try {
      const { error } = await supabase
        .from("ai_generated_content")
        .update({ is_global: false })
        .eq("id", id);

      if (error) throw error;
      toast.success("Content unpublished from global hub");
      loadGlobalContent();
      loadStats();
    } catch (error: any) {
      toast.error("Failed to unpublish content");
    }
  };

  const filteredContent = contents.filter(content => {
    const matchesSearch = content.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         content.content.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = categoryFilter === "all" || content.category === categoryFilter;
    return matchesSearch && matchesCategory;
  });

  const columns: ColumnDef<any>[] = [
    {
      accessorKey: "title",
      header: "Title",
      cell: ({ row }) => (
        <div className="flex items-center gap-1.5 max-w-xs">
          <Globe className="h-3 w-3 text-primary flex-shrink-0" />
          <div className="flex flex-col min-w-0">
            <span className="text-xs font-medium truncate">{row.original.title}</span>
            {row.original.topic && (
              <span className="text-[10px] text-muted-foreground truncate">{row.original.topic}</span>
            )}
          </div>
        </div>
      ),
    },
    {
      accessorKey: "metrics",
      header: "Metrics",
      cell: ({ row }) => {
        const metrics = calculateContentMetrics(row.original.content || "", row.original.title);
        return (
          <div className="text-[10px] space-y-0.5">
            <div>{metrics.wordCount}w</div>
            <div className="text-muted-foreground">{metrics.readingTime}m</div>
          </div>
        );
      },
    },
    {
      accessorKey: "seo_score",
      header: "SEO",
      cell: ({ row }) => {
        const metrics = calculateContentMetrics(row.original.content || "", row.original.title);
        const score = metrics.seoScore;
        const color = score >= 80 ? "bg-emerald-500" : score >= 60 ? "bg-yellow-500" : "bg-red-500";
        return (
          <Badge variant="outline" className={`${color} text-white border-0 text-[10px] px-1.5 py-0`}>
            {score}
          </Badge>
        );
      },
    },
    {
      accessorKey: "attributes",
      header: "Attributes",
      cell: ({ row }) => (
        <div className="flex flex-col gap-0.5 max-w-[120px]">
          {row.original.tone && (
            <Badge variant="secondary" className="text-[9px] px-1.5 py-0 h-4">
              {row.original.tone}
            </Badge>
          )}
          {row.original.style && (
            <Badge variant="secondary" className="text-[9px] px-1.5 py-0 h-4">
              {row.original.style}
            </Badge>
          )}
        </div>
      ),
    },
    {
      accessorKey: "creator",
      header: "Creator",
      cell: ({ row }) => {
        const profile = row.original.profiles;
        return (
          <span className="text-[10px] truncate block max-w-[80px]">
            {profile?.full_name || "Unknown"}
          </span>
        );
      },
    },
    {
      accessorKey: "category",
      header: "Category",
      cell: ({ row }) => (
        <Badge variant="outline" className="capitalize text-[9px] px-1.5 py-0 h-4">
          {row.original.category || "Uncategorized"}
        </Badge>
      ),
    },
    {
      accessorKey: "usage_count",
      header: "Usage",
      cell: ({ row }) => (
        <div className="flex items-center gap-1">
          <Eye className="h-2.5 w-2.5 text-muted-foreground" />
          <span className="text-[10px]">{row.original.usage_count || 0}</span>
        </div>
      ),
    },
    {
      accessorKey: "quality_score",
      header: "Quality",
      cell: ({ row }) => {
        const score = row.original.quality_score || 0;
        const color = score >= 80 ? "bg-emerald-500" : score >= 60 ? "bg-yellow-500" : "bg-red-500";
        return (
          <Badge variant="outline" className={`${color} text-white border-0 text-[10px] px-1.5 py-0`}>
            {score}
          </Badge>
        );
      },
    },
    {
      accessorKey: "created_at",
      header: "Created",
      cell: ({ row }) => (
        <span className="text-[10px] whitespace-nowrap">
          {format(new Date(row.original.created_at), "MMM dd, yyyy")}
        </span>
      ),
    },
    {
      id: "actions",
      header: "Actions",
      cell: ({ row }) => (
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setViewContent(row.original)}
            className="h-6 w-6 p-0"
          >
            <Eye className="h-3 w-3" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => handleUnpublish(row.original.id)}
            className="h-6 px-2 text-yellow-500 hover:text-yellow-600 text-[10px]"
          >
            Unpub
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setDeleteId(row.original.id)}
            className="h-6 w-6 p-0"
          >
            <Trash2 className="h-3 w-3 text-destructive" />
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      {/* Futuristic Server Room Header */}
      <div className="relative overflow-hidden rounded-xl border border-primary/20 bg-gradient-to-br from-background via-primary/5 to-background">
        {/* Animated Background Grid */}
        <div className="absolute inset-0 opacity-20">
          <div className="absolute inset-0" style={{
            backgroundImage: `
              linear-gradient(to right, hsl(var(--primary) / 0.1) 1px, transparent 1px),
              linear-gradient(to bottom, hsl(var(--primary) / 0.1) 1px, transparent 1px)
            `,
            backgroundSize: '40px 40px'
          }} />
        </div>

        {/* Header Content */}
        <CardHeader className="relative">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <motion.div
                animate={{ 
                  boxShadow: [
                    '0 0 20px hsl(var(--primary) / 0.3)',
                    '0 0 40px hsl(var(--primary) / 0.5)',
                    '0 0 20px hsl(var(--primary) / 0.3)'
                  ]
                }}
                transition={{ duration: 2, repeat: Infinity }}
                className="p-3 rounded-xl bg-primary/10 backdrop-blur-sm border border-primary/30"
              >
                <Server className="h-6 w-6 text-primary" />
              </motion.div>
              <div>
                <CardTitle className="text-2xl flex items-center gap-2">
                  Central Data Hub
                  <Badge variant="outline" className="text-xs border-emerald-500/30 text-emerald-500">
                    <Activity className="h-3 w-3 mr-1 animate-pulse" />
                    ONLINE
                  </Badge>
                </CardTitle>
                <p className="text-sm text-muted-foreground">Global knowledge accessible to all AI generations</p>
              </div>
            </div>
            <Button
              onClick={() => setAddDialogOpen(true)}
              className="bg-primary hover:bg-primary/90"
            >
              <Plus className="h-4 w-4 mr-2" />
              Add Training Data
            </Button>
          </div>
        </CardHeader>
      </div>

      {/* Futuristic Stats Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
        >
          <Card className="relative overflow-hidden border-primary/20 bg-gradient-to-br from-primary/5 to-transparent">
            <div className="absolute top-0 right-0 w-32 h-32 bg-primary/10 rounded-full blur-3xl" />
            <CardContent className="p-6 relative">
              <div className="flex items-center gap-3 mb-2">
                <Database className="h-5 w-5 text-primary" />
                <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Total Records</div>
              </div>
              <div className="text-3xl font-bold bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-transparent">
                {stats.totalRecords}
              </div>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          <Card className="relative overflow-hidden border-cyan-500/20 bg-gradient-to-br from-cyan-500/5 to-transparent">
            <div className="absolute top-0 right-0 w-32 h-32 bg-cyan-500/10 rounded-full blur-3xl" />
            <CardContent className="p-6 relative">
              <div className="flex items-center gap-3 mb-2">
                <TrendingUp className="h-5 w-5 text-cyan-500" />
                <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Categories</div>
              </div>
              <div className="text-3xl font-bold bg-gradient-to-r from-cyan-500 to-cyan-400 bg-clip-text text-transparent">
                {stats.categories}
              </div>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
        >
          <Card className="relative overflow-hidden border-emerald-500/20 bg-gradient-to-br from-emerald-500/5 to-transparent">
            <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/10 rounded-full blur-3xl" />
            <CardContent className="p-6 relative">
              <div className="flex items-center gap-3 mb-2">
                <Zap className="h-5 w-5 text-emerald-500" />
                <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Avg. Quality</div>
              </div>
              <div className="text-3xl font-bold bg-gradient-to-r from-emerald-500 to-emerald-400 bg-clip-text text-transparent">
                {stats.avgQuality}%
              </div>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
        >
          <Card className="relative overflow-hidden border-purple-500/20 bg-gradient-to-br from-purple-500/5 to-transparent">
            <div className="absolute top-0 right-0 w-32 h-32 bg-purple-500/10 rounded-full blur-3xl" />
            <CardContent className="p-6 relative">
              <div className="flex items-center gap-3 mb-2">
                <Globe className="h-5 w-5 text-purple-500" />
                <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Total Views</div>
              </div>
              <div className="text-3xl font-bold bg-gradient-to-r from-purple-500 to-purple-400 bg-clip-text text-transparent">
                {stats.totalViews.toLocaleString()}
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </div>

      {/* Search and Filters */}
      <Card className="border-primary/20 backdrop-blur-sm bg-card/95">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Search className="h-5 w-5 text-primary" />
            Search & Filter
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by title..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 border-primary/20 focus:border-primary/40"
              />
            </div>
            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger className="w-[200px] border-primary/20 focus:border-primary/40">
                <SelectValue placeholder="All Categories" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Categories</SelectItem>
                <SelectItem value="general">General</SelectItem>
                <SelectItem value="crypto">Crypto</SelectItem>
                <SelectItem value="tech">Tech</SelectItem>
                <SelectItem value="business">Business</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Data Table */}
      <Card className="border-primary/20 backdrop-blur-sm bg-card/95">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Database className="h-5 w-5 text-primary" />
            Global Content Records
            <Badge variant="secondary" className="ml-auto">
              {filteredContent.length} records
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <DataTable
            columns={columns}
            data={filteredContent}
            searchKey="title"
          />
        </CardContent>
      </Card>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Global Content?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove this content from the global knowledge hub. AI generations will no longer have access to it.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* View Dialog */}
      {viewContent && (
        <ContentViewDialog
          content={viewContent}
          open={!!viewContent}
          onClose={() => setViewContent(null)}
        />
      )}

      {/* Add Training Data Dialog */}
      <AddTrainingContentDialog
        open={addDialogOpen}
        onClose={() => setAddDialogOpen(false)}
        onSave={() => {
          loadGlobalContent();
          loadStats();
        }}
      />
    </div>
  );
};