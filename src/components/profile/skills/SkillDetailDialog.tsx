import { useState, useMemo, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog, DialogContent, DialogTitle,
} from "@/components/ui/dialog";
import {
  Trash2, Zap, Clock, Hash, ChevronRight, ChevronDown,
  FolderOpen, FolderClosed, FileText, FileCode, File, Copy, Check,
  Settings2, Pencil, Save, X, Sparkles, PanelLeftClose, PanelLeft,
} from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { useIsMobile } from "@/hooks/use-mobile";
import type { Skill, FileTreeNode } from "./types";

// ─── Helpers ─────────────────────────────────────────────────

function extractFileTree(skill: Skill): FileTreeNode | null {
  if (skill.input_schema?.file_tree) return skill.input_schema.file_tree as FileTreeNode;
  return null;
}

function extractFileContents(skill: Skill): Map<string, string> {
  const map = new Map<string, string>();
  if (!Array.isArray(skill.execution_steps)) return map;
  for (const step of skill.execution_steps) {
    const template = step?.params?.template || "";
    const regex = /--- FILE: (.+?) ---\n([\s\S]*?)(?=\n--- FILE: |$)/g;
    let match;
    while ((match = regex.exec(template)) !== null) {
      map.set(match[1], match[2].trim());
    }
  }
  return map;
}

function countFiles(node: FileTreeNode): number {
  if (!node.isDir) return 1;
  return (node.children || []).reduce((sum, c) => sum + countFiles(c), 0);
}

// ─── Sub-components ──────────────────────────────────────────

function FileIcon({ name, className }: { name: string; className?: string }) {
  const ext = name.split(".").pop()?.toLowerCase() || "";
  if (["md", "txt"].includes(ext)) return <FileText className={cn("h-3.5 w-3.5 text-blue-400/80", className)} />;
  if (["js", "ts", "jsx", "tsx", "py", "sh", "sql"].includes(ext)) return <FileCode className={cn("h-3.5 w-3.5 text-emerald-400/80", className)} />;
  if (["yaml", "yml", "json", "toml", "xml"].includes(ext)) return <FileCode className={cn("h-3.5 w-3.5 text-amber-400/80", className)} />;
  return <File className={cn("h-3.5 w-3.5 text-muted-foreground/60", className)} />;
}

function TreeNode({ node, selectedPath, onSelect, depth = 0 }: {
  node: FileTreeNode; selectedPath: string; onSelect: (n: FileTreeNode) => void; depth?: number;
}) {
  const [expanded, setExpanded] = useState(depth < 2);
  const isSelected = !node.isDir && node.path === selectedPath;

  if (node.isDir) {
    return (
      <div>
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex items-center gap-1.5 w-full text-left py-1 px-1.5 rounded-md text-xs hover:bg-card/30 transition-colors group"
          style={{ paddingLeft: `${depth * 12 + 4}px` }}
        >
          {expanded ? <ChevronDown className="h-3 w-3 text-muted-foreground/50 shrink-0" /> : <ChevronRight className="h-3 w-3 text-muted-foreground/50 shrink-0" />}
          {expanded ? <FolderOpen className="h-3.5 w-3.5 text-primary/70 shrink-0" /> : <FolderClosed className="h-3.5 w-3.5 text-primary/50 shrink-0" />}
          <span className="truncate text-muted-foreground group-hover:text-foreground transition-colors">{node.name}</span>
        </button>
        {expanded && node.children?.map((child, i) => (
          <TreeNode key={child.path || `${node.path}/${i}`} node={child} selectedPath={selectedPath} onSelect={onSelect} depth={depth + 1} />
        ))}
      </div>
    );
  }

  return (
    <button
      onClick={() => onSelect(node)}
      className={cn(
        "flex items-center gap-1.5 w-full text-left py-1 px-1.5 rounded-md text-xs transition-colors",
        isSelected ? "bg-primary/15 text-foreground" : "hover:bg-card/30 text-muted-foreground hover:text-foreground",
      )}
      style={{ paddingLeft: `${depth * 12 + 22}px` }}
    >
      <FileIcon name={node.name} />
      <span className="truncate">{node.name}</span>
    </button>
  );
}

