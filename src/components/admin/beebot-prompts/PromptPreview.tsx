import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { IconRefresh, IconCopy, IconCheck } from "@tabler/icons-react";
import { toast } from "sonner";
import type { PromptFile } from "./types";
import { formatLocalDate } from "@/lib/dateUtils";

interface PromptPreviewProps {
  files: PromptFile[];
  onClose?: () => void;
}

// Sample variable values for preview
const SAMPLE_VARIABLES: Record<string, string> = {
  bot_name: "BeeBot",
  bot_emoji: "🐝",
  personality: "friendly",
  personality_style: "Be warm, encouraging, and use occasional emojis. Speak like a helpful friend.",
  personality_emoji_rule: "Use emojis sparingly for warmth",
  user_name: "Demo User",
  credit_balance: "50",
  current_date: formatLocalDate(),
  current_time: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
  is_admin: "false",
  trust_level: "2",
  trust_label: "Regular User",
  trust_level_num: "2",
  trust_permissions: "⚠️ I will confirm before executing write actions",
  memories: "- User is a freelancer\n- Prefers Burmese language",
  skills: "🎯 financial_analyst (Level 2/5): Active",
  api_source: "personal_key",
  model_used: "gemini-3.5-flash",
  using_personal_key: "true",
  recent_transactions: "5",
  most_active_feature: "FlowState",
  workspaces: "2",
  enrolled_courses: "3",
  ai_content_count: "15",
};

function processConditionals(content: string, variables: Record<string, string>): string {
  // Process {{#if variable}}...{{/if}} blocks
  let result = content;
  
  const ifRegex = /\{\{#if\s+(\w+)\}\}([\s\S]*?)\{\{\/if\}\}/g;
  result = result.replace(ifRegex, (match, varName, innerContent) => {
    const value = variables[varName];
    if (value && value !== "false" && value !== "0" && value !== "") {
      return innerContent;
    }
    return "";
  });

  // Process {{#unless variable}}...{{/unless}} blocks
  const unlessRegex = /\{\{#unless\s+(\w+)\}\}([\s\S]*?)\{\{\/unless\}\}/g;
  result = result.replace(unlessRegex, (match, varName, innerContent) => {
    const value = variables[varName];
    if (!value || value === "false" || value === "0" || value === "") {
      return innerContent;
    }
    return "";
  });

  return result;
}

function replaceVariables(content: string, variables: Record<string, string>): string {
  // First process conditionals
  let result = processConditionals(content, variables);
  
  // Then replace simple variables
  result = result.replace(/\{\{(\w+)\}\}/g, (match, varName) => {
    return variables[varName] || match;
  });
  
  return result;
}

export function PromptPreview({ files, onClose }: PromptPreviewProps) {
  const [copied, setCopied] = useState(false);
  const [showRaw, setShowRaw] = useState(false);

  const activeFiles = useMemo(() => 
    files.filter(f => f.is_active).sort((a, b) => a.order_index - b.order_index),
    [files]
  );

  const assembledPrompt = useMemo(() => {
    return activeFiles
      .map(f => {
        const processed = replaceVariables(f.content, SAMPLE_VARIABLES);
        return `═══ ${f.display_name.toUpperCase()} ═══\n\n${processed}`;
      })
      .join("\n\n");
  }, [activeFiles]);

  const rawPrompt = useMemo(() => {
    return activeFiles
      .map(f => `═══ ${f.display_name.toUpperCase()} ═══\n\n${f.content}`)
      .join("\n\n");
  }, [activeFiles]);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(showRaw ? rawPrompt : assembledPrompt);
    setCopied(true);
    toast.success("Copied to clipboard");
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="flex flex-col h-full border-l border-border/50 bg-card/30">
      {/* Header */}
      <div className="flex items-center justify-between p-3 border-b border-border/50">
        <div className="flex items-center gap-2">
          <h3 className="font-semibold text-sm">Preview</h3>
          <Badge variant="secondary" className="text-xs">
            {activeFiles.length} files
          </Badge>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => setShowRaw(!showRaw)}>
            {showRaw ? "Processed" : "Raw"}
          </Button>
          <Button variant="ghost" size="sm" onClick={handleCopy}>
            {copied ? <IconCheck className="size-4" /> : <IconCopy className="size-4" />}
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="assembled" className="flex-1 flex flex-col">
        <TabsList className="mx-3 mt-2">
          <TabsTrigger value="assembled" className="text-xs">Assembled</TabsTrigger>
          <TabsTrigger value="files" className="text-xs">By File</TabsTrigger>
        </TabsList>

        <TabsContent value="assembled" className="flex-1 m-0">
          <ScrollArea className="h-[calc(100vh-280px)]">
            <pre className="p-3 text-xs font-mono whitespace-pre-wrap text-muted-foreground">
              {showRaw ? rawPrompt : assembledPrompt}
            </pre>
          </ScrollArea>
        </TabsContent>

        <TabsContent value="files" className="flex-1 m-0">
          <ScrollArea className="h-[calc(100vh-280px)]">
            <div className="p-3 space-y-4">
              {activeFiles.map((file, idx) => (
                <div key={file.id} className="border border-border/50 rounded-lg overflow-hidden">
                  <div className="flex items-center justify-between p-2 bg-muted/30">
                    <span className="text-xs font-medium">
                      {idx + 1}. {file.display_name}
                    </span>
                    <Badge variant="outline" className="text-[10px]">
                      {file.file_type}
                    </Badge>
                  </div>
                  <pre className="p-2 text-xs font-mono whitespace-pre-wrap text-muted-foreground bg-background/50 max-h-[200px] overflow-auto">
                    {showRaw ? file.content : replaceVariables(file.content, SAMPLE_VARIABLES)}
                  </pre>
                </div>
              ))}
            </div>
          </ScrollArea>
        </TabsContent>
      </Tabs>

      {/* Stats */}
      <div className="p-2 border-t border-border/50 text-xs text-muted-foreground">
        Total: {(showRaw ? rawPrompt : assembledPrompt).length.toLocaleString()} chars
      </div>
    </div>
  );
}
