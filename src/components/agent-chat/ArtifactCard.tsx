import { motion } from "motion/react";
import { 
  FileText, 
  Code2, 
  FileSpreadsheet, 
  BarChart3,
  ExternalLink,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Artifact } from "./ArtifactPanel";

interface ArtifactCardProps {
  artifact: Artifact;
  onClick: () => void;
  className?: string;
}

const TYPE_ICONS: Record<Artifact["type"], React.ElementType> = {
  code: Code2,
  document: FileText,
  report: BarChart3,
  table: FileSpreadsheet,
};

const TYPE_GRADIENTS: Record<Artifact["type"], string> = {
  code: "from-green-500/20 to-emerald-500/10",
  document: "from-blue-500/20 to-indigo-500/10",
  report: "from-purple-500/20 to-violet-500/10",
  table: "from-amber-500/20 to-orange-500/10",
};

const TYPE_BORDER_COLORS: Record<Artifact["type"], string> = {
  code: "border-green-500/30 hover:border-green-500/50",
  document: "border-blue-500/30 hover:border-blue-500/50",
  report: "border-purple-500/30 hover:border-purple-500/50",
  table: "border-amber-500/30 hover:border-amber-500/50",
};

const TYPE_ICON_COLORS: Record<Artifact["type"], string> = {
  code: "text-green-400",
  document: "text-blue-400",
  report: "text-purple-400",
  table: "text-amber-400",
};

export function ArtifactCard({ artifact, onClick, className }: ArtifactCardProps) {
  const Icon = TYPE_ICONS[artifact.type] || FileText;
  const gradient = TYPE_GRADIENTS[artifact.type] || TYPE_GRADIENTS.document;
  const borderColor = TYPE_BORDER_COLORS[artifact.type] || TYPE_BORDER_COLORS.document;
  const iconColor = TYPE_ICON_COLORS[artifact.type] || TYPE_ICON_COLORS.document;
  
  // Get preview text (first 100 chars, cleaned up)
  const preview = artifact.content
    .replace(/^#+\s*/gm, "") // Remove markdown headers
    .replace(/```[\s\S]*?```/g, "[code block]") // Replace code blocks
    .replace(/\n+/g, " ") // Replace newlines with spaces
    .trim()
    .slice(0, 100);

  return (
    <motion.button
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ scale: 1.01 }}
      whileTap={{ scale: 0.99 }}
      onClick={onClick}
      className={cn(
        "w-full text-left p-3 rounded-[var(--glass-radius-card)] transition-all duration-200",
        "bg-[hsl(var(--glass-bg))] backdrop-blur-[var(--glass-blur)]",
        "border",
        borderColor,
        "group cursor-pointer",
        "shadow-[var(--glass-shadow)] hover:shadow-[var(--glass-shadow-elevated)]",
        className
      )}
    >
      <div className="flex items-start gap-3">
        {/* Icon */}
        <div className={cn(
          "h-9 w-9 rounded-glass-control flex items-center justify-center flex-shrink-0",
          "bg-[hsl(var(--glass-bg-elevated))] border border-[hsl(var(--glass-border))]",
          "group-hover:scale-105 transition-transform"
        )}>
          <Icon className={cn("h-4.5 w-4.5", iconColor)} />
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h4 className="text-sm font-medium text-foreground truncate">
              {artifact.title}
            </h4>
            <span className="text-[9px] text-muted-foreground uppercase tracking-wide px-1.5 py-0.5 rounded bg-muted/50">
              {artifact.type}
            </span>
          </div>
          
          {preview && (
            <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
              {preview}...
            </p>
          )}
        </div>

        {/* Open indicator */}
        <div className={cn(
          "flex items-center gap-1 text-[10px] font-medium",
          iconColor,
          "opacity-0 group-hover:opacity-100 transition-opacity"
        )}>
          <span>Open</span>
          <ExternalLink className="h-3 w-3" />
        </div>
      </div>
    </motion.button>
  );
}

// Utility to detect if content should be treated as an artifact
// CONSERVATIVE: Only triggers for genuinely long, structured documents — NOT normal chat responses
export function detectArtifact(content: string): Artifact | null {
  if (!content || content.length < 1500) return null;
  
  // Code block detection (long code blocks — 300+ chars of actual code)
  const codeBlockMatch = content.match(/```(\w+)?\n([\s\S]{300,})```/);
  if (codeBlockMatch) {
    const language = codeBlockMatch[1] || "text";
    const codeContent = codeBlockMatch[2];
    return {
      id: `artifact_${Date.now()}`,
      type: "code",
      title: `Code (${language})`,
      content: codeContent.trim(),
      language,
      createdAt: new Date().toISOString(),
    };
  }
  
  // Long structured document: 3000+ chars AND has 3+ markdown headers (real document structure)
  const headerCount = (content.match(/^#{1,3}\s+.+$/gm) || []).length;
  if (content.length > 3000 && headerCount >= 3) {
    const titleMatch = content.match(/^#{1,2}\s+(.+)$/m);
    return {
      id: `artifact_${Date.now()}`,
      type: "document",
      title: titleMatch?.[1] || "Document",
      content,
      createdAt: new Date().toISOString(),
    };
  }
  
  // Table detection (large tables with 5+ rows)
  if (content.includes("|") && /\|[-:]+\|/.test(content)) {
    const tableRows = (content.match(/^\|.+\|$/gm) || []).length;
    if (tableRows >= 7) {
      return {
        id: `artifact_${Date.now()}`,
        type: "table",
        title: "Data Table",
        content,
        createdAt: new Date().toISOString(),
      };
    }
  }
  
  return null;
}
