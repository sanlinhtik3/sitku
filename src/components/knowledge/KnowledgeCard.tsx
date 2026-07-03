import { useState } from "react";
import { GlassmorphicCard } from "@/components/ui/FuturisticElements";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Link2, FileText, Bot, PenLine, Trash2, RefreshCw, ExternalLink, ChevronDown, ChevronUp, CheckCircle2, Clock, AlertCircle } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

interface KnowledgeCardProps {
  item: {
    id: string;
    title: string;
    content: string;
    category?: string;
    tags?: string[];
    source_type?: string;
    embedding_status?: string;
    created_at: string;
    metadata?: any;
  };
  viewMode: "grid" | "list";
  similarity?: number;
  onDelete: (id: string) => void;
  onResync: (id: string) => void;
}

const SOURCE_ICONS: Record<string, any> = {
  url_ingest: Link2,
  text_digest: FileText,
  ai_generated: Bot,
  manual: PenLine,
};

const EMBED_STATUS = {
  synced: { icon: CheckCircle2, color: "text-emerald-400", label: "Synced" },
  pending: { icon: Clock, color: "text-amber-400", label: "Pending" },
  failed: { icon: AlertCircle, color: "text-destructive", label: "Failed" },
};

export const KnowledgeCard = ({ item, viewMode, similarity, onDelete, onResync }: KnowledgeCardProps) => {
  const [expanded, setExpanded] = useState(false);
  const SourceIcon = SOURCE_ICONS[item.source_type || ""] || FileText;
  const embedInfo = EMBED_STATUS[item.embedding_status as keyof typeof EMBED_STATUS] || EMBED_STATUS.pending;
  const EmbedIcon = embedInfo.icon;
  const sourceUrl = item.metadata?.source_url;

  // Extract summary from content (first section)
  const summary = item.content
    ?.replace(/^## Summary\n/, "")
    ?.split("\n## ")[0]
    ?.slice(0, 300) || item.content?.slice(0, 300) || "";

  if (viewMode === "list") {
    return (
      <GlassmorphicCard className="p-3 flex items-center gap-3">
        <div className="h-8 w-8 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
          <SourceIcon className="h-4 w-4 text-primary/70" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-medium text-foreground truncate">{item.title}</h3>
          <div className="flex items-center gap-2 mt-0.5">
            <span className="text-[10px] text-muted-foreground">
              {formatDistanceToNow(new Date(item.created_at), { addSuffix: true })}
            </span>
            {similarity != null && (
              <Badge variant="outline" className="text-[9px] px-1.5 py-0 h-4 border-primary/20 text-primary">
                {Math.round(similarity * 100)}% match
              </Badge>
            )}
            <EmbedIcon className={`h-3 w-3 ${embedInfo.color}`} />
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {sourceUrl && (
            <a href={sourceUrl} target="_blank" rel="noopener noreferrer" className="p-1.5 rounded-lg hover:bg-white/[0.05] transition-colors">
              <ExternalLink className="h-3.5 w-3.5 text-muted-foreground/50" />
            </a>
          )}
          {item.embedding_status === "failed" && (
            <button onClick={() => onResync(item.id)} className="p-1.5 rounded-lg hover:bg-white/[0.05] transition-colors">
              <RefreshCw className="h-3.5 w-3.5 text-amber-400" />
            </button>
          )}
          <button onClick={() => onDelete(item.id)} className="p-1.5 rounded-lg hover:bg-destructive/10 transition-colors">
            <Trash2 className="h-3.5 w-3.5 text-muted-foreground/40 hover:text-destructive" />
          </button>
        </div>
      </GlassmorphicCard>
    );
  }

  return (
    <GlassmorphicCard className="flex flex-col">
      <div className="p-4 flex-1 space-y-2.5">
        {/* Header */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <div className="h-7 w-7 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
              <SourceIcon className="h-3.5 w-3.5 text-primary/70" />
            </div>
            <h3 className="text-sm font-medium text-foreground line-clamp-1">{item.title}</h3>
          </div>
          <EmbedIcon className={`h-3.5 w-3.5 ${embedInfo.color} shrink-0 mt-1`} />
        </div>

        {/* Similarity badge */}
        {similarity != null && (
          <Badge variant="outline" className="text-[9px] px-1.5 py-0 h-4 border-primary/20 text-primary">
            {Math.round(similarity * 100)}% semantic match
          </Badge>
        )}

        {/* Summary */}
        <p className={`text-xs text-muted-foreground/70 leading-relaxed ${expanded ? "" : "line-clamp-3"}`}>
          {summary}
        </p>

        {summary.length > 150 && (
          <button
            onClick={() => setExpanded(!expanded)}
            className="flex items-center gap-1 text-[10px] text-primary/60 hover:text-primary transition-colors"
          >
            {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            {expanded ? "Less" : "More"}
          </button>
        )}

        {/* Tags */}
        {item.tags && item.tags.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {item.tags.map((tag) => (
              <span
                key={tag}
                className="text-[9px] px-1.5 py-0.5 rounded-md bg-primary/[0.08] text-primary/70 font-medium"
              >
                {tag}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="px-4 py-2.5 border-t border-white/[0.04] flex items-center justify-between">
        <span className="text-[10px] text-muted-foreground/50">
          {formatDistanceToNow(new Date(item.created_at), { addSuffix: true })}
        </span>
        <div className="flex items-center gap-1">
          {sourceUrl && (
            <a href={sourceUrl} target="_blank" rel="noopener noreferrer" className="p-1 rounded-md hover:bg-white/[0.05] transition-colors">
              <ExternalLink className="h-3 w-3 text-muted-foreground/40" />
            </a>
          )}
          {item.embedding_status === "failed" && (
            <button onClick={() => onResync(item.id)} className="p-1 rounded-md hover:bg-white/[0.05] transition-colors">
              <RefreshCw className="h-3 w-3 text-amber-400" />
            </button>
          )}
          <button onClick={() => onDelete(item.id)} className="p-1 rounded-md hover:bg-destructive/10 transition-colors">
            <Trash2 className="h-3 w-3 text-muted-foreground/30 hover:text-destructive" />
          </button>
        </div>
      </div>
    </GlassmorphicCard>
  );
};
