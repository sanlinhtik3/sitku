import { memo, useState } from "react";
import { ChevronDown } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

interface OptionsGridProps {
  tone: string;
  setTone: (value: string) => void;
  style: string;
  setStyle: (value: string) => void;
  language: string;
  setLanguage: (value: string) => void;
  disabled?: boolean;
}

const toneOptions = [
  { value: "professional", label: "Professional" },
  { value: "casual", label: "Casual" },
  { value: "friendly", label: "Friendly" },
  { value: "formal", label: "Formal" },
  { value: "inspiring", label: "Inspiring" },
  { value: "tough-love", label: "Tough Love" },
];

const styleOptions = [
  { value: "blog post", label: "Blog Post" },
  { value: "article", label: "Article" },
  { value: "tutorial", label: "Tutorial" },
  { value: "script", label: "Script" },
  { value: "announcement", label: "Announcement" },
  { value: "news", label: "News" },
  { value: "storytelling", label: "Storytelling" },
  { value: "persuasive", label: "Persuasive" },
  { value: "informative", label: "Informative" },
];

const languageOptions = [
  { value: "myanmar", label: "Myanmar" },
  { value: "english", label: "English" },
];

interface ChipSelectorProps {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
  disabled?: boolean;
}

const ChipSelector = ({ label, value, options, onChange, disabled }: ChipSelectorProps) => {
  const [open, setOpen] = useState(false);
  const selectedLabel = options.find(o => o.value === value)?.label || value;
  
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild disabled={disabled}>
        <button
          className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-muted/50 hover:bg-muted/80 text-xs text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          aria-label={`Select ${label}`}
        >
          <span className="text-[10px] text-muted-foreground/60 mr-0.5">{label}:</span>
          <span className="font-medium text-foreground/80">{selectedLabel}</span>
          <ChevronDown className="h-3 w-3 opacity-50" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-40 p-1.5 bg-card/95 backdrop-blur-xl border-border/30" align="start">
        <div className="flex flex-col gap-0.5">
          {options.map((option) => (
            <button
              key={option.value}
              onClick={() => { onChange(option.value); setOpen(false); }}
              className={`text-left px-2.5 py-1.5 rounded-lg text-xs transition-colors ${
                value === option.value
                  ? "bg-primary/15 text-primary font-medium"
                  : "hover:bg-muted/50 text-foreground/80"
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
};

export const OptionsGrid = memo(({ 
  tone, 
  setTone, 
  style, 
  setStyle, 
  language, 
  setLanguage,
  disabled 
}: OptionsGridProps) => {
  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      <ChipSelector label="Tone" value={tone} options={toneOptions} onChange={setTone} disabled={disabled} />
      <ChipSelector label="Style" value={style} options={styleOptions} onChange={setStyle} disabled={disabled} />
      <ChipSelector label="Lang" value={language} options={languageOptions} onChange={setLanguage} disabled={disabled} />
    </div>
  );
});

OptionsGrid.displayName = "OptionsGrid";
