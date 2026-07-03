import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ArrowLeft, Trash2, Zap, Clock, Hash, ChevronRight, ChevronDown, FolderOpen, FolderClosed, FileText, FileCode, File, Copy, Check } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import type { Skill, FileTreeNode } from "./types";

interface SkillDetailViewProps {
  skill: Skill;
  onBack: () => void;
  onDelete: (id: string) => void;
}

/** Reconstruct file tree from input_schema.file_tree or execution_steps content */
function extractFileTree(skill: Skill): FileTreeNode | null {
  // Prefer stored file tree
  if (skill.input_schema?.file_tree) {
    return skill.input_schema.file_tree as FileTreeNode;
  }
  return null;
}

/** Extract file contents from execution_steps template */
function extractFileContents(skill: Skill): Map<string, string> {
  const map = new Map<string, string>();
  if (!Array.isArray(skill.execution_steps)) return map;

  for (const step of skill.execution_steps) {
    const template = step?.params?.template || "";
    // Parse "--- FILE: path ---\ncontent" blocks
    const regex = /--- FILE: (.+?) ---\n([\s\S]*?)(?=\n--- FILE: |$)/g;
    let match;
    while ((match = regex.exec(template)) !== null) {
      map.set(match[1], match[2].trim());
    }
  }
  return map;
}

// ─── File Icon Helper ────────────────────────────────────────
function FileIcon({ name, className }: { name: string; className?: string }) {
  const ext = name.split(".").pop()?.toLowerCase() || "";
  if (["md", "txt"].includes(ext)) return <FileText className={cn("h-3.5 w-3.5 text-blue-400/80", className)} />;
  if (["js", "ts", "jsx", "tsx", "py", "sh", "sql"].includes(ext)) return <FileCode className={cn("h-3.5 w-3.5 text-emerald-400/80", className)} />;
  if (["yaml", "yml", "json", "toml", "xml"].includes(ext)) return <FileCode className={cn("h-3.5 w-3.5 text-amber-400/80", className)} />;
  return <File className={cn("h-3.5 w-3.5 text-muted-foreground/60", className)} />;
}

