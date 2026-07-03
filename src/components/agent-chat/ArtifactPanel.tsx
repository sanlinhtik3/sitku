import { useState, useEffect, useRef, useMemo } from "react";
import { motion, AnimatePresence } from "motion/react";
import DOMPurify from "dompurify";
import {
  X,
  Copy,
  Download,
  Save,
  FileText,
  Code2,
  FileSpreadsheet,
  BarChart3,
  Check,
  Maximize2,
  Minimize2,
  Monitor,
  Eye,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useIsMobile } from "@/hooks/use-mobile";
import { exportAsWord, exportAsCSV } from "@/lib/exportUtils";

export interface Artifact {
  id: string;
  type: "code" | "document" | "report" | "table";
  title: string;
  content: string;
  language?: string;
  createdAt: string;
  version?: number;
}

interface ArtifactPanelProps {
  artifact: Artifact | null;
  isOpen: boolean;
  onClose: () => void;
  onSave?: (artifact: Artifact) => Promise<void>;
  className?: string;
}

const TYPE_ICONS: Record<Artifact["type"], React.ElementType> = {
  code: Code2,
  document: FileText,
  report: BarChart3,
  table: FileSpreadsheet,
};

const TYPE_COLORS: Record<Artifact["type"], string> = {
  code: "text-green-400",
  document: "text-blue-400",
  report: "text-purple-400",
  table: "text-amber-400",
};

// ── helpers ──────────────────────────────────────────────────────────────────
function isPreviewable(artifact: Artifact): boolean {
  if (artifact.type !== "code") return false;
  const lang = (artifact.language || "").toLowerCase();
  return ["html", "htm", "svg", "mermaid", "react", "jsx", "tsx"].includes(lang);
}

