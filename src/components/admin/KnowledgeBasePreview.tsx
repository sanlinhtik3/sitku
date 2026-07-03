import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Sparkles, TrendingUp, Calendar, Tag } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

interface ContentItem {
  id: string;
  title: string;
  category: string | null;
  tags: string[] | null;
  usage_count: number;
  quality_score: number;
  created_at: string;
  relevance_score?: number;
}

interface KnowledgeBasePreviewProps {
  selectedContent: ContentItem[];
  totalAvailable: number;
}

export const KnowledgeBasePreview = ({ selectedContent, totalAvailable }: KnowledgeBasePreviewProps) => {
  const getRelevanceColor = (score: number = 0) => {
    if (score >= 80) return "bg-green-500";
    if (score >= 60) return "bg-blue-500";
    if (score >= 40) return "bg-yellow-500";
    return "bg-gray-500";
  };

  const getRelevanceLabel = (score: number = 0) => {
    if (score >= 80) return "High";
    if (score >= 60) return "Good";
    if (score >= 40) return "Medium";
    return "Low";
  };

  return (
    <Card className="border-primary/20">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            <div>
              <CardTitle className="text-lg">Knowledge Base Preview</CardTitle>
              <CardDescription>
                {selectedContent.length} of {totalAvailable} examples selected for learning
              </CardDescription>
            </div>
          </div>
          <Badge variant="secondary" className="text-xs">
            Active
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-[400px] pr-4">
          {selectedContent.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Sparkles className="h-12 w-12 mx-auto mb-2 opacity-50" />
              <p className="text-sm">No content selected yet</p>
              <p className="text-xs mt-1">Generate content to see knowledge base in action</p>
            </div>
          ) : (
            <div className="space-y-3">
              {selectedContent.map((item, index) => (
                <div
                  key={item.id}
                  className="p-3 rounded-lg border bg-card hover:bg-accent/50 transition-colors"
                >
                  <div className="flex items-start gap-3">
                    <div className="flex-shrink-0 mt-1">
                      <div className="text-xs font-mono text-muted-foreground">#{index + 1}</div>
                    </div>
                    
                    <div className="flex-1 min-w-0 space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <h4 className="text-sm font-medium line-clamp-1">{item.title}</h4>
                        {item.relevance_score !== undefined && (
                          <Badge 
                            variant="outline" 
                            className={`${getRelevanceColor(item.relevance_score)} text-white text-xs flex-shrink-0`}
                          >
                            {item.relevance_score}% {getRelevanceLabel(item.relevance_score)}
                          </Badge>
                        )}
                      </div>

                      <div className="flex flex-wrap gap-2 text-xs">
                        {item.category && (
                          <Badge variant="secondary" className="text-xs capitalize">
                            <Tag className="h-3 w-3 mr-1" />
                            {item.category}
                          </Badge>
                        )}
                        
                        <Badge variant="outline" className="text-xs">
                          <TrendingUp className="h-3 w-3 mr-1" />
                          Quality: {item.quality_score}
                        </Badge>

                        <Badge variant="outline" className="text-xs">
                          Used {item.usage_count}x
                        </Badge>

                        <Badge variant="outline" className="text-xs">
                          <Calendar className="h-3 w-3 mr-1" />
                          {formatDistanceToNow(new Date(item.created_at), { addSuffix: true })}
                        </Badge>
                      </div>

                      {item.tags && item.tags.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {item.tags.slice(0, 3).map((tag, idx) => (
                            <span key={idx} className="text-xs px-2 py-0.5 bg-muted rounded text-muted-foreground">
                              #{tag}
                            </span>
                          ))}
                          {item.tags.length > 3 && (
                            <span className="text-xs px-2 py-0.5 text-muted-foreground">
                              +{item.tags.length - 3} more
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </CardContent>
    </Card>
  );
};
