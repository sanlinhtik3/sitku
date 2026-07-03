import { useState, useCallback, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Search, Plus, ChevronDown, Sparkles, Upload, MoreHorizontal,
  Trash2, Eye, Wand2, FileArchive, RefreshCw,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { useNavigate, useLocation } from "react-router-dom";
import { useSkillsData } from "./skills/useSkillsData";
import { SkillDetailDialog } from "./skills/SkillDetailDialog";
import { SkillUploadZone } from "./skills/SkillUploadZone";
import type { Skill, ParsedSkillFolder } from "./skills/types";

export function SkillsManager({ onClose }: { onClose?: () => void }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { skills, isLoading, toggleSkill, deleteSkill, createSkill, updateSkill, refreshSkills } = useSkillsData();
  const [search, setSearch] = useState("");
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [createMode, setCreateMode] = useState<"manual" | "upload">("manual");

  // Hash-based skill detail routing: #profile/skills/{skillId}
  const hashSkillId = (() => {
    const hash = location.hash;
    const match = hash.match(/#profile\/skills\/([a-f0-9-]+)/);
    return match ? match[1] : null;
  })();

  const selectedSkill = hashSkillId ? skills.find(s => s.id === hashSkillId) || null : null;

  const openSkillDetail = useCallback((skill: Skill) => {
    window.location.hash = `profile/skills/${skill.id}`;
  }, []);

  const closeSkillDetail = useCallback(() => {
    window.location.hash = "profile/skills";
  }, []);

  // Manual form
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [newKeywords, setNewKeywords] = useState("");

  // Upload state
  const [markdownContent, setMarkdownContent] = useState("");
  const [parsedFolders, setParsedFolders] = useState<ParsedSkillFolder[]>([]);
  const [isImporting, setIsImporting] = useState(false);

  const resetForm = useCallback(() => {
    setNewName(""); setNewDesc(""); setNewKeywords("");
    setMarkdownContent(""); setParsedFolders([]);
    setCreateMode("manual"); setIsImporting(false);
  }, []);

  const handleCreateManual = () => {
    if (!newName.trim()) return toast.error("Skill name is required");
    createSkill.mutate({
      skill_name: newName.trim().toLowerCase().replace(/\s+/g, "_"),
      description: newDesc.trim() || `Custom skill: ${newName}`,
      trigger_keywords: newKeywords.split(",").map((k) => k.trim()).filter(Boolean),
      execution_steps: [{ action: "format_response", params: { template: `Skill "${newName}" activated. Processing your request...` } }],
      input_schema: {},
    }, { onSuccess: () => { setShowCreateDialog(false); resetForm(); } });
  };

  const handleImportMarkdown = () => {
    if (!markdownContent.trim()) return toast.error("Skill content is required");
    const yamlMatch = markdownContent.match(/^---\s*\n([\s\S]*?)\n---/);
    let name = "custom_skill", desc = "";
    if (yamlMatch) {
      const yaml = yamlMatch[1];
      const nameMatch = yaml.match(/name:\s*(.+)/);
      const descMatch = yaml.match(/description:\s*["']?(.+?)["']?\s*$/m);
      if (nameMatch) name = nameMatch[1].trim();
      if (descMatch) desc = descMatch[1].trim();
    }
    createSkill.mutate({
      skill_name: name.toLowerCase().replace(/\s+/g, "_"),
      description: desc || `Skill from file: ${name}`,
      trigger_keywords: [name.replace(/_/g, " ")],
      execution_steps: [{ action: "format_response", params: { template: `[SKILL INSTRUCTIONS]\n${markdownContent.slice(0, 8000)}` } }],
      input_schema: {},
    }, { onSuccess: () => { setShowCreateDialog(false); resetForm(); } });
  };

  const handleImportFolders = async () => {
    if (parsedFolders.length === 0) return toast.error("No skills to import");
    setIsImporting(true);
    let successCount = 0;
    for (const folder of parsedFolders) {
      try {
        await new Promise<void>((resolve, reject) => {
          createSkill.mutate({
            skill_name: folder.skillName,
            description: folder.description,
            trigger_keywords: folder.keywords,
            execution_steps: [{ action: "format_response", params: { template: `[SKILL PACKAGE: ${folder.folderName}]\n${folder.fullContent.slice(0, 8000)}` } }],
            input_schema: { source_files: folder.files.map((f) => f.name), file_tree: folder.fileTree },
          }, { onSuccess: () => resolve(), onError: (e) => reject(e) });
        });
        successCount++;
      } catch (err) { console.error(`Failed to import skill: ${folder.skillName}`, err); }
    }
    setIsImporting(false);
    if (successCount > 0) {
      toast.success(`Imported ${successCount} skill${successCount > 1 ? "s" : ""} successfully! 🐝`);
      setShowCreateDialog(false); resetForm();
    } else { toast.error("Failed to import skills"); }
  };

  const filtered = skills.filter((s) =>
    !search || s.skill_name.toLowerCase().includes(search.toLowerCase()) ||
    s.description?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-semibold">Skills</h3>
          <p className="text-xs text-muted-foreground/70 mt-0.5">
            Prepackaged and repeatable best practices & tools for your agent
          </p>
        </div>
        <Button variant="ghost" size="icon" aria-label="Sync skills" className="h-9 w-9 lg:h-7 lg:w-7 relative before:absolute before:-inset-1 before:content-[''] lg:before:hidden touch-manipulation active:scale-95 transition-transform" onClick={refreshSkills} title="Sync skills">
          <RefreshCw className="h-3.5 w-3.5" />
        </Button>
      </div>

      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/50" />
          <Input placeholder="Search Skill" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9 h-9 text-sm bg-card/20 border-border/20" />
        </div>
      </div>

      {/* Add Custom Skills Banner */}
      <div className="flex items-center justify-between rounded-xl border border-border/20 bg-card/10 p-4">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-card/30 border border-border/20 flex items-center justify-center">
            <Sparkles className="h-5 w-5 text-muted-foreground/50" />
          </div>
          <div>
            <p className="text-sm font-semibold">Add custom Skills</p>
            <p className="text-xs text-muted-foreground/70">Add a skill to unlock new capabilities for your agent.</p>
          </div>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="gap-1.5 border-border/30 bg-card/20">
              <Plus className="h-3.5 w-3.5" /> Add <ChevronDown className="h-3 w-3" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuItem onClick={() => {
              onClose?.();
              navigate("/beebot?prefill=" + encodeURIComponent("Help me create a skill together using conversation. First ask me what the skill should do, then build it step by step. When we're done, save it to my skills."));
            }}>
              <Wand2 className="h-4 w-4 mr-2" />
              <div>
                <p className="text-sm font-medium">Build with BeeBot</p>
                <p className="text-[10px] text-muted-foreground">Build great skills through conversation</p>
              </div>
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => { setCreateMode("upload"); setShowCreateDialog(true); }}>
              <FileArchive className="h-4 w-4 mr-2" />
              <div>
                <p className="text-sm font-medium">Upload Skills</p>
                <p className="text-[10px] text-muted-foreground">.zip packages, .md files, or folders</p>
              </div>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Skills Grid */}
      {isLoading ? (
        <div className="text-center py-8 text-sm text-muted-foreground/50">Loading skills...</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 space-y-2">
          <Sparkles className="h-8 w-8 mx-auto text-muted-foreground/30" />
          <p className="text-sm text-muted-foreground/50">No skills yet</p>
          <p className="text-xs text-muted-foreground/40">Add a skill to unlock new agent capabilities</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {filtered.map((skill) => (
            <div
              key={skill.id}
              className="group rounded-xl border border-border/20 bg-card/10 p-4 space-y-2.5 hover:border-primary/20 hover:bg-card/20 transition-all duration-200 cursor-pointer"
              onClick={() => openSkillDetail(skill)}
            >
              <div className="flex items-start justify-between gap-2">
                <p className="text-sm font-semibold truncate flex-1">{skill.skill_name}</p>
                <Switch
                  checked={skill.is_active ?? true}
                  onCheckedChange={(checked) => toggleSkill.mutate({ id: skill.id, active: checked })}
                  onClick={(e) => e.stopPropagation()}
                  className="scale-90"
                />
              </div>
              <p className="text-xs text-muted-foreground/70 line-clamp-2">{skill.description}</p>
              <div className="flex items-center justify-between pt-1">
                <div className="flex items-center gap-2 text-[10px] text-muted-foreground/50">
                  {skill.created_by_agent ? (
                    <Badge variant="outline" className="text-[9px] h-4 px-1.5 border-primary/20 text-primary/70">AI Created</Badge>
                  ) : (
                    <Badge variant="outline" className="text-[9px] h-4 px-1.5 border-border/30">Custom</Badge>
                  )}
                  <span>·</span>
                  <span>{skill.created_at ? format(new Date(skill.created_at), "MMM d, yyyy") : ""}</span>
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="Skill actions"
                      className="h-9 w-9 lg:h-6 lg:w-6 lg:opacity-0 lg:group-hover:opacity-100 transition-opacity touch-manipulation active:scale-95 relative before:absolute before:-inset-1 before:content-[''] lg:before:hidden"
                    >
                      <MoreHorizontal className="h-4 w-4 lg:h-3.5 lg:w-3.5" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={(e) => { e.stopPropagation(); openSkillDetail(skill); }}>
                      <Eye className="h-3.5 w-3.5 mr-2" /> View Details
                    </DropdownMenuItem>
                    <DropdownMenuItem className="text-destructive" onClick={(e) => { e.stopPropagation(); deleteSkill.mutate(skill.id); }}>
                      <Trash2 className="h-3.5 w-3.5 mr-2" /> Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Skill Detail Dialog (hash-routed) */}
      <SkillDetailDialog
        skill={selectedSkill}
        open={!!selectedSkill}
        onOpenChange={(open) => { if (!open) closeSkillDetail(); }}
        onDelete={(id) => { deleteSkill.mutate(id); closeSkillDetail(); }}
        onToggle={(id, active) => toggleSkill.mutate({ id, active })}
        onUpdate={(id, data) => updateSkill.mutate({ id, data })}
      />

      {/* Create / Upload Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={(v) => { if (!v) resetForm(); setShowCreateDialog(v); }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{createMode === "manual" ? "Create Skill" : "Upload Skills"}</DialogTitle>
            <DialogDescription>
              {createMode === "manual"
                ? "Define a new skill that BeeBot can learn and use autonomously."
                : "Drop .zip skill packages or individual files to import."}
            </DialogDescription>
          </DialogHeader>

          {createMode === "manual" ? (
            <div className="space-y-4 pt-2">
              <div className="space-y-2">
                <Label className="text-xs">Skill Name</Label>
                <Input placeholder="e.g. video-generator" value={newName} onChange={(e) => setNewName(e.target.value)} className="bg-card/20 border-border/20" />
              </div>
              <div className="space-y-2">
                <Label className="text-xs">Description</Label>
                <Textarea placeholder="What should this skill do?" value={newDesc} onChange={(e) => setNewDesc(e.target.value)} className="bg-card/20 border-border/20 min-h-[80px] resize-none" />
              </div>
              <div className="space-y-2">
                <Label className="text-xs">Trigger Keywords <span className="text-muted-foreground/50">(comma separated)</span></Label>
                <Input placeholder="video, generate, create video" value={newKeywords} onChange={(e) => setNewKeywords(e.target.value)} className="bg-card/20 border-border/20" />
              </div>
              <Button onClick={handleCreateManual} disabled={createSkill.isPending} className="w-full">
                {createSkill.isPending ? "Creating..." : "Create Skill"}
              </Button>
            </div>
          ) : (
            <div className="space-y-4 pt-2">
              <SkillUploadZone onSkillsParsed={setParsedFolders} onMarkdownParsed={setMarkdownContent} isImporting={isImporting} />
              {markdownContent && (
                <div className="space-y-2">
                  <Label className="text-xs">Skill Content</Label>
                  <Textarea value={markdownContent} onChange={(e) => setMarkdownContent(e.target.value)} className="bg-card/20 border-border/20 min-h-[160px] font-mono text-xs resize-none" />
                </div>
              )}
              {parsedFolders.length > 0 ? (
                <Button onClick={handleImportFolders} disabled={isImporting} className="w-full">
                  {isImporting ? "Importing..." : `Import ${parsedFolders.length} Skill${parsedFolders.length > 1 ? "s" : ""}`}
                </Button>
              ) : markdownContent ? (
                <Button onClick={handleImportMarkdown} disabled={createSkill.isPending} className="w-full">
                  {createSkill.isPending ? "Importing..." : "Import Skill"}
                </Button>
              ) : null}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