export function ArtifactPanel({
  artifact,
  isOpen,
  onClose,
  onSave,
  className,
}: ArtifactPanelProps) {
  const [copied, setCopied] = useState(false);
  const [saving, setSaving] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showUpdateFlash, setShowUpdateFlash] = useState(false);
  const [viewMode, setViewMode] = useState<"code" | "preview">("code");
  const prevVersionRef = useRef(artifact?.version || 1);
  const isMobile = useIsMobile();

  // Reset to code view when a new artifact opens
  useEffect(() => {
    setViewMode("code");
  }, [artifact?.id]);

  // Detect in-place version update → flash
  useEffect(() => {
    const currentVersion = artifact?.version || 1;
    if (currentVersion > prevVersionRef.current) {
      setShowUpdateFlash(true);
      const timer = setTimeout(() => setShowUpdateFlash(false), 1200);
      prevVersionRef.current = currentVersion;
      return () => clearTimeout(timer);
    }
    prevVersionRef.current = currentVersion;
  }, [artifact?.version]);

  if (!artifact) return null;

  const Icon = TYPE_ICONS[artifact.type] || FileText;
  const iconColor = TYPE_COLORS[artifact.type] || "text-muted-foreground";

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(artifact.content);
      setCopied(true);
      toast.success("Copied to clipboard");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Failed to copy");
    }
  };

  const handleDownload = async () => {
    const safeName = artifact.title.replace(/\s+/g, "_").toLowerCase();
    
    try {
      if (artifact.type === "table") {
        // Export as CSV with proper column parsing
        exportAsCSV(artifact.content, safeName);
        toast.success(`Downloaded ${safeName}.csv`);
        return;
      }
      
      if (artifact.type === "document" || artifact.type === "report") {
        // Export as Word (.docx)
        await exportAsWord(artifact.content, artifact.title, safeName);
        toast.success(`Downloaded ${safeName}.docx`);
        return;
      }
      
      // Code and fallback: download as plain text with proper extension
      const extension = artifact.type === "code" ? (artifact.language || "txt") : "md";
      const filename = `${safeName}.${extension}`;
      const blob = new Blob([artifact.content], { type: "text/plain" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success(`Downloaded ${filename}`);
    } catch (error) {
      console.error("Download error:", error);
      toast.error("Failed to download file");
    }
  };

  const handleSave = async () => {
    if (!onSave) return;
    setSaving(true);
    try {
      await onSave(artifact);
      toast.success("Saved to My AI Content");
    } catch {
      toast.error("Failed to save");
    } finally {
      setSaving(false);
    }
  };

  // Preview tab strip — shown only for previewable artifacts
  const canPreview = isPreviewable(artifact);
  const tabStrip = canPreview ? (
    <div className="flex items-center gap-0.5 px-4 py-1.5 border-b border-border/20 bg-card/20">
      <button
        onClick={() => setViewMode("code")}
        className={cn(
          "flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-medium transition-colors",
          viewMode === "code"
            ? "bg-muted/60 text-foreground"
            : "text-muted-foreground hover:text-foreground hover:bg-muted/30"
        )}
      >
        <Code2 className="h-3 w-3" />
        Code
      </button>
      <button
        onClick={() => setViewMode("preview")}
        className={cn(
          "flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-medium transition-colors",
          viewMode === "preview"
            ? "bg-muted/60 text-foreground"
            : "text-muted-foreground hover:text-foreground hover:bg-muted/30"
        )}
      >
        <Monitor className="h-3 w-3" />
        Preview
      </button>
    </div>
  ) : null;

  // On mobile, render as fullscreen modal
  if (isMobile) {
    return (
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-background/95 backdrop-blur-xl flex flex-col"
          >
            {/* Header */}
            <div className="flex items-center justify-between p-3 border-b border-border/30">
              <div className="flex items-center gap-2 min-w-0">
                <Icon className={cn("h-4 w-4 flex-shrink-0", iconColor)} />
                <span className="text-sm font-medium truncate">{artifact.title}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={handleCopy}>
                  {copied ? <Check className="h-3.5 w-3.5 text-green-500" /> : <Copy className="h-3.5 w-3.5" />}
                </Button>
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={handleDownload}>
                  <Download className="h-3.5 w-3.5" />
                </Button>
                {onSave && (
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={handleSave} disabled={saving}>
                    <Save className={cn("h-3.5 w-3.5", saving && "animate-pulse")} />
                  </Button>
                )}
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onClose}>
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </div>
            {tabStrip}

            {/* Content */}
            <div className="flex-1 overflow-hidden p-3">
              {viewMode === "preview" && canPreview
                ? <ArtifactPreview artifact={artifact} />
                : <div className="h-full overflow-auto"><ArtifactContent artifact={artifact} /></div>
              }
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    );
  }

  // Desktop: Embeddable panel (fills parent from SidebarOrchestrator)
  if (isFullscreen) {
    return (
      <div className="fixed inset-0 z-50 flex flex-col bg-card/95 backdrop-blur-xl border-l-0">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border/30 bg-card/40 backdrop-blur-xl">
          <div className="flex items-center gap-2 min-w-0">
            <div className={cn("h-7 w-7 rounded-lg flex items-center justify-center", "bg-gradient-to-br from-primary/20 to-primary/10")}>
              <Icon className={cn("h-4 w-4", iconColor)} />
            </div>
            <div className="min-w-0">
              <h3 className="text-sm font-semibold truncate">{artifact.title}</h3>
              <span className="text-[10px] text-muted-foreground capitalize">{artifact.type}</span>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleCopy} title="Copy">
              {copied ? <Check className="h-3.5 w-3.5 text-green-500" /> : <Copy className="h-3.5 w-3.5" />}
            </Button>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleDownload} title="Download">
              <Download className="h-3.5 w-3.5" />
            </Button>
            {onSave && (
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleSave} disabled={saving} title="Save">
                <Save className={cn("h-3.5 w-3.5", saving && "animate-pulse")} />
              </Button>
            )}
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setIsFullscreen(false)} title="Exit fullscreen">
              <Minimize2 className="h-3.5 w-3.5" />
            </Button>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose} title="Close">
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>
        {tabStrip}
        <div className="flex-1 overflow-hidden p-4">
          {viewMode === "preview" && canPreview
            ? <ArtifactPreview artifact={artifact} />
            : <div className="h-full overflow-auto"><ArtifactContent artifact={artifact} /></div>
          }
        </div>
      </div>
    );
  }

  // Embeddable panel: fills parent container
  return (
    <div className={cn("flex flex-col h-full overflow-hidden", className)}>

      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border/30 bg-card/40 backdrop-blur-xl">
        <div className="flex items-center gap-2 min-w-0">
          <div className={cn(
            "h-7 w-7 rounded-lg flex items-center justify-center",
            "bg-gradient-to-br from-primary/20 to-primary/10"
          )}>
            <Icon className={cn("h-4 w-4", iconColor)} />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <h3 className="text-sm font-semibold truncate">{artifact.title}</h3>
              {(artifact.version || 1) > 1 && (
                <span className={cn(
                  "text-[9px] font-mono px-1.5 py-0.5 rounded-full border",
                  showUpdateFlash
                    ? "bg-primary/20 border-primary/40 text-primary animate-pulse"
                    : "bg-muted/40 border-border/30 text-muted-foreground"
                )}>
                  v{artifact.version}
                </span>
              )}
            </div>
            <span className="text-[10px] text-muted-foreground capitalize">{artifact.type}</span>
          </div>
        </div>

        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={handleCopy}
            title="Copy to clipboard"
          >
            {copied ? (
              <Check className="h-3.5 w-3.5 text-green-500" />
            ) : (
              <Copy className="h-3.5 w-3.5" />
            )}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={handleDownload}
            title="Download file"
          >
            <Download className="h-3.5 w-3.5" />
          </Button>
          {onSave && (
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={handleSave}
              disabled={saving}
              title="Save to My AI Content"
            >
              <Save className={cn("h-3.5 w-3.5", saving && "animate-pulse")} />
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => setIsFullscreen(!isFullscreen)}
            title={isFullscreen ? "Exit fullscreen" : "Fullscreen"}
          >
            {isFullscreen ? (
              <Minimize2 className="h-3.5 w-3.5" />
            ) : (
              <Maximize2 className="h-3.5 w-3.5" />
            )}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={onClose}
            title="Close panel"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Code | Preview tab strip */}
      {tabStrip}

      {/* Content */}
      <div className={cn(
        "flex-1 overflow-hidden transition-colors duration-500",
        showUpdateFlash && "bg-primary/5"
      )}>
        {viewMode === "preview" && canPreview
          ? <ArtifactPreview artifact={artifact} />
          : <div className="h-full overflow-auto p-4"><ArtifactContent artifact={artifact} /></div>
        }
      </div>
    </div>
  );
}

