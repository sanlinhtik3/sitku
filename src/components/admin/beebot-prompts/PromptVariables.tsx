import { useState } from "react";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { IconSearch, IconCopy, IconCheck } from "@tabler/icons-react";
import { toast } from "sonner";
import { PROMPT_VARIABLES } from "./types";

interface PromptVariablesProps {
  onInsert?: (variable: string) => void;
}

export function PromptVariables({ onInsert }: PromptVariablesProps) {
  const [search, setSearch] = useState("");
  const [copiedVar, setCopiedVar] = useState<string | null>(null);

  const filteredVariables = PROMPT_VARIABLES.filter(v =>
    v.name.toLowerCase().includes(search.toLowerCase()) ||
    v.description.toLowerCase().includes(search.toLowerCase())
  );

  const handleCopy = async (varName: string) => {
    const text = `{{${varName}}}`;
    await navigator.clipboard.writeText(text);
    setCopiedVar(varName);
    toast.success(`Copied: ${text}`);
    onInsert?.(text);
    setTimeout(() => setCopiedVar(null), 2000);
  };

  // Group by source
  const groupedVars = filteredVariables.reduce((acc, v) => {
    if (!acc[v.source]) acc[v.source] = [];
    acc[v.source].push(v);
    return acc;
  }, {} as Record<string, typeof PROMPT_VARIABLES>);

  return (
    <div className="flex flex-col h-full">
      {/* Search */}
      <div className="p-3 border-b border-border/50">
        <div className="relative">
          <IconSearch className="absolute left-2 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <Input
            placeholder="Search variables..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8 h-8 text-sm"
          />
        </div>
      </div>

      {/* Variable List */}
      <ScrollArea className="flex-1">
        <div className="p-3 space-y-4">
          {Object.entries(groupedVars).map(([source, vars]) => (
            <div key={source}>
              <div className="text-xs font-medium text-muted-foreground uppercase mb-2">
                {source}
              </div>
              <div className="space-y-1">
                {vars.map(v => (
                  <button
                    key={v.name}
                    onClick={() => handleCopy(v.name)}
                    className="w-full flex items-start gap-2 p-2 rounded-md hover:bg-muted/50 text-left transition-colors group"
                  >
                    <code className="text-xs font-mono text-primary bg-primary/10 px-1.5 py-0.5 rounded">
                      {`{{${v.name}}}`}
                    </code>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-foreground truncate">{v.description}</p>
                      {v.example && (
                        <p className="text-[10px] text-muted-foreground truncate">
                          e.g., {v.example}
                        </p>
                      )}
                    </div>
                    <div className="opacity-0 group-hover:opacity-100 transition-opacity">
                      {copiedVar === v.name ? (
                        <IconCheck className="size-4 text-green-500" />
                      ) : (
                        <IconCopy className="size-4 text-muted-foreground" />
                      )}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </ScrollArea>

      {/* Info */}
      <div className="p-2 border-t border-border/50 text-xs text-muted-foreground">
        <p>Click to copy • {PROMPT_VARIABLES.length} variables</p>
      </div>
    </div>
  );
}
