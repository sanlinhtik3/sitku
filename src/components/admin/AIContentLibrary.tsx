import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { formatLocalDate } from "@/lib/dateUtils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Download, BarChart3, Plus, Eye, Edit, Trash2, FileText } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ContentEditorDialog } from "./ContentEditorDialog";
import { ContentViewDialog } from "./ContentViewDialog";
import { DataTable } from "@/components/ui/data-table";
import { columns, ContentRow } from "./content-library/columns";
import { exportAsCSV, exportAsCombinedMarkdown, exportAsCombinedWord } from "@/lib/bulkExportUtils";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { ContentAnalyticsDashboard } from "./content-library/ContentAnalyticsDashboard";
import { calculateContentMetrics } from "@/lib/contentMetrics";
import { BulkContentImport } from "./BulkContentImport";
import { Upload } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { formatDistanceToNow } from "date-fns";
import { GlassmorphicCard } from "@/components/ui/FuturisticElements";
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
interface AIContentLibraryProps {
  onLoadTemplate?: (id: string) => void;
}

// Mobile Content Card Component
const MobileContentCard = ({
  content,
  onView,
  onEdit,
  onDelete
}: {
  content: ContentRow;
  onView: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) => {
  const metrics = calculateContentMetrics(content.content, content.title);
  return <div className="bg-card/30 backdrop-blur-sm rounded-xl border border-border/20 p-3 sm:p-4 overflow-hidden hover:border-primary/20 transition-colors">
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <FileText className="h-4 w-4 text-primary/60 flex-shrink-0" />
          <span className="font-medium truncate text-sm">{content.title}</span>
        </div>
        <Badge variant="outline" className={`text-[10px] px-1.5 py-0 flex-shrink-0 ${metrics.seoScore >= 80 ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/30" : metrics.seoScore >= 60 ? "bg-yellow-500/10 text-yellow-500 border-yellow-500/30" : "bg-red-500/10 text-red-500 border-red-500/30"}`}>
          SEO: {metrics.seoScore}
        </Badge>
      </div>

      {content.topic && <p className="text-xs text-muted-foreground mb-2 line-clamp-1 break-words">{content.topic}</p>}

      <div className="flex flex-wrap gap-1.5 mb-3 max-w-full overflow-hidden">
        {content.tone && <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-5">
            {content.tone}
          </Badge>}
        {content.style && <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-5">
            {content.style}
          </Badge>}
        {content.category && <Badge className="text-[10px] px-1.5 py-0 h-5 bg-primary/20 text-primary capitalize">
            {content.category}
          </Badge>}
      </div>

      <div className="flex items-center justify-between text-xs text-muted-foreground mb-3">
        <span>
          {metrics.wordCount} words • {metrics.readingTime}m read
        </span>
        <span>{formatDistanceToNow(new Date(content.created_at), {
          addSuffix: true
        })}</span>
      </div>

      {/* Quality Score Bar */}
      <div className="flex items-center gap-2 mb-3">
        <span className="text-[10px] text-muted-foreground">Quality:</span>
        <div className="h-1.5 flex-1 bg-secondary/50 rounded-full overflow-hidden">
          <div className={`h-full ${content.quality_score >= 70 ? "bg-emerald-500" : content.quality_score >= 50 ? "bg-blue-500" : "bg-yellow-500"}`} style={{
          width: `${content.quality_score || 50}%`
        }} />
        </div>
        <span className="text-[10px] font-medium w-6">{content.quality_score || 50}</span>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2">
        <Button size="sm" variant="outline" onClick={onView} className="flex-1 h-8 text-xs border-primary/20 hover:bg-primary/10">
          <Eye className="h-3.5 w-3.5 mr-1.5" />
          View
        </Button>
        <Button size="sm" variant="outline" onClick={onEdit} className="flex-1 h-8 text-xs border-primary/20 hover:bg-primary/10">
          <Edit className="h-3.5 w-3.5 mr-1.5" />
          Edit
        </Button>
        <Button size="sm" variant="outline" onClick={onDelete} className="h-8 px-2.5 border-destructive/20 hover:bg-destructive/10 hover:text-destructive">
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>;
};
export const AIContentLibrary = ({
  onLoadTemplate
}: AIContentLibraryProps) => {
  const {
    user,
    isAdmin
  } = useAuth();
  const [contents, setContents] = useState<ContentRow[]>([]);
  const [filteredContents, setFilteredContents] = useState<ContentRow[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [contentToDelete, setContentToDelete] = useState<string | null>(null);
  const [editingContent, setEditingContent] = useState<ContentRow | null>(null);
  const [viewingContent, setViewingContent] = useState<ContentRow | null>(null);
  const [exportCount, setExportCount] = useState<string>("all");
  const [customCount, setCustomCount] = useState<string>("");
  const [exportFormat, setExportFormat] = useState<string>("csv");
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [analyticsDialogOpen, setAnalyticsDialogOpen] = useState(false);
  const [isAddingContent, setIsAddingContent] = useState(false);
  const [bulkImportOpen, setBulkImportOpen] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  // Paginated data
  const paginatedContents = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    return filteredContents.slice(startIndex, startIndex + itemsPerPage);
  }, [filteredContents, currentPage]);

  const totalPages = Math.ceil(filteredContents.length / itemsPerPage);

  // Reset to page 1 when filter changes
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, selectedCategory]);

  // Generate page numbers for pagination
  const getPageNumbers = () => {
    const pages: (number | 'ellipsis')[] = [];
    if (totalPages <= 5) {
      for (let i = 1; i <= totalPages; i++) pages.push(i);
    } else {
      if (currentPage <= 3) {
        pages.push(1, 2, 3, 'ellipsis', totalPages);
      } else if (currentPage >= totalPages - 2) {
        pages.push(1, 'ellipsis', totalPages - 2, totalPages - 1, totalPages);
      } else {
        pages.push(1, 'ellipsis', currentPage, 'ellipsis', totalPages);
      }
    }
    return pages;
  };

  // Keyboard shortcut for analytics
  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "k") {
        e.preventDefault();
        setAnalyticsDialogOpen(prev => !prev);
      }
    };
    window.addEventListener("keydown", handleKeyPress);
    return () => window.removeEventListener("keydown", handleKeyPress);
  }, []);
  useEffect(() => {
    if (!user) return;
    loadContents();

    // Set up realtime subscription for new content
    const channel = supabase.channel("ai-content-changes").on("postgres_changes", {
      event: "INSERT",
      schema: "public",
      table: "ai_generated_content",
      // Filter by user_id unless admin
      ...(isAdmin ? {} : {
        filter: `user_id=eq.${user.id}`
      })
    }, () => {
      // Reload contents when new content is inserted
      loadContents();
    }).subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, isAdmin]);
  useEffect(() => {
    filterContents();
  }, [contents, searchQuery, selectedCategory]);
  const loadContents = async () => {
    if (!user) return;
    const {
      data,
      error
    } = await supabase.from("ai_generated_content").select(`
        *,
        profiles:user_id (
          full_name
        )
      `).eq("user_id", user.id).order("created_at", {
      ascending: false
    });
    if (error) {
      console.error("Load error:", error);
    } else if (data) {
      setContents(data);
    }
  };
  const filterContents = () => {
    let filtered = [...contents];

    // Filter by category
    if (selectedCategory !== "all") {
      filtered = filtered.filter(c => (c.category || "uncategorized") === selectedCategory);
    }

    // Filter by search query
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(c => c.title.toLowerCase().includes(query) || c.topic?.toLowerCase().includes(query) || c.content.toLowerCase().includes(query) || c.category?.toLowerCase().includes(query));
    }
    setFilteredContents(filtered);
  };

  // Get unique categories
  const categories = Array.from(new Set(contents.map(c => c.category || "uncategorized")));
  const handleDelete = async () => {
    if (!contentToDelete) return;
    const {
      error
    } = await supabase.from("ai_generated_content").delete().eq("id", contentToDelete);
    if (error) {
      toast.error("Failed to delete content");
    } else {
      toast.success("Content deleted successfully");
      loadContents();
    }
    setDeleteDialogOpen(false);
    setContentToDelete(null);
  };
  const handleEdit = (content: ContentRow) => {
    setEditingContent(content);
  };
  const handleSaveComplete = () => {
    setEditingContent(null);
    loadContents();
  };
  const handleBulkExport = async () => {
    try {
      let contentsToExport = [...contents];
      if (exportCount === "10") {
        contentsToExport = contentsToExport.slice(0, 10);
      } else if (exportCount === "50") {
        contentsToExport = contentsToExport.slice(0, 50);
      } else if (exportCount === "100") {
        contentsToExport = contentsToExport.slice(0, 100);
      } else if (exportCount === "custom" && customCount) {
        const count = parseInt(customCount);
        if (!isNaN(count) && count > 0) {
          contentsToExport = contentsToExport.slice(0, count);
        }
      }
      if (contentsToExport.length === 0) {
        toast.error("No content to export");
        return;
      }
      const filename = `content-library-${formatLocalDate()}`;
      if (exportFormat === "csv") {
        exportAsCSV(contentsToExport, filename);
      } else if (exportFormat === "md") {
        exportAsCombinedMarkdown(contentsToExport, filename);
      } else if (exportFormat === "docx") {
        await exportAsCombinedWord(contentsToExport, filename);
      }
      toast.success(`Exported ${contentsToExport.length} content items as ${exportFormat.toUpperCase()}`);
    } catch (error) {
      console.error("Export error:", error);
      toast.error("Failed to export content");
    }
  };
  const tableColumns = columns(content => setViewingContent(content), content => handleEdit(content), id => {
    setContentToDelete(id);
    setDeleteDialogOpen(true);
  }, onLoadTemplate, isAdmin);
  return <div className="space-y-4 w-full max-w-full">
      {/* Analytics Overview - Compact Glassmorphic */}
      <div className="bg-card/30 backdrop-blur-sm rounded-2xl border border-border/20 p-3 sm:p-4 overflow-hidden w-full">
        <div className="flex items-center justify-between gap-3 mb-3">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-primary/10 flex-shrink-0">
              <BarChart3 className="h-3.5 w-3.5 text-primary" />
            </div>
            <span className="text-xs font-medium text-foreground/80">Content Analytics</span>
          </div>
          <Button onClick={() => setAnalyticsDialogOpen(true)} variant="ghost" size="sm" className="gap-1.5 text-xs h-7 px-2 text-muted-foreground hover:text-foreground">
            <BarChart3 className="h-3 w-3" />
            <span className="hidden sm:inline">Full Analytics</span>
          </Button>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div>
            <p className="text-[10px] text-muted-foreground/60">Total</p>
            <p className="text-lg font-bold text-primary">{contents.length}</p>
          </div>
          <div>
            <p className="text-[10px] text-muted-foreground/60">Categories</p>
            <p className="text-lg font-bold text-primary">{categories.length}</p>
          </div>
          <div>
            <p className="text-[10px] text-muted-foreground/60">Avg SEO</p>
            <p className="text-lg font-bold text-primary">
              {contents.length > 0 ? Math.round(contents.reduce((acc, c) => {
              const metrics = calculateContentMetrics(c.content, c.title);
              return acc + metrics.seoScore;
            }, 0) / contents.length) : 0}
            </p>
          </div>
          <div>
            <p className="text-[10px] text-muted-foreground/60">Today</p>
            <p className="text-lg font-bold text-primary">
              {contents.filter(c => {
              const date = new Date(c.created_at || "");
              const dayAgo = new Date();
              dayAgo.setDate(dayAgo.getDate() - 1);
              return date > dayAgo;
            }).length}
            </p>
          </div>
        </div>
      </div>

      {/* Analytics Dialog */}
      <Dialog open={analyticsDialogOpen} onOpenChange={setAnalyticsDialogOpen}>
        <DialogContent className="w-[95vw] max-w-[95vw] sm:max-w-4xl lg:max-w-7xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-sm sm:text-base">
              <BarChart3 className="h-4 w-4 sm:h-5 sm:w-5" />
              Content Analytics Dashboard
              <span className="text-[10px] sm:text-xs text-muted-foreground font-normal ml-2 hidden sm:inline">
                (Ctrl/Cmd+K)
              </span>
            </DialogTitle>
          </DialogHeader>
          <ContentAnalyticsDashboard contents={contents} />
        </DialogContent>
      </Dialog>

      <div className="bg-card/10 backdrop-blur-sm rounded-2xl border border-border/20 overflow-hidden min-w-0 w-full max-w-full">
        <div className="px-3 py-2.5 sm:px-4 sm:py-3 border-b border-border/20">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-medium text-foreground/80">My Content</h3>
              <p className="text-[10px] text-muted-foreground/60 mt-0.5 hidden sm:block">Auto-indexed in knowledge base</p>
            </div>
            <div className="flex gap-1.5">
              <Button onClick={() => setBulkImportOpen(true)} variant="ghost" size="sm" className="gap-1 text-xs h-7 px-2">
                <Upload className="h-3 w-3" />
                <span className="hidden sm:inline">Import</span>
              </Button>
              <Button onClick={() => setIsAddingContent(true)} size="sm" className="gap-1 text-xs h-7 px-2 bg-primary/15 text-primary hover:bg-primary/25">
                <Plus className="h-3 w-3" />
                <span className="hidden sm:inline">Add</span>
              </Button>
            </div>
          </div>
        </div>
        
        <div className="p-3 sm:p-4">
          {/* Pill-style Filters */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 mb-3">
            <Select value={selectedCategory} onValueChange={setSelectedCategory}>
              <SelectTrigger className="w-full sm:w-[160px] h-8 text-xs rounded-xl bg-card/40 border-border/30">
                <SelectValue placeholder="All Categories" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Categories</SelectItem>
                {categories.map(cat => (
                  <SelectItem key={cat} value={cat} className="capitalize">
                    {cat}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input 
              placeholder="Search content..." 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full sm:flex-1 h-8 text-xs rounded-xl bg-card/40 border-border/30"
            />
          </div>

          {/* Mobile: Card View */}
          <div className="md:hidden">
            <div className="grid grid-cols-1 gap-3">
              {paginatedContents.map((content) => (
                <MobileContentCard
                  key={content.id}
                  content={content}
                  onView={() => setViewingContent(content)}
                  onEdit={() => handleEdit(content)}
                  onDelete={() => {
                    setContentToDelete(content.id);
                    setDeleteDialogOpen(true);
                  }}
                />
              ))}
              {paginatedContents.length === 0 && (
                <div className="text-center py-8 text-muted-foreground text-sm">
                  No content found
                </div>
              )}
            </div>
            
            {/* Mobile Pagination */}
            {totalPages > 1 && (
              <div className="mt-4">
                <Pagination>
                  <PaginationContent className="flex-wrap justify-center gap-1">
                    <PaginationItem>
                      <PaginationPrevious 
                        onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                        className={currentPage === 1 ? "pointer-events-none opacity-50" : "cursor-pointer"}
                      />
                    </PaginationItem>
                    {getPageNumbers().map((page, idx) => (
                      <PaginationItem key={idx}>
                        {page === 'ellipsis' ? (
                          <PaginationEllipsis />
                        ) : (
                          <PaginationLink 
                            onClick={() => setCurrentPage(page)}
                            isActive={currentPage === page}
                            className="cursor-pointer"
                          >
                            {page}
                          </PaginationLink>
                        )}
                      </PaginationItem>
                    ))}
                    <PaginationItem>
                      <PaginationNext 
                        onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                        className={currentPage === totalPages ? "pointer-events-none opacity-50" : "cursor-pointer"}
                      />
                    </PaginationItem>
                  </PaginationContent>
                </Pagination>
                <p className="text-center text-xs text-muted-foreground mt-2">
                  Showing {((currentPage - 1) * itemsPerPage) + 1}-{Math.min(currentPage * itemsPerPage, filteredContents.length)} of {filteredContents.length}
                </p>
              </div>
            )}
          </div>

          {/* Desktop: DataTable View */}
          <div className="hidden md:block w-full overflow-x-auto">
            <DataTable 
              columns={tableColumns} 
              data={paginatedContents} 
              searchKey="title"
            />
            
            {/* Desktop Pagination */}
            {totalPages > 1 && (
              <div className="mt-4">
                <Pagination>
                  <PaginationContent>
                    <PaginationItem>
                      <PaginationPrevious 
                        onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                        className={currentPage === 1 ? "pointer-events-none opacity-50" : "cursor-pointer"}
                      />
                    </PaginationItem>
                    {getPageNumbers().map((page, idx) => (
                      <PaginationItem key={idx}>
                        {page === 'ellipsis' ? (
                          <PaginationEllipsis />
                        ) : (
                          <PaginationLink 
                            onClick={() => setCurrentPage(page)}
                            isActive={currentPage === page}
                            className="cursor-pointer"
                          >
                            {page}
                          </PaginationLink>
                        )}
                      </PaginationItem>
                    ))}
                    <PaginationItem>
                      <PaginationNext 
                        onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                        className={currentPage === totalPages ? "pointer-events-none opacity-50" : "cursor-pointer"}
                      />
                    </PaginationItem>
                  </PaginationContent>
                </Pagination>
                <p className="text-center text-xs text-muted-foreground mt-2">
                  Showing {((currentPage - 1) * itemsPerPage) + 1}-{Math.min(currentPage * itemsPerPage, filteredContents.length)} of {filteredContents.length}
                </p>
              </div>
            )}
          </div>

          {/* Export Section */}
          <div className="mt-3 pt-3 border-t border-border/20 flex flex-col sm:flex-row items-start sm:items-center gap-2">
            <span className="text-[10px] text-muted-foreground/60 whitespace-nowrap">Export:</span>
            <div className="flex flex-wrap gap-1.5 w-full sm:w-auto">
              <Select value={exportCount} onValueChange={setExportCount}>
                <SelectTrigger className="w-20 h-7 text-[10px] rounded-lg bg-card/40 border-border/30">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="10">10</SelectItem>
                  <SelectItem value="50">50</SelectItem>
                  <SelectItem value="100">100</SelectItem>
                  <SelectItem value="custom">Custom</SelectItem>
                </SelectContent>
              </Select>
              {exportCount === "custom" && (
                <Input 
                  type="number" 
                  placeholder="#" 
                  value={customCount}
                  onChange={(e) => setCustomCount(e.target.value)}
                  className="w-16 h-7 text-[10px] rounded-lg bg-card/40 border-border/30"
                />
              )}
              <Select value={exportFormat} onValueChange={setExportFormat}>
                <SelectTrigger className="w-20 h-7 text-[10px] rounded-lg bg-card/40 border-border/30">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="csv">CSV</SelectItem>
                  <SelectItem value="md">Markdown</SelectItem>
                  <SelectItem value="docx">Word</SelectItem>
                </SelectContent>
              </Select>
              <Button size="sm" onClick={handleBulkExport} className="gap-1 h-7 text-[10px] px-2 rounded-lg">
                <Download className="h-3 w-3" />
                Export
              </Button>
            </div>
          </div>
        </div>
      </div>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent className="w-[95vw] max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-base sm:text-lg">Delete Content</AlertDialogTitle>
            <AlertDialogDescription className="text-xs sm:text-sm">
              Are you sure you want to delete this content? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2 sm:gap-0">
            <AlertDialogCancel className="text-xs sm:text-sm h-9">Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="text-xs sm:text-sm h-9">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {editingContent && <ContentEditorDialog content={editingContent} open={!!editingContent} onClose={() => setEditingContent(null)} onSave={handleSaveComplete} />}

      {viewingContent && <ContentViewDialog content={viewingContent} open={!!viewingContent} onClose={() => setViewingContent(null)} />}

      {isAddingContent && <ContentEditorDialog content={null} open={isAddingContent} onClose={() => setIsAddingContent(false)} onSave={handleSaveComplete} />}

      <BulkContentImport open={bulkImportOpen} onClose={() => setBulkImportOpen(false)} onComplete={loadContents} />
    </div>;
};