// ── Live Preview Renderer ────────────────────────────────────────────────────
function ArtifactPreview({ artifact }: { artifact: Artifact }) {
  const lang = (artifact.language || "").toLowerCase();

  // HTML — render in sandboxed iframe.
  // Intentionally NO `allow-same-origin`: combined with `allow-scripts` it would let
  // the iframe escape its sandbox and read the parent's storage/cookies.
  if (lang === "html" || lang === "htm") {
    return (
      <iframe
        srcDoc={artifact.content}
        sandbox="allow-scripts"
        referrerPolicy="no-referrer"
        className="w-full h-full border-0"
        title="HTML Preview"
      />
    );
  }

  if (lang === "svg") {
    const safeSvg = DOMPurify.sanitize(artifact.content, {
      USE_PROFILES: { svg: true, svgFilters: true },
      FORBID_TAGS: ["script", "foreignObject"],
      FORBID_ATTR: ["onload", "onerror", "onclick", "onmouseover", "onfocus"],
    });
    return (
      <div className="flex items-center justify-center h-full p-6 overflow-auto">
        <div
          className="max-w-full max-h-full"
          dangerouslySetInnerHTML={{ __html: safeSvg }}
        />
      </div>
    );
  }

  // Mermaid diagram — mermaid.js in iframe
  if (lang === "mermaid") {
    const mermaidSrc = `<!DOCTYPE html>
<html>
<head>
  <script src="https://cdn.jsdelivr.net/npm/mermaid/dist/mermaid.min.js"><\/script>
  <style>
    body { background: transparent; margin: 0; padding: 16px; color: #e2e8f0; }
    .mermaid svg { max-width: 100%; height: auto; }
  </style>
</head>
<body>
  <div class="mermaid">${artifact.content.replace(/</g, "&lt;")}</div>
  <script>mermaid.initialize({ startOnLoad: true, theme: 'dark' });<\/script>
</body>
</html>`;
    return (
      <iframe
        srcDoc={mermaidSrc}
        sandbox="allow-scripts"
        referrerPolicy="no-referrer"
        className="w-full h-full border-0"
        title="Mermaid Diagram"
      />
    );
  }

  // React / JSX / TSX — Babel transpile + React CDN in iframe
  if (lang === "react" || lang === "jsx" || lang === "tsx") {
    // Wrap in an App component if user code doesn't export one
    const userCode = artifact.content;
    const reactSrc = `<!DOCTYPE html>
<html>
<head>
  <script src="https://unpkg.com/react@18/umd/react.development.js"><\/script>
  <script src="https://unpkg.com/react-dom@18/umd/react-dom.development.js"><\/script>
  <script src="https://unpkg.com/@babel/standalone/babel.min.js"><\/script>
  <script src="https://cdn.tailwindcss.com"><\/script>
  <style>
    body { background: transparent; margin: 0; padding: 8px; font-family: sans-serif; }
  </style>
</head>
<body>
  <div id="root"></div>
  <script type="text/babel">
    ${userCode}
    try {
      const root = ReactDOM.createRoot(document.getElementById('root'));
      root.render(React.createElement(typeof App !== 'undefined' ? App : () => React.createElement('p', {}, 'No App component found')));
    } catch(e) {
      document.getElementById('root').innerHTML = '<pre style="color:red;font-size:12px;">' + e.message + '<\\/pre>';
    }
  <\/script>
</body>
</html>`;
    return (
      <iframe
        srcDoc={reactSrc}
        sandbox="allow-scripts"
        referrerPolicy="no-referrer"
        className="w-full h-full border-0"
        title="React Preview"
      />
    );
  }

  // Fallback: not previewable
  return (
    <div className="flex flex-col items-center justify-center h-full gap-3 text-muted-foreground p-6">
      <Eye className="h-10 w-10 opacity-20" />
      <p className="text-sm text-center">
        No preview available for <span className="font-mono text-xs bg-muted/40 px-1.5 py-0.5 rounded">{lang || "this file type"}</span>
      </p>
      <p className="text-xs opacity-60">Switch to Code tab to view the source</p>
    </div>
  );
}

