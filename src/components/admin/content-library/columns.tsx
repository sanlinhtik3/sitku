import { ColumnDef } from "@tanstack/react-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Star, Eye, Edit, Trash2, User } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { calculateContentMetrics } from "@/lib/contentMetrics";

export interface ContentRow {
  id: string;
  title: string;
  content: string;
  topic?: string;
  tone?: string;
  style?: string;
  language?: string;
  category?: string;
  is_template?: boolean;
  tags?: string[];
  created_at: string;
  updated_at?: string;
  user_id: string;
  usage_count: number;
  quality_score: number;
  last_used_at?: string;
  relevance_score?: number;
  metadata?: any;
  profiles?: {
    full_name: string | null;
  };
}

export const columns = (
  onView: (content: ContentRow) => void,
  onEdit: (content: ContentRow) => void,
  onDelete: (id: string) => void,
  onUseTemplate?: (id: string) => void,
  isAdmin: boolean = false
): ColumnDef<ContentRow>[] => {
  const baseColumns: ColumnDef<ContentRow>[] = [
    {
      id: "template",
      header: "",
      cell: ({ row }) => {
        if (row.original.is_template) {
          return <Star className="h-4 w-4 text-amber-500 fill-amber-500" />;
        }
        return null;
      },
    },
    {
      accessorKey: "title",
      header: "Title",
      cell: ({ row }) => {
        const prompt = row.original.metadata?.prompt;
        return (
          <div className="flex flex-col gap-1 min-w-0">
            <span className="font-medium text-foreground leading-tight line-clamp-2">
              {row.original.title}
            </span>
            {row.original.topic && (
              <span className="text-xs text-primary/80 font-medium">
                {row.original.topic}
              </span>
            )}
            {prompt && (
              <span className="text-xs text-muted-foreground line-clamp-1 italic">
                {prompt.substring(0, 60)}...
              </span>
            )}
          </div>
        );
      },
    },
    {
      id: "metrics",
      header: "Metrics",
      cell: ({ row }) => {
        const metrics = calculateContentMetrics(row.original.content, row.original.title);
        return (
          <div className="flex items-center gap-3 text-sm">
            <div className="flex flex-col">
              <span className="font-semibold text-foreground">{metrics.wordCount}</span>
              <span className="text-xs text-muted-foreground">words</span>
            </div>
            <div className="flex flex-col">
              <span className="font-semibold text-foreground">{metrics.readingTime}</span>
              <span className="text-xs text-muted-foreground">min</span>
            </div>
          </div>
        );
      },
    },
    {
      id: "seo",
      header: "SEO",
      cell: ({ row }) => {
        const metrics = calculateContentMetrics(row.original.content, row.original.title);
        const score = metrics.seoScore;
        const color = score >= 80 
          ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/30" 
          : score >= 60 
          ? "bg-amber-500/20 text-amber-400 border-amber-500/30" 
          : "bg-red-500/20 text-red-400 border-red-500/30";
        
        return (
          <Badge variant="outline" className={`${color} font-semibold`}>
            {score}%
          </Badge>
        );
      },
    },
    {
      id: "attributes",
      header: "Style",
      cell: ({ row }) => {
        return (
          <div className="flex flex-wrap gap-1.5">
            {row.original.tone && (
              <Badge variant="secondary" className="text-xs capitalize">
                {row.original.tone}
              </Badge>
            )}
            {row.original.style && (
              <Badge variant="outline" className="text-xs capitalize">
                {row.original.style}
              </Badge>
            )}
          </div>
        );
      },
    },
    {
      id: "creator",
      header: "Creator",
      cell: ({ row }) => {
        const userName = row.original.profiles?.full_name || 'Unknown';
        return (
          <div className="flex items-center gap-2">
            <div className="h-7 w-7 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0">
              <User className="h-3.5 w-3.5 text-primary" />
            </div>
            <span className="text-sm font-medium truncate">
              {userName}
            </span>
          </div>
        );
      },
    },
    {
      accessorKey: "category",
      header: "Category",
      cell: ({ row }) => {
        const category = row.getValue("category") as string;
        return category ? (
          <Badge className="bg-primary/10 text-primary border-primary/20 capitalize">
            {category}
          </Badge>
        ) : (
          <Badge variant="outline" className="text-muted-foreground">
            Uncategorized
          </Badge>
        );
      },
    },
    {
      accessorKey: "quality_score",
      header: "Quality",
      cell: ({ row }) => {
        const score = row.getValue("quality_score") as number || 50;
        const color = score >= 70 
          ? "bg-emerald-500/20 text-emerald-400" 
          : score >= 50 
          ? "bg-blue-500/20 text-blue-400" 
          : "bg-amber-500/20 text-amber-400";
        return (
          <div className="flex items-center gap-2">
            <div className={`h-2 w-2 rounded-full ${score >= 70 ? 'bg-emerald-500' : score >= 50 ? 'bg-blue-500' : 'bg-amber-500'}`} />
            <span className={`font-semibold ${color} px-2 py-0.5 rounded text-sm`}>
              {score}
            </span>
          </div>
        );
      },
    },
    {
      accessorKey: "created_at",
      header: "Created",
      cell: ({ row }) => {
        return (
          <span className="text-sm text-muted-foreground whitespace-nowrap">
            {formatDistanceToNow(new Date(row.original.created_at), { addSuffix: true })}
          </span>
        );
      },
    },
    {
      id: "actions",
      header: "Actions",
      cell: ({ row }) => {
        return (
          <div className="flex items-center gap-1">
            {onUseTemplate && row.original.is_template && (
              <Button
                size="sm"
                variant="secondary"
                onClick={() => onUseTemplate(row.original.id)}
                className="h-8 px-3 text-xs font-medium"
              >
                Use
              </Button>
            )}
            <Button
              size="sm"
              variant="ghost"
              onClick={() => onView(row.original)}
              className="h-8 w-8 p-0 hover:bg-primary/10 hover:text-primary"
              title="View"
            >
              <Eye className="h-4 w-4" />
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => onEdit(row.original)}
              className="h-8 w-8 p-0 hover:bg-blue-500/10 hover:text-blue-500"
              title="Edit"
            >
              <Edit className="h-4 w-4" />
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => onDelete(row.original.id)}
              className="h-8 w-8 p-0 hover:bg-red-500/10 hover:text-red-500"
              title="Delete"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        );
      },
    },
  ];

  // Add usage column only for admins
  if (isAdmin) {
    const usageColumn: ColumnDef<ContentRow> = {
      accessorKey: "usage_count",
      header: "Usage",
      cell: ({ row }) => {
        const count = row.getValue("usage_count") as number || 0;
        return (
          <div className="flex items-center gap-1">
            <Eye className="h-2.5 w-2.5 text-muted-foreground" />
            <span className="text-[10px]">{count}</span>
          </div>
        );
      },
    };
    // Insert usage column before quality_score column
    const qualityIndex = baseColumns.findIndex(col => 
      'accessorKey' in col && col.accessorKey === "quality_score"
    );
    baseColumns.splice(qualityIndex, 0, usageColumn);
  }

  return baseColumns;
};
