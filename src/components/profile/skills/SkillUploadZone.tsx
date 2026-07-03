import { useState, useRef, useCallback } from "react";
import { Upload, FileArchive, File, FolderOpen, Loader2, CheckCircle2, AlertCircle, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { parseZipFile, parseSingleFile } from "./zipParser";
import type { ParsedSkillFolder } from "./types";

interface SkillUploadZoneProps {
  onSkillsParsed: (folders: ParsedSkillFolder[]) => void;
  onMarkdownParsed: (content: string) => void;
  isImporting: boolean;
}

type UploadState = "idle" | "dragging" | "parsing" | "parsed" | "error";

export function SkillUploadZone({ onSkillsParsed, onMarkdownParsed, isImporting }: SkillUploadZoneProps) {
  const [state, setState] = useState<UploadState>("idle");
  const [parsedFolders, setParsedFolders] = useState<ParsedSkillFolder[]>([]);
  const [errorMsg, setErrorMsg] = useState("");
  const [selectedFile, setSelectedFile] = useState<string>("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFiles = useCallback(async (files: FileList | File[]) => {
    const fileArray = Array.from(files);
    if (fileArray.length === 0) return;

    setState("parsing");
    setErrorMsg("");
    setParsedFolders([]);

    try {
      const allFolders: ParsedSkillFolder[] = [];

      for (const file of fileArray) {
        const ext = file.name.split(".").pop()?.toLowerCase() || "";

        if (ext === "zip") {
          setSelectedFile(file.name);
          const folders = await parseZipFile(file);
          if (folders.length === 0) {
            throw new Error("ZIP file contains no readable skill files");
          }
          allFolders.push(...folders);
        } else if (["md", "yaml", "yml", "json", "txt"].includes(ext)) {
          setSelectedFile(file.name);
          const parsed = await parseSingleFile(file);
          if (parsed) {
            onMarkdownParsed(parsed.content);
            setState("parsed");
            return;
          }
        } else {
          throw new Error(`Unsupported file type: .${ext}`);
        }
      }

      if (allFolders.length > 0) {
        setParsedFolders(allFolders);
        onSkillsParsed(allFolders);
        setState("parsed");
        toast.success(`Found ${allFolders.length} skill${allFolders.length > 1 ? "s" : ""} in package`);
      }
    } catch (err: any) {
      setState("error");
      setErrorMsg(err.message || "Failed to parse file");
      toast.error(err.message || "Failed to parse file");
    }
  }, [onSkillsParsed, onMarkdownParsed]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setState((s) => (s === "parsing" || s === "parsed" ? s : "dragging"));
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setState((s) => (s === "parsing" || s === "parsed" ? s : "idle"));
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer.files.length > 0) {
      handleFiles(e.dataTransfer.files);
    }
  }, [handleFiles]);

  const resetUpload = useCallback(() => {
    setState("idle");
    setParsedFolders([]);
    setErrorMsg("");
    setSelectedFile("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, []);

  const fileIcon = (type: string) => {
    if (type === "md") return "📝";
    if (type === "yaml") return "⚙️";
    if (type === "json") return "📦";
    return "📄";
  };

  return (
    <div className="space-y-3">
      {/* Drop Zone */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => state !== "parsing" && fileInputRef.current?.click()}
        className={cn(
          "relative rounded-xl border-2 border-dashed transition-all duration-300 cursor-pointer overflow-hidden",
          state === "dragging" && "border-primary bg-primary/5 scale-[1.01] shadow-[0_0_30px_-10px_hsl(var(--primary)/0.3)]",
          state === "parsing" && "border-primary/40 bg-primary/5 cursor-wait",
          state === "parsed" && "border-emerald-500/40 bg-emerald-500/5",
          state === "error" && "border-destructive/40 bg-destructive/5",
          state === "idle" && "border-border/30 bg-card/10 hover:border-primary/30 hover:bg-card/20"
        )}
      >
        {/* Glow effect when dragging */}
        {state === "dragging" && (
          <div className="absolute inset-0 bg-gradient-to-b from-primary/10 to-transparent animate-pulse pointer-events-none" />
        )}

        <div className="relative p-6 sm:p-8 text-center space-y-3">
          {state === "idle" && (
            <>
              <div className="mx-auto h-12 w-12 rounded-xl bg-card/30 border border-border/20 flex items-center justify-center">
                <Upload className="h-5 w-5 text-muted-foreground/50" />
              </div>
              <div>
                <p className="text-sm font-medium">Drop skill files here</p>
                <p className="text-xs text-muted-foreground/60 mt-1">
                  .zip packages, .md files, or skill folders
                </p>
              </div>
              <div className="flex items-center gap-2 justify-center">
                <Badge variant="outline" className="text-[10px] border-border/30 gap-1">
                  <FileArchive className="h-3 w-3" /> .zip
                </Badge>
                <Badge variant="outline" className="text-[10px] border-border/30 gap-1">
                  <File className="h-3 w-3" /> .md
                </Badge>
                <Badge variant="outline" className="text-[10px] border-border/30 gap-1">
                  <File className="h-3 w-3" /> .yaml
                </Badge>
                <Badge variant="outline" className="text-[10px] border-border/30 gap-1">
                  <File className="h-3 w-3" /> .json
                </Badge>
              </div>
            </>
          )}

          {state === "dragging" && (
            <>
              <div className="mx-auto h-12 w-12 rounded-xl bg-primary/20 border border-primary/30 flex items-center justify-center animate-bounce">
                <Upload className="h-5 w-5 text-primary" />
              </div>
              <p className="text-sm font-semibold text-primary">Drop to upload</p>
            </>
          )}

          {state === "parsing" && (
            <>
              <Loader2 className="h-8 w-8 mx-auto text-primary animate-spin" />
              <p className="text-sm font-medium">Parsing {selectedFile}...</p>
              <p className="text-xs text-muted-foreground/60">Reading folder structure & files</p>
            </>
          )}

          {state === "error" && (
            <>
              <AlertCircle className="h-8 w-8 mx-auto text-destructive/70" />
              <p className="text-sm font-medium text-destructive">{errorMsg}</p>
              <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); resetUpload(); }}>
                Try again
              </Button>
            </>
          )}

          {state === "parsed" && parsedFolders.length === 0 && (
            <>
              <CheckCircle2 className="h-8 w-8 mx-auto text-emerald-500" />
              <p className="text-sm font-medium text-emerald-400">File loaded</p>
            </>
          )}
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept=".zip,.md,.yaml,.yml,.json,.txt,.toml"
          multiple
          className="hidden"
          onChange={(e) => e.target.files && handleFiles(e.target.files)}
        />
      </div>

      {/* Parsed Results Preview */}
      {state === "parsed" && parsedFolders.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium text-muted-foreground">
              {parsedFolders.length} skill{parsedFolders.length > 1 ? "s" : ""} found in <span className="text-primary">{selectedFile}</span>
            </p>
            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={resetUpload}>
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>

          <ScrollArea className="max-h-[200px]">
            <div className="space-y-2">
              {parsedFolders.map((folder, i) => (
                <div
                  key={i}
                  className="rounded-lg border border-border/20 bg-card/10 p-3 space-y-2"
                >
                  <div className="flex items-center gap-2">
                    <FolderOpen className="h-4 w-4 text-primary/60 shrink-0" />
                    <span className="text-sm font-medium truncate">{folder.folderName}</span>
                    <Badge variant="outline" className="text-[9px] h-4 px-1.5 border-primary/20 text-primary/70 ml-auto shrink-0">
                      {folder.files.length} file{folder.files.length > 1 ? "s" : ""}
                    </Badge>
                  </div>

                  {folder.description && (
                    <p className="text-[11px] text-muted-foreground/60 line-clamp-1 pl-6">{folder.description}</p>
                  )}

                  <div className="flex flex-wrap gap-1 pl-6">
                    {folder.files.slice(0, 6).map((f, j) => (
                      <Badge key={j} variant="secondary" className="text-[9px] h-4 px-1.5 bg-card/30 gap-0.5">
                        {fileIcon(f.type)} {f.name}
                      </Badge>
                    ))}
                    {folder.files.length > 6 && (
                      <Badge variant="secondary" className="text-[9px] h-4 px-1.5 bg-card/30">
                        +{folder.files.length - 6} more
                      </Badge>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        </div>
      )}
    </div>
  );
}