// Separate content renderer for reuse
function ArtifactContent({ artifact }: { artifact: Artifact }) {
  // JSON: formatted syntax display
  if (artifact.type === "code" && artifact.language === "json") {
    let formatted = artifact.content;
    try { formatted = JSON.stringify(JSON.parse(artifact.content), null, 2); } catch {}
    return (
      <div className="relative">
        <div className="absolute top-2 right-2 text-[10px] text-muted-foreground/50 uppercase font-mono">json</div>
        <pre className="p-4 rounded-xl bg-muted/30 border border-border/20 overflow-x-auto">
          <code className="text-xs font-mono text-foreground/90 whitespace-pre">{formatted}</code>
        </pre>
      </div>
    );
  }

  if (artifact.type === "code") {
    return (
      <div className="relative">
        {artifact.language && (
          <div className="absolute top-2 right-2 text-[10px] text-muted-foreground/50 uppercase font-mono">
            {artifact.language}
          </div>
        )}
        <pre className="p-4 rounded-xl bg-muted/30 border border-border/20 overflow-x-auto">
          <code className="text-xs font-mono text-foreground/90 whitespace-pre">
            {artifact.content}
          </code>
        </pre>
      </div>
    );
  }

  // CSV table rendering
  if (artifact.type === "table") {
    const rows = artifact.content.trim().split("\n").map(row =>
      row.split(/[,\t]/).map(cell => cell.replace(/^"|"$/g, "").trim())
    );
    if (rows.length > 0) {
      const [header, ...body] = rows;
      return (
        <div className="overflow-x-auto rounded-xl border border-border/20">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-muted/40 border-b border-border/30">
                {header.map((h, i) => (
                  <th key={i} className="px-3 py-2 text-left font-semibold text-foreground/90 whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {body.map((row, ri) => (
                <tr key={ri} className="border-b border-border/10 hover:bg-muted/20 transition-colors">
                  {row.map((cell, ci) => (
                    <td key={ci} className="px-3 py-1.5 text-foreground/80 whitespace-nowrap">{cell}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    }
  }

  // Documents, reports - render as markdown
  return (
    <div className="prose prose-sm dark:prose-invert max-w-none prose-headings:text-foreground prose-p:text-foreground/90 prose-strong:text-foreground prose-code:text-primary prose-code:bg-muted/50 prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-pre:bg-muted/30 prose-pre:border prose-pre:border-border/30">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>
        {artifact.content}
      </ReactMarkdown>
    </div>
  );
}
