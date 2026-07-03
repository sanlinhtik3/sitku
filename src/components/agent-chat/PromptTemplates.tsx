import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Zap } from "lucide-react";

interface PromptTemplatesProps {
  onSelect: (text: string) => void;
  filter?: string;
  onClose?: () => void;
}

export function PromptTemplates({ onSelect, filter, onClose }: PromptTemplatesProps) {
  const [open, setOpen] = useState(!!filter);
  const [templates, setTemplates] = useState<{ id: string; title: string; prompt_text: string }[]>([]);

  useEffect(() => {
    if (!open && !filter) return;
    const fetchTemplates = async () => {
      const { data } = await supabase.from("agent_prompt_templates").select("*").order("usage_count", { ascending: false }).limit(10);
      setTemplates((data as any[]) || []);
    };
    fetchTemplates();
  }, [open, filter]);

  const handleSelect = (text: string) => {
    onSelect(text);
    setOpen(false);
    onClose?.();
  };

  const handleOpenChange = (v: boolean) => {
    setOpen(v);
    if (!v) onClose?.();
  };

  return (
    <Popover open={open || !!filter} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-amber-500 rounded-full" title="Quick Templates">
          <Zap className="h-4 w-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="start" side="top">
        <Command>
          <CommandInput placeholder="Search templates..." className="border-none focus:ring-0" defaultValue={filter} />
          <CommandList>
            <CommandEmpty>No templates found.</CommandEmpty>
            <CommandGroup heading="Quick Actions">
              {templates.map((tpl) => (
                <CommandItem
                  key={tpl.id}
                  value={tpl.title}
                  onSelect={() => {
                    handleSelect(tpl.prompt_text);
                    (supabase as any).rpc('increment_template_usage', { template_id: tpl.id }).catch((err: any) => console.warn('Template usage track failed:', err));
                  }}
                  className="flex flex-col items-start gap-1 py-2 cursor-pointer"
                >
                  <span className="font-medium text-sm">{tpl.title}</span>
                  <span className="text-xs text-muted-foreground truncate w-full">{tpl.prompt_text}</span>
                </CommandItem>
              ))}
              
              {templates.length === 0 && (
                <>
                  <CommandItem onSelect={() => handleSelect("Summarize this text in 3 bullet points:\n")}>
                    <span className="font-medium text-sm">Summarize text</span>
                  </CommandItem>
                  <CommandItem onSelect={() => handleSelect("Translate the following into fluent Burmese:\n")}>
                    <span className="font-medium text-sm">Translate to Burmese</span>
                  </CommandItem>
                </>
              )}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
