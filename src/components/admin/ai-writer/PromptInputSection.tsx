import { forwardRef, memo } from "react";

interface PromptInputSectionProps {
  defaultValue: string;
  onChange: () => void;
  disabled?: boolean;
}

export const PromptInputSection = memo(forwardRef<HTMLTextAreaElement, PromptInputSectionProps>(
  ({ defaultValue, onChange, disabled }, ref) => {
    return (
      <div className="bg-card/20 backdrop-blur-xl border border-white/[0.06] rounded-t-2xl rounded-b-none px-3 py-2.5 sm:px-4 sm:py-3 shadow-lg shadow-black/5 focus-within:border-primary/40 focus-within:ring-1 focus-within:ring-primary/20 focus-within:shadow-primary/5 transition-all duration-200">
        <textarea
          id="ai-prompt"
          ref={ref}
          defaultValue={defaultValue}
          onChange={onChange}
          placeholder="Describe the content you want to create..."
          className="w-full bg-transparent border-none outline-none resize-none text-sm placeholder:text-muted-foreground/50 min-h-[100px] sm:min-h-[140px] lg:min-h-[180px]"
          disabled={disabled}
          aria-label="Enter your content prompt"
        />
      </div>
    );
  }
));

PromptInputSection.displayName = "PromptInputSection";