function MarkdownRenderer({ content }: { content: string }) {
  const lines = content.split("\n");
  const elements: React.ReactNode[] = [];
  let i = 0;
  let listItems: string[] = [];
  let codeBlock: string[] = [];
  let inCode = false;

  const flushList = () => {
    if (listItems.length > 0) {
      elements.push(
        <ul key={`list-${elements.length}`} className="list-disc list-inside space-y-1 text-sm text-muted-foreground/90 my-2">
          {listItems.map((item, j) => <li key={j}>{item}</li>)}
        </ul>
      );
      listItems = [];
    }
  };

  while (i < lines.length) {
    const line = lines[i];
    if (line.trim().startsWith("```")) {
      if (inCode) {
        elements.push(
          <pre key={`code-${elements.length}`} className="rounded-lg bg-card/30 border border-border/20 p-3 text-[11px] font-mono overflow-x-auto my-2 text-muted-foreground/80">
            {codeBlock.join("\n")}
          </pre>
        );
        codeBlock = [];
        inCode = false;
      } else { flushList(); inCode = true; }
      i++; continue;
    }
    if (inCode) { codeBlock.push(line); i++; continue; }
    if (line.startsWith("# ")) { flushList(); elements.push(<h1 key={`h-${i}`} className="text-lg font-bold mt-4 mb-2 text-foreground">{line.slice(2)}</h1>); }
    else if (line.startsWith("## ")) { flushList(); elements.push(<h2 key={`h-${i}`} className="text-base font-semibold mt-3 mb-1.5 text-foreground">{line.slice(3)}</h2>); }
    else if (line.startsWith("### ")) { flushList(); elements.push(<h3 key={`h-${i}`} className="text-sm font-semibold mt-3 mb-1 text-foreground/90">{line.slice(4)}</h3>); }
    else if (/^\d+\.\s/.test(line.trim()) || line.trim().startsWith("- ")) { listItems.push(line.trim().replace(/^(\d+\.\s|- )/, "")); }
    else if (line.trim().startsWith("**") && line.trim().endsWith("**")) { flushList(); elements.push(<p key={`b-${i}`} className="text-sm font-semibold text-foreground/90 my-1">{line.trim().slice(2, -2)}</p>); }
    else if (line.trim() === "") { flushList(); }
    else { flushList(); elements.push(<p key={`p-${i}`} className="text-sm text-muted-foreground/90 my-1 leading-relaxed">{line}</p>); }
    i++;
  }
  flushList();
  return <>{elements}</>;
}

function ContentViewer({ content, fileName }: { content: string; fileName: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => { navigator.clipboard.writeText(content); setCopied(true); setTimeout(() => setCopied(false), 2000); };
  const yamlMatch = content.match(/^---\s*\n([\s\S]*?)\n---/);
  const yamlBlock = yamlMatch ? yamlMatch[1] : null;
  const bodyContent = yamlMatch ? content.slice(yamlMatch[0].length).trim() : content;

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* File tab bar */}
      <div className="flex items-center justify-between border-b border-border/20 bg-card/10 px-3 sm:px-4 py-2 shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <FileIcon name={fileName} className="shrink-0" />
          <span className="text-xs font-medium text-foreground/80 truncate">{fileName}</span>
        </div>
        <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0 relative before:absolute before:-inset-2.5 before:content-[''] touch-manipulation" aria-label="Copy" onClick={handleCopy}>
          {copied ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3 text-muted-foreground/50" />}
        </Button>
      </div>
      {yamlBlock && (
        <div className="border-b border-border/20 bg-card/20 p-3 shrink-0">
          <Badge variant="outline" className="text-[9px] h-4 px-1.5 border-border/30 text-muted-foreground mb-2">YAML</Badge>
          <pre className="text-[11px] font-mono text-primary/80 whitespace-pre-wrap leading-relaxed">{yamlBlock}</pre>
        </div>
      )}
      <div className="flex-1 min-h-0 overflow-y-auto">
        <div className="p-3 sm:p-4 max-w-none">
          <MarkdownRenderer content={bodyContent} />
        </div>
      </div>
    </div>
  );
}

