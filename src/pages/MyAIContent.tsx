import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Navbar } from "@/components/Navbar";
import { CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Sparkles, Search, Eye, Download, Trash2, FileText, PenTool } from "lucide-react";
import { MarkdownContent } from "@/components/lesson/MarkdownContent";
import { toast } from "sonner";
import { format } from "date-fns";
import { FuturisticBackground } from "@/components/ui/FuturisticBackground";
import { PageHeader, GlassmorphicCard } from "@/components/ui/FuturisticElements";

interface AIContent {
  id: string;
  title: string;
  content: string;
  tone: string | null;
  style: string | null;
  language: string | null;
  category: string | null;
  tags: string[] | null;
  usage_count: number | null;
  quality_score: number | null;
  created_at: string;
}

export default function MyAIContent() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedContent, setSelectedContent] = useState<AIContent | null>(null);
  const [isViewDialogOpen, setIsViewDialogOpen] = useState(false);

  const { data: contents, isLoading } = useQuery({
    queryKey: ["user-ai-content", user?.id, searchQuery],
    queryFn: async () => {
      if (!user) return [];

      let query = supabase
        .from("ai_generated_content")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });

      if (searchQuery) {
        query = query.or(`title.ilike.%${searchQuery}%,content.ilike.%${searchQuery}%`);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data as AIContent[];
    },
    enabled: !!user,
  });

  const deleteMutation = useMutation({
    mutationFn: async (contentId: string) => {
      const { error } = await supabase
        .from("ai_generated_content")
        .delete()
        .eq("id", contentId)
        .eq("user_id", user?.id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["user-ai-content"] });
      toast.success("Content deleted successfully");
    },
    onError: () => {
      toast.error("Failed to delete content");
    },
  });

  const handleView = (content: AIContent) => {
    setSelectedContent(content);
    setIsViewDialogOpen(true);
  };

  const handleDownload = (content: AIContent) => {
    const blob = new Blob([content.content], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${content.title.replace(/\s+/g, "-").toLowerCase()}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success("Content downloaded");
  };

  const handleDelete = (contentId: string) => {
    if (confirm("Are you sure you want to delete this content?")) {
      deleteMutation.mutate(contentId);
    }
  };

  return (
    <FuturisticBackground>
      <div className="min-h-screen pb-20 lg:pb-8">
        <Navbar />
        <div className="container mx-auto px-4 py-[80px]">
          <div className="max-w-7xl mx-auto space-y-6">
            <PageHeader
              icon={Sparkles}
              title="My AI Content"
              subtitle="View and manage all your AI-generated content"
            />

            <GlassmorphicCard>
              <CardHeader className="p-4 sm:p-6">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 sm:gap-4">
                  <div>
                    <CardTitle className="text-base sm:text-lg bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text text-transparent">
                      Generated Content Library
                    </CardTitle>
                    <CardDescription className="text-xs sm:text-sm">
                      {contents?.length || 0} pieces of content generated
                    </CardDescription>
                  </div>
                  <div className="relative w-full sm:w-64">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Search content..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="pl-10 bg-background/50 backdrop-blur-sm border-primary/20 focus:border-primary/40"
                    />
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <div className="flex items-center justify-center gap-2">
                      <div className="flex gap-1">
                        <span className="w-2 h-2 bg-primary rounded-full animate-[pulse_1.4s_ease-in-out_infinite]" />
                        <span className="w-2 h-2 bg-primary rounded-full animate-[pulse_1.4s_ease-in-out_0.2s_infinite]" />
                        <span className="w-2 h-2 bg-primary rounded-full animate-[pulse_1.4s_ease-in-out_0.4s_infinite]" />
                      </div>
                      <span>Loading your content...</span>
                    </div>
                  </div>
                ) : contents && contents.length > 0 ? (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow className="border-white/[0.06] hover:bg-card/30">
                          <TableHead>Title</TableHead>
                          <TableHead>Type</TableHead>
                          <TableHead>Language</TableHead>
                          <TableHead>Created</TableHead>
                          <TableHead>Quality</TableHead>
                          <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {contents.map((content) => (
                          <TableRow 
                            key={content.id}
                            className="border-white/[0.06] hover:bg-card/30 transition-colors"
                          >
                            <TableCell className="font-medium">
                              <div className="flex items-center gap-2">
                                <FileText className="h-4 w-4 text-primary/60" />
                                <span className="truncate max-w-[200px]">{content.title}</span>
                              </div>
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline" className="border-white/[0.06] bg-primary/10 text-primary">
                                {content.style || "N/A"}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <Badge variant="secondary" className="bg-secondary/50">
                                {content.language || "N/A"}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-sm text-muted-foreground">
                              {format(new Date(content.created_at), "MMM dd, yyyy")}
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                <div className="h-2 w-16 bg-card/30 rounded-full overflow-hidden">
                                  <div
                                    className="h-full bg-gradient-to-r from-primary to-primary/70"
                                    style={{ width: `${content.quality_score || 0}%` }}
                                  />
                                </div>
                                <span className="text-sm text-muted-foreground">
                                  {content.quality_score || 0}
                                </span>
                              </div>
                            </TableCell>
                            <TableCell className="text-right">
                              <div className="flex items-center justify-end gap-1">
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => handleView(content)}
                                  className="hover:bg-primary/10 hover:text-primary"
                                >
                                  <Eye className="h-4 w-4" />
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => handleDownload(content)}
                                  className="hover:bg-primary/10 hover:text-primary"
                                >
                                  <Download className="h-4 w-4" />
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => handleDelete(content.id)}
                                  disabled={deleteMutation.isPending}
                                  className="hover:bg-destructive/10 hover:text-destructive"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                ) : (
                  <div className="text-center py-12">
                    <div className="w-20 h-20 mx-auto mb-4 rounded-full bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center">
                      <Sparkles className="h-10 w-10 text-primary/60" />
                    </div>
                    <p className="text-muted-foreground mb-4">
                      No content generated yet. Start creating with AI Content Writer!
                    </p>
                    <Button 
                      className="bg-gradient-to-r from-primary to-primary/80 hover:from-primary/90 hover:to-primary/70 shadow-lg shadow-primary/20"
                      onClick={() => window.location.href = '/ai-content'}
                    >
                      <PenTool className="mr-2 h-4 w-4" />
                      Start Generating
                    </Button>
                  </div>
                )}
              </CardContent>
            </GlassmorphicCard>
          </div>
        </div>

        <Dialog open={isViewDialogOpen} onOpenChange={setIsViewDialogOpen}>
          <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto bg-card/20 backdrop-blur-xl border-white/[0.06] shadow-xl shadow-primary/10 rounded-2xl">
            <DialogHeader>
              <DialogTitle className="text-xl bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text text-transparent">
                {selectedContent?.title}
              </DialogTitle>
              <DialogDescription>
                <div className="flex items-center gap-2 mt-2 flex-wrap">
                    {selectedContent?.style && (
                      <Badge variant="outline" className="border-white/[0.06] bg-primary/10">{selectedContent.style}</Badge>
                  )}
                  {selectedContent?.language && (
                    <Badge variant="secondary" className="bg-secondary/50">{selectedContent.language}</Badge>
                  )}
                  {selectedContent?.tone && (
                    <Badge variant="outline" className="border-primary/30">{selectedContent.tone}</Badge>
                  )}
                  {selectedContent?.category && (
                    <Badge className="bg-primary/20 text-primary">{selectedContent.category}</Badge>
                  )}
                </div>
              </DialogDescription>
            </DialogHeader>
            <div className="prose prose-sm dark:prose-invert max-w-none">
              {selectedContent && <MarkdownContent content={selectedContent.content} />}
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </FuturisticBackground>
  );
}
