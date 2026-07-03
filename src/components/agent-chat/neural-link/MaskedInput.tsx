import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Eye, EyeOff, Copy, Check } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface MaskedInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
}

export function MaskedInput({ value, onChange, placeholder, className, disabled }: MaskedInputProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      toast.success("Copied to clipboard");
      setTimeout(() => setCopied(false), 2000);
    } catch { toast.error("Failed to copy"); }
  };

  const maskedValue = value ? '•'.repeat(Math.min(value.length, 40)) : '';

  return (
    <div className={cn("relative flex gap-1", className)}>
      <div className="relative flex-1">
        <Input
          type={isVisible ? "text" : "password"}
          value={isVisible ? value : maskedValue}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          disabled={disabled}
          className="pr-2 font-mono text-sm bg-background/50 border-border/50 focus:border-primary/50"
        />
      </div>
      <Button type="button" variant="ghost" size="icon" onClick={() => setIsVisible(!isVisible)} disabled={disabled} className="h-10 w-10 shrink-0 hover:bg-muted">
        {isVisible ? <EyeOff className="h-4 w-4 text-muted-foreground" /> : <Eye className="h-4 w-4 text-muted-foreground" />}
      </Button>
      <Button type="button" variant="ghost" size="icon" onClick={handleCopy} disabled={disabled || !value} className="h-10 w-10 shrink-0 hover:bg-muted">
        {copied ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4 text-muted-foreground" />}
      </Button>
    </div>
  );
}