// ─── Recursive Tree Node ─────────────────────────────────────
function TreeNode({
  node,
  selectedPath,
  onSelect,
  depth = 0,
}: {
  node: FileTreeNode;
  selectedPath: string;
  onSelect: (node: FileTreeNode) => void;
  depth?: number;
}) {
  const [expanded, setExpanded] = useState(depth < 2);
  const isSelected = !node.isDir && node.path === selectedPath;

  if (node.isDir) {
    return (
      <div>
        <button
          onClick={() => setExpanded(!expanded)}
          className={cn(
            "flex items-center gap-1.5 w-full text-left py-1 px-1.5 rounded-md text-xs hover:bg-card/30 transition-colors group",
          )}
          style={{ paddingLeft: `${depth * 12 + 4}px` }}
        >
          {expanded ? (
            <ChevronDown className="h-3 w-3 text-muted-foreground/50 shrink-0" />
          ) : (
            <ChevronRight className="h-3 w-3 text-muted-foreground/50 shrink-0" />
          )}
          {expanded ? (
            <FolderOpen className="h-3.5 w-3.5 text-primary/70 shrink-0" />
          ) : (
            <FolderClosed className="h-3.5 w-3.5 text-primary/50 shrink-0" />
          )}
          <span className="truncate text-muted-foreground group-hover:text-foreground transition-colors">
            {node.name}
          </span>
        </button>
        {expanded && node.children && (
          <div>
            {node.children.map((child, i) => (
              <TreeNode key={child.path || `${node.path}/${i}`} node={child} selectedPath={selectedPath} onSelect={onSelect} depth={depth + 1} />
            ))}
          </div>
        )}
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

// ─── Content Viewer ──────────────────────────────────────────
function ContentViewer({ content, fileName }: { content: string; fileName: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Extract YAML frontmatter for display
  const yamlMatch = content.match(/^---\s*\n([\s\S]*?)\n---/);
  const yamlBlock = yamlMatch ? yamlMatch[1] : null;
  const bodyContent = yamlMatch ? content.slice(yamlMatch[0].length).trim() : content;

  return (
    <div className="h-full flex flex-col">
      {yamlBlock && (
        <div className="border-b border-border/20 bg-card/20 p-3 shrink-0">
          <div className="flex items-center justify-between mb-2">
            <Badge variant="outline" className="text-[9px] h-4 px-1.5 border-border/30 text-muted-foreground">YAML</Badge>
            <Button variant="ghost" size="icon" className="h-5 w-5 relative before:absolute before:-inset-3 before:content-[''] touch-manipulation" onClick={handleCopy}>
              {copied ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3 text-muted-foreground/50" />}
            </Button>
          </div>
          <pre className="text-[11px] font-mono text-primary/80 whitespace-pre-wrap leading-relaxed">{yamlBlock}</pre>
        </div>
      )}
      <ScrollArea className="flex-1 min-h-0">
        <div className="p-4 prose prose-sm prose-invert max-w-none">
          {!yamlBlock && (
            <div className="flex justify-end mb-2">
              <Button variant="ghost" size="icon" className="h-5 w-5 relative before:absolute before:-inset-3 before:content-[''] touch-manipulation" onClick={handleCopy}>
                {copied ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3 text-muted-foreground/50" />}
              </Button>
            </div>
          )}
          <MarkdownRenderer content={bodyContent} />
        </div>
      </ScrollArea>
    </div>
  );
}

/** Simple markdown-to-JSX renderer for skill content */
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
        <ol key={`list-${elements.length}`} className="list-decimal list-inside space-y-1 text-sm text-muted-foreground/90 my-2">
          {listItems.map((item, j) => <li key={j}>{item}</li>)}
        </ol>
      );
      listItems = [];
    }
  };

  while (i < lines.length) {
    const line = lines[i];

    // Code block
    if (line.trim().startsWith("```")) {
      if (inCode) {
        elements.push(
          <pre key={`code-${elements.length}`} className="rounded-lg bg-card/30 border border-border/20 p-3 text-[11px] font-mono overflow-x-auto my-2 text-muted-foreground/80">
            {codeBlock.join("\n")}
          </pre>
        );
        codeBlock = [];
        inCode = false;
      } else {
        flushList();
        inCode = true;
      }
      i++;
      continue;
    }

    if (inCode) {
      codeBlock.push(line);
      i++;
      continue;
    }

    // Headers
    if (line.startsWith("# ")) {
      flushList();
      elements.push(<h1 key={`h1-${i}`} className="text-lg font-bold mt-4 mb-2 text-foreground">{line.slice(2)}</h1>);
    } else if (line.startsWith("## ")) {
      flushList();
      elements.push(<h2 key={`h2-${i}`} className="text-base font-semibold mt-3 mb-1.5 text-foreground">{line.slice(3)}</h2>);
    } else if (line.startsWith("### ")) {
      flushList();
      elements.push(<h3 key={`h3-${i}`} className="text-sm font-semibold mt-3 mb-1 text-foreground/90">{line.slice(4)}</h3>);
    }
    // List items
    else if (/^\d+\.\s/.test(line.trim())) {
      listItems.push(line.trim().replace(/^\d+\.\s/, ""));
    } else if (line.trim().startsWith("- ")) {
      listItems.push(line.trim().slice(2));
    }
    // Bold lines
    else if (line.trim().startsWith("**") && line.trim().endsWith("**")) {
      flushList();
      elements.push(<p key={`bold-${i}`} className="text-sm font-semibold text-foreground/90 my-1">{line.trim().slice(2, -2)}</p>);
    }
    // Empty line
    else if (line.trim() === "") {
      flushList();
    }
    // Regular paragraph
    else {
      flushList();
      elements.push(<p key={`p-${i}`} className="text-sm text-muted-foreground/90 my-1 leading-relaxed">{line}</p>);
    }
    i++;
  }
  flushList();

  return <>{elements}</>;
}

// ─── Main Component ──────────────────────────────────────────
export function SkillDetailView({ skill, onBack, onDelete }: SkillDetailViewProps) {
  const fileTree = useMemo(() => extractFileTree(skill), [skill]);
  const fileContents = useMemo(() => extractFileContents(skill), [skill]);
  const [selectedNode, setSelectedNode] = useState<FileTreeNode | null>(null);

  // Auto-select the first file (typically SKILL.md)
  const firstFile = useMemo(() => {
    if (!fileTree?.children) return null;
    const findFirst = (node: FileTreeNode): FileTreeNode | null => {
      if (!node.isDir) return node;
      for (const child of node.children || []) {
        const found = findFirst(child);
        if (found) return found;
      }
      return null;
    };
    return findFirst(fileTree);
  }, [fileTree]);

  const activeNode = selectedNode || firstFile;
  const activeContent = activeNode
    ? activeNode.content || fileContents.get(activeNode.path) || ""
    : "";

  const hasTree = fileTree && fileTree.children && fileTree.children.length > 0;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={onBack} className="h-8 w-8">
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1 min-w-0">
          <h3 className="text-base font-semibold truncate">{skill.skill_name}</h3>
          <p className="text-xs text-muted-foreground/60">Skill</p>
        </div>
        <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={() => onDelete(skill.id)}>
          <Trash2 className="h-4 w-4 mr-1" /> Delete
        </Button>
      </div>

      {/* File Tree + Content Viewer (Manus-style) */}
      {hasTree ? (
        <div className="rounded-xl border border-border/20 bg-card/10 overflow-hidden" style={{ height: "400px" }}>
          <div className="flex h-full">
            {/* Left: File Tree Sidebar */}
            <div className="w-[200px] shrink-0 border-r border-border/20 bg-card/5 flex flex-col">
              <ScrollArea className="flex-1">
                <div className="p-2">
                  <TreeNode
                    node={fileTree!}
                    selectedPath={activeNode?.path || ""}
                    onSelect={(node) => setSelectedNode(node)}
                    depth={0}
                  />
                </div>
              </ScrollArea>
            </div>

            {/* Right: Content Viewer */}
            <div className="flex-1 min-w-0 flex flex-col">
              {activeNode ? (
                <ContentViewer content={activeContent} fileName={activeNode.name} />
              ) : (
                <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground/40">
                  Select a file to view
                </div>
              )}
            </div>
          </div>
        </div>
      ) : (
        /* Fallback: YAML block for skills without tree */
        <div className="rounded-xl border border-border/30 bg-card/20 p-4 space-y-1">
          <Badge variant="outline" className="text-[9px] h-4 px-1.5 border-border/30 text-muted-foreground mb-2">YAML</Badge>
          <pre className="text-xs font-mono text-primary/80 whitespace-pre-wrap">
{`name: ${skill.skill_name}
description: "${skill.description || ""}"`}
          </pre>
        </div>
      )}

      {/* Description */}
      <div className="space-y-1.5">
        <h4 className="text-sm font-semibold">{skill.skill_name.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}</h4>
        <p className="text-sm text-muted-foreground/80">{skill.description}</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-xl border border-border/20 bg-card/10 p-3 text-center">
          <Zap className="h-4 w-4 mx-auto text-primary/60 mb-1" />
          <p className="text-lg font-bold">{skill.use_count || 0}</p>
          <p className="text-[10px] text-muted-foreground/60">Uses</p>
        </div>
        <div className="rounded-xl border border-border/20 bg-card/10 p-3 text-center">
          <Hash className="h-4 w-4 mx-auto text-primary/60 mb-1" />
          <p className="text-lg font-bold">v{skill.version || 1}</p>
          <p className="text-[10px] text-muted-foreground/60">Version</p>
        </div>
        <div className="rounded-xl border border-border/20 bg-card/10 p-3 text-center">
          <Clock className="h-4 w-4 mx-auto text-primary/60 mb-1" />
          <p className="text-xs font-medium">{skill.last_used_at ? format(new Date(skill.last_used_at), "MMM d") : "Never"}</p>
          <p className="text-[10px] text-muted-foreground/60">Last Used</p>
        </div>
      </div>

      {/* Keywords */}
      {skill.trigger_keywords && skill.trigger_keywords.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground/70">Trigger Keywords</p>
          <div className="flex flex-wrap gap-1.5">
            {skill.trigger_keywords.map((kw, i) => (
              <Badge key={i} variant="secondary" className="text-[10px] bg-primary/10 text-primary border-primary/20">{kw}</Badge>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