// ─── Tabs ────────────────────────────────────────────────────

type Tab = "files" | "settings" | "stats";

// ─── Main Dialog ─────────────────────────────────────────────

interface SkillDetailDialogProps {
  skill: Skill | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDelete: (id: string) => void;
  onToggle: (id: string, active: boolean) => void;
  onUpdate?: (id: string, data: { skill_name?: string; description?: string; trigger_keywords?: string[] }) => void;
}

export function SkillDetailDialog({ skill, open, onOpenChange, onDelete, onToggle, onUpdate }: SkillDetailDialogProps) {
  const isMobile = useIsMobile();
  const [activeTab, setActiveTab] = useState<Tab>("files");
  const [selectedNode, setSelectedNode] = useState<FileTreeNode | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const [editKeywords, setEditKeywords] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(true);

  // Reset state when skill changes
  useEffect(() => {
    if (skill) {
      setSelectedNode(null);
      setActiveTab("files");
      setIsEditing(false);
      setEditName(skill.skill_name);
      setEditDesc(skill.description || "");
      setEditKeywords(skill.trigger_keywords?.join(", ") || "");
      setSidebarOpen(!isMobile);
    }
  }, [skill?.id]);

  const fileTree = useMemo(() => skill ? extractFileTree(skill) : null, [skill]);
  const fileContents = useMemo(() => skill ? extractFileContents(skill) : new Map(), [skill]);
  const totalFiles = useMemo(() => fileTree ? countFiles(fileTree) : 0, [fileTree]);

  const firstFile = useMemo(() => {
    if (!fileTree?.children) return null;
    const find = (n: FileTreeNode): FileTreeNode | null => {
      if (!n.isDir) return n;
      for (const c of n.children || []) { const f = find(c); if (f) return f; }
      return null;
    };
    return find(fileTree);
  }, [fileTree]);

  const activeNode = selectedNode || firstFile;
  const activeContent = activeNode ? (activeNode.content || fileContents.get(activeNode.path) || "") : "";
  const hasTree = fileTree && fileTree.children && fileTree.children.length > 0;

  const handleSaveEdit = useCallback(() => {
    if (!skill || !onUpdate) return;
    onUpdate(skill.id, {
      skill_name: editName.trim().toLowerCase().replace(/\s+/g, "_"),
      description: editDesc.trim(),
      trigger_keywords: editKeywords.split(",").map(k => k.trim()).filter(Boolean),
    });
    setIsEditing(false);
    toast.success("Skill updated");
  }, [skill, editName, editDesc, editKeywords, onUpdate]);

  const handleDelete = useCallback(() => {
    if (!skill) return;
    onDelete(skill.id);
    onOpenChange(false);
  }, [skill, onDelete, onOpenChange]);

  const handleFileSelect = useCallback((n: FileTreeNode) => {
    setSelectedNode(n);
    // On mobile, auto-close sidebar after file selection
    if (isMobile) setSidebarOpen(false);
  }, [isMobile]);

  if (!skill) return null;

  const displayName = skill.skill_name.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());

  const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: "files", label: "Files", icon: <FileText className="h-3.5 w-3.5" /> },
    { id: "settings", label: "Settings", icon: <Settings2 className="h-3.5 w-3.5" /> },
    { id: "stats", label: "Stats", icon: <Zap className="h-3.5 w-3.5" /> },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent hideCloseButton className={cn(
        "p-0 gap-0 flex flex-col",
        "max-w-[calc(100vw-16px)] max-h-[calc(100vh-16px)] h-[calc(100vh-16px)]",
        "sm:max-w-4xl xl:max-w-5xl sm:max-h-[85vh] sm:h-[85vh]",
        "overflow-hidden"
      )}>
        <DialogTitle className="sr-only">{displayName} — Skill Management</DialogTitle>

        {/* ── Header ── */}
        <div className="flex items-center gap-2 sm:gap-3 px-3 sm:px-4 py-2.5 sm:py-3 border-b border-border/20 shrink-0">
          <div className="h-8 w-8 sm:h-9 sm:w-9 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
            <Sparkles className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-primary/70" />
          </div>

          <div className="flex-1 min-w-0">
            <h2 className="text-sm sm:text-base font-bold truncate">{displayName}</h2>
            <div className="flex items-center gap-1.5 mt-0.5">
              {skill.created_by_agent ? (
                <Badge variant="outline" className="text-[9px] h-4 px-1.5 border-primary/20 text-primary/70">AI Created</Badge>
              ) : (
                <Badge variant="outline" className="text-[9px] h-4 px-1.5 border-border/30">Custom</Badge>
              )}
              <span className="text-[10px] text-muted-foreground/50">v{skill.version || 1}</span>
              {totalFiles > 0 && (
                <span className="text-[10px] text-muted-foreground/50 hidden sm:inline">· {totalFiles} files</span>
              )}
            </div>
          </div>

          {/* Actions — unified for all sizes */}
          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            <Switch
              checked={skill.is_active ?? true}
              onCheckedChange={(checked) => onToggle(skill.id, checked)}
              className="scale-75 sm:scale-90"
            />
            <span className="text-[10px] text-muted-foreground/60 hidden sm:inline">{skill.is_active ? "Active" : "Off"}</span>
            <Button variant="ghost" size="icon" aria-label="Delete skill" className="h-9 w-9 sm:h-8 sm:w-8 text-destructive/60 hover:text-destructive hover:bg-destructive/10 relative before:absolute before:-inset-1 before:content-[''] sm:before:hidden touch-manipulation active:scale-95 transition-transform" onClick={handleDelete}>
              <Trash2 className="h-4 w-4 sm:h-3.5 sm:w-3.5" />
            </Button>
            <Button variant="ghost" size="icon" aria-label="Close" className="h-9 w-9 sm:h-8 sm:w-8 relative before:absolute before:-inset-1 before:content-[''] sm:before:hidden touch-manipulation active:scale-95 transition-transform" onClick={() => onOpenChange(false)}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* ── Tab Bar ── */}
        <div className="flex items-center gap-0.5 px-3 sm:px-4 py-1 sm:py-1.5 border-b border-border/20 bg-card/5 shrink-0 overflow-x-auto">
          {tabs.map(t => (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id)}
              className={cn(
                "flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all whitespace-nowrap",
                activeTab === t.id
                  ? "bg-primary/15 text-primary shadow-sm"
                  : "text-muted-foreground/60 hover:text-foreground hover:bg-card/30"
              )}
            >
              {t.icon}
              {t.label}
            </button>
          ))}
        </div>

        {/* ── Content Area — flex-1 fills remaining space ── */}
        <div className="flex-1 min-h-0 overflow-hidden">
          {/* FILES TAB */}
          {activeTab === "files" && (
            hasTree ? (
              <div className="flex h-full relative">
                {/* Sidebar: collapsible on mobile, scrollable */}
                <div className={cn(
                  "border-r border-border/20 bg-card/5 flex flex-col shrink-0 transition-all duration-200",
                  // Mobile: overlay sidebar
                  isMobile
                    ? cn(
                        "absolute inset-y-0 left-0 z-20 w-[240px] shadow-xl bg-background",
                        sidebarOpen ? "translate-x-0" : "-translate-x-full"
                      )
                    // Desktop: inline sidebar
                    : cn(
                        sidebarOpen ? "w-[220px]" : "w-0 overflow-hidden border-r-0"
                      )
                )}>
                  <div className="px-3 py-2 border-b border-border/10 shrink-0 flex items-center justify-between">
                    <span className="text-[10px] font-semibold text-muted-foreground/50 uppercase tracking-wider">Explorer</span>
                    <Button
                      variant="ghost" size="icon" className="h-5 w-5"
                      onClick={() => setSidebarOpen(false)}
                    >
                      <PanelLeftClose className="h-3 w-3 text-muted-foreground/50" />
                    </Button>
                  </div>
                  <div className="flex-1 min-h-0 overflow-y-auto">
                    <div className="p-2 pb-4">
                      <TreeNode node={fileTree!} selectedPath={activeNode?.path || ""} onSelect={handleFileSelect} depth={0} />
                    </div>
                  </div>
                </div>

                {/* Mobile overlay backdrop */}
                {isMobile && sidebarOpen && (
                  <div
                    className="absolute inset-0 z-10 bg-black/40"
                    onClick={() => setSidebarOpen(false)}
                  />
                )}

                {/* Main content viewer */}
                <div className="flex-1 min-w-0 flex flex-col h-full overflow-hidden">
                  {/* Sidebar toggle for when it's closed */}
                  {!sidebarOpen && (
                    <div className="px-2 py-1.5 border-b border-border/10 shrink-0">
                      <Button
                        variant="ghost" size="sm" className="h-6 text-[10px] gap-1 text-muted-foreground/60"
                        onClick={() => setSidebarOpen(true)}
                      >
                        <PanelLeft className="h-3 w-3" />
                        Explorer
                      </Button>
                    </div>
                  )}
                  {activeNode ? (
                    <ContentViewer content={activeContent} fileName={activeNode.name} />
                  ) : (
                    <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground/40">
                      Select a file to view
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="h-full overflow-y-auto p-4 sm:p-6 space-y-4">
                <div className="rounded-xl border border-border/20 bg-card/10 p-4 sm:p-5">
                  <Badge variant="outline" className="text-[9px] h-4 px-1.5 border-border/30 text-muted-foreground mb-3">YAML</Badge>
                  <pre className="text-xs font-mono text-primary/80 whitespace-pre-wrap">
{`name: ${skill.skill_name}
description: "${skill.description || ""}"
keywords: [${(skill.trigger_keywords || []).map(k => `"${k}"`).join(", ")}]
version: ${skill.version || 1}`}
                  </pre>
                </div>
                <div className="space-y-1.5">
                  <h4 className="text-sm font-semibold">{displayName}</h4>
                  <p className="text-sm text-muted-foreground/80 leading-relaxed">{skill.description}</p>
                </div>
              </div>
            )
          )}

          {/* SETTINGS TAB */}
          {activeTab === "settings" && (
            <div className="h-full overflow-y-auto">
              <div className="p-4 sm:p-6 space-y-6 max-w-lg">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold">Skill Configuration</h3>
                  {!isEditing ? (
                    <Button variant="outline" size="sm" className="h-7 text-xs gap-1.5 border-border/30" onClick={() => setIsEditing(true)}>
                      <Pencil className="h-3 w-3" /> Edit
                    </Button>
                  ) : (
                    <div className="flex gap-2">
                      <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setIsEditing(false)}>
                        <X className="h-3 w-3 mr-1" /> Cancel
                      </Button>
                      <Button size="sm" className="h-7 text-xs gap-1" onClick={handleSaveEdit}>
                        <Save className="h-3 w-3" /> Save
                      </Button>
                    </div>
                  )}
                </div>

                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label className="text-xs text-muted-foreground/70">Skill Name</Label>
                    {isEditing ? (
                      <Input value={editName} onChange={e => setEditName(e.target.value)} className="bg-card/20 border-border/20" />
                    ) : (
                      <p className="text-sm font-medium px-3 py-2 rounded-lg bg-card/10 border border-border/10">{skill.skill_name}</p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label className="text-xs text-muted-foreground/70">Description</Label>
                    {isEditing ? (
                      <Textarea value={editDesc} onChange={e => setEditDesc(e.target.value)} className="bg-card/20 border-border/20 min-h-[80px] resize-none" />
                    ) : (
                      <p className="text-sm text-muted-foreground/80 px-3 py-2 rounded-lg bg-card/10 border border-border/10 leading-relaxed">{skill.description || "No description"}</p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label className="text-xs text-muted-foreground/70">Trigger Keywords</Label>
                    {isEditing ? (
                      <Input value={editKeywords} onChange={e => setEditKeywords(e.target.value)} placeholder="keyword1, keyword2" className="bg-card/20 border-border/20" />
                    ) : (
                      <div className="flex flex-wrap gap-1.5 px-3 py-2 rounded-lg bg-card/10 border border-border/10 min-h-[36px]">
                        {skill.trigger_keywords && skill.trigger_keywords.length > 0 ? (
                          skill.trigger_keywords.map((kw, i) => (
                            <Badge key={i} variant="secondary" className="text-[10px] bg-primary/10 text-primary border-primary/20">{kw}</Badge>
                          ))
                        ) : (
                          <span className="text-xs text-muted-foreground/40">No keywords</span>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label className="text-xs text-muted-foreground/70">Status</Label>
                    <div className="flex items-center gap-3 px-3 py-2 rounded-lg bg-card/10 border border-border/10">
                      <Switch
                        checked={skill.is_active ?? true}
                        onCheckedChange={(checked) => onToggle(skill.id, checked)}
                      />
                      <span className="text-sm">{skill.is_active ? "Active — Agent can use this skill" : "Inactive — Skill is disabled"}</span>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-xs text-muted-foreground/70">Created</Label>
                    <p className="text-sm text-muted-foreground/60 px-3 py-2 rounded-lg bg-card/10 border border-border/10">
                      {skill.created_at ? format(new Date(skill.created_at), "MMMM d, yyyy 'at' h:mm a") : "Unknown"}
                      {skill.created_by_agent && " · by BeeBot 🐝"}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* STATS TAB */}
          {activeTab === "stats" && (
            <div className="h-full overflow-y-auto">
              <div className="p-4 sm:p-6 space-y-6">
                <div className="grid grid-cols-3 gap-2 sm:gap-4">
                  <div className="rounded-xl border border-border/20 bg-card/10 p-3 sm:p-4 text-center space-y-1">
                    <Zap className="h-4 w-4 sm:h-5 sm:w-5 mx-auto text-primary/60" />
                    <p className="text-xl sm:text-2xl font-bold">{skill.use_count || 0}</p>
                    <p className="text-[9px] sm:text-[10px] text-muted-foreground/60 uppercase tracking-wider">Uses</p>
                  </div>
                  <div className="rounded-xl border border-border/20 bg-card/10 p-3 sm:p-4 text-center space-y-1">
                    <Hash className="h-4 w-4 sm:h-5 sm:w-5 mx-auto text-primary/60" />
                    <p className="text-xl sm:text-2xl font-bold">v{skill.version || 1}</p>
                    <p className="text-[9px] sm:text-[10px] text-muted-foreground/60 uppercase tracking-wider">Version</p>
                  </div>
                  <div className="rounded-xl border border-border/20 bg-card/10 p-3 sm:p-4 text-center space-y-1">
                    <Clock className="h-4 w-4 sm:h-5 sm:w-5 mx-auto text-primary/60" />
                    <p className="text-xs sm:text-base font-semibold">{skill.last_used_at ? format(new Date(skill.last_used_at), "MMM d, yyyy") : "Never"}</p>
                    <p className="text-[9px] sm:text-[10px] text-muted-foreground/60 uppercase tracking-wider">Last Used</p>
                  </div>
                </div>

                {totalFiles > 0 && (
                  <div className="rounded-xl border border-border/20 bg-card/10 p-3 sm:p-4 space-y-2">
                    <h4 className="text-xs font-semibold text-muted-foreground/70 uppercase tracking-wider">Package Info</h4>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="text-sm">
                        <span className="text-muted-foreground/60">Files: </span>
                        <span className="font-medium">{totalFiles}</span>
                      </div>
                      <div className="text-sm">
                        <span className="text-muted-foreground/60">Source: </span>
                        <span className="font-medium">{skill.created_by_agent ? "Agent" : "Upload"}</span>
                      </div>
                    </div>
                  </div>
                )}

                {skill.trigger_keywords && skill.trigger_keywords.length > 0 && (
                  <div className="rounded-xl border border-border/20 bg-card/10 p-3 sm:p-4 space-y-3">
                    <h4 className="text-xs font-semibold text-muted-foreground/70 uppercase tracking-wider">Trigger Keywords</h4>
                    <div className="flex flex-wrap gap-1.5">
                      {skill.trigger_keywords.map((kw, i) => (
                        <Badge key={i} variant="secondary" className="text-[10px] bg-primary/10 text-primary border-primary/20">{kw}</Badge>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
