import { memo, useState } from "react";
import { motion } from "motion/react";
import { FileDown, FileSpreadsheet, FileText, Code2, Download, Check, Eye } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { exportAsWord, exportAsCSV, exportAsMarkdown, exportAsJSON } from "@/lib/exportUtils";
import type { Artifact } from "./ArtifactPanel";

interface FileDownloadCardProps {
  fileType: string;
  content: string;
  filename: string;
  onPreview?: (artifact: Artifact) => void;
  activeArtifactTitle?: string;
  activeArtifactVersion?: number;
}

const FILE_TYPE_CONFIG: Record<string, { icon: React.ElementType; label: string; color: string; extension: string; artifactType: Artifact["type"]; language?: string }> = {
  csv: { icon: FileSpreadsheet, label: "CSV Spreadsheet", color: "text-green-400", extension: ".csv", artifactType: "table" },
  docx: { icon: FileText, label: "Word Document", color: "text-blue-400", extension: ".docx", artifactType: "document" },
  md: { icon: FileText, label: "Markdown", color: "text-purple-400", extension: ".md", artifactType: "document" },
  json: { icon: Code2, label: "JSON Data", color: "text-amber-400", extension: ".json", artifactType: "code", language: "json" },
};

export const FileDownloadCard = memo(function FileDownloadCard({ fileType, content, filename, onPreview, activeArtifactTitle, activeArtifactVersion }: FileDownloadCardProps) {
  const [downloaded, setDownloaded] = useState(false);
  const isUpdated = activeArtifactTitle === filename && (activeArtifactVersion || 1) > 1;
  const cfg = FILE_TYPE_CONFIG[fileType];
  const config = cfg ?? { icon: FileDown, label: fileType.toUpperCase(), color: "text-muted-foreground", extension: `.${fileType}`, artifactType: "document" as Artifact["type"], language: undefined };
  const Icon = config.icon;

  const estimatedSize = new Blob([content]).size;
  const sizeLabel = estimatedSize > 1024 ? `${(estimatedSize / 1024).toFixed(1)} KB` : `${estimatedSize} B`;

  const handlePreview = () => {
    if (!onPreview) return;
    const artifact: Artifact = {
      id: `file-${filename}-${Date.now()}`,
      type: config.artifactType,
      title: filename,
      content,
      language: config.language,
      createdAt: new Date().toISOString(),
    };
    onPreview(artifact);
  };

  const handleDownload = async () => {
    try {
      const safeName = filename.replace(/\s+/g, "_").toLowerCase().replace(/\.[^.]+$/, "");
      switch (fileType) {
        case "csv": exportAsCSV(content, safeName); break;
        case "docx": await exportAsWord(content, filename, safeName); break;
        case "md": exportAsMarkdown(content, safeName); break;
        case "json": exportAsJSON(content, safeName); break;
        default: {
          const blob = new Blob([content], { type: "text/plain" });
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url; a.download = `${safeName}${config.extension}`;
          document.body.appendChild(a); a.click(); document.body.removeChild(a);
          URL.revokeObjectURL(url);
        }
      }
      setDownloaded(true);
      toast.success(`Downloaded ${safeName}${config.extension}`);
      setTimeout(() => setDownloaded(false), 3000);
    } catch (error) {
      console.error("File download error:", error);
      toast.error("Failed to download file");
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className={cn(
        "flex items-center gap-3 p-3 rounded-glass-card bg-card/40 border border-border/30 backdrop-blur-sm max-w-xs",
        onPreview && "cursor-pointer hover:border-primary/40 hover:bg-card/60 transition-colors"
      )}
      onClick={onPreview ? handlePreview : undefined}
    >
      <div className={cn("h-10 w-10 rounded-glass-control flex items-center justify-center bg-muted/30 shrink-0")}>
        <Icon className={cn("h-5 w-5", config.color)} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{filename}</p>
        <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
          <span className="uppercase font-mono">{fileType}</span>
          <span>•</span>
          <span>{sizeLabel}</span>
          {isUpdated && (
            <>
              <span>•</span>
              <span className="text-green-400 flex items-center gap-0.5 font-medium"><Check className="h-2.5 w-2.5" />Updated</span>
            </>
          )}
          {onPreview && !isUpdated && (
            <>
              <span>•</span>
              <span className="text-primary/70 flex items-center gap-0.5"><Eye className="h-2.5 w-2.5" />Preview</span>
            </>
          )}
        </div>
      </div>
      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8 shrink-0"
        onClick={(e) => { e.stopPropagation(); handleDownload(); }}
      >
        {downloaded ? <Check className="h-4 w-4 text-green-500" /> : <Download className="h-4 w-4" />}
      </Button>
    </motion.div>
  );
});
