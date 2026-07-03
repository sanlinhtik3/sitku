import { memo } from "react";
import { Zap, Database } from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface SearchMetadata {
  forceWebSearch?: boolean;
  webSearchUsed?: boolean;
  confidence?: number;
  sourceType?: string;
}

interface SearchStatusIndicatorProps {
  searchStatus: string;
  searchMetadata: SearchMetadata | null;
  selectedKnowledgeBase: any[];
  loading: boolean;
}

export const SearchStatusIndicator = memo(({ 
  searchStatus, 
  searchMetadata, 
  selectedKnowledgeBase,
  loading 
}: SearchStatusIndicatorProps) => {
  if (!searchStatus && (selectedKnowledgeBase.length === 0 || loading)) {
    return null;
  }

  // Real-time Search Status with Smart Routing
  if (searchStatus) {
    const isForceWeb = searchMetadata?.forceWebSearch;
    const isWebUsed = searchMetadata?.webSearchUsed;
    
    const colorClasses = isForceWeb 
      ? 'from-amber-500/10 via-amber-500/5 border-amber-500/20'
      : isWebUsed 
        ? 'from-cyan-500/10 via-cyan-500/5 border-cyan-500/20'
        : 'from-green-500/10 via-green-500/5 border-green-500/20';
    
    const iconColor = isForceWeb 
      ? 'text-amber-500' 
      : isWebUsed 
        ? 'text-cyan-500' 
        : 'text-green-500';

    const modeLabel = isForceWeb 
      ? "⚡ Time-Sensitive → Live Web" 
      : isWebUsed 
        ? "🌐 Hybrid Mode" 
        : "📚 Knowledge Base Mode";

    return (
      <div 
        className={`flex items-start gap-2 p-3 rounded-lg border bg-gradient-to-r ${colorClasses} to-transparent`}
        role="status"
        aria-live="polite"
      >
        <div className="relative flex-shrink-0 mt-0.5">
          <Zap className={`h-4 w-4 ${iconColor}`} aria-hidden="true" />
          <span className={`absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full animate-pulse ${isForceWeb ? 'bg-amber-500' : isWebUsed ? 'bg-cyan-500' : 'bg-green-500'}`} />
        </div>
        <div className="flex-1 min-w-0">
          <p className={`text-xs font-semibold mb-0.5 ${iconColor}`}>
            {modeLabel}
          </p>
          <p className="text-[10px] text-muted-foreground line-clamp-1">
            {searchStatus}
          </p>
        </div>
      </div>
    );
  }

  // Advanced Knowledge Base Indicator (only show when not loading)
  if (selectedKnowledgeBase.length > 0 && !loading) {
    const avgQuality = Math.round(
      selectedKnowledgeBase.reduce((sum: number, item: any) => sum + (item.quality_score || 0), 0) / 
      selectedKnowledgeBase.length
    );

    return (
      <div 
        className="flex items-start gap-2 p-3 rounded-lg bg-gradient-to-r from-primary/10 via-primary/5 to-transparent border border-primary/20"
        role="status"
        aria-label="Knowledge base search results"
      >
        <Database className="h-4 w-4 text-primary flex-shrink-0 mt-0.5" aria-hidden="true" />
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold text-foreground mb-0.5">
            {searchMetadata?.sourceType === 'hybrid' ? '🔀 Hybrid Complete' : '📚 KB Used'}
          </p>
          <p className="text-[10px] text-muted-foreground leading-relaxed line-clamp-2">
            {searchMetadata?.webSearchUsed 
              ? `Combined ${selectedKnowledgeBase.length} internal + web data`
              : `Analyzed ${selectedKnowledgeBase.length} content examples`
            }
          </p>
          <div className="flex gap-1.5 mt-2 flex-wrap">
            <Badge variant="secondary" className="text-[10px] px-1.5 py-0.5">
              {searchMetadata?.confidence || 0}%
            </Badge>
            <Badge variant="secondary" className="text-[10px] px-1.5 py-0.5">
              Q: {avgQuality}
            </Badge>
            {searchMetadata?.webSearchUsed && (
              <Badge variant="secondary" className="text-[10px] px-1.5 py-0.5 bg-cyan-500/10 text-cyan-500">
                Web+
              </Badge>
            )}
          </div>
        </div>
      </div>
    );
  }

  return null;
});

SearchStatusIndicator.displayName = "SearchStatusIndicator";
