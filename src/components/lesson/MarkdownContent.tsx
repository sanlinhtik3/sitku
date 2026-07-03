import React, { useCallback, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn } from "@/lib/utils";
import { Copy, Check } from "lucide-react";

interface MarkdownContentProps {
  content: string;
  className?: string;
}

const CopyButton = ({ text }: { text: string }) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback
      const ta = document.createElement("textarea");
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [text]);

  return (
    <button
      onClick={handleCopy}
      className="p-1 rounded-md text-muted-foreground/60 hover:text-foreground hover:bg-muted/30 transition-colors"
      aria-label="Copy code"
    >
      {copied ? <Check size={14} className="text-primary" /> : <Copy size={14} />}
    </button>
  );
};

const PreBlock = ({ children, ...props }: any) => {
  const codeText = extractText(children);

  return (
    <div className="relative my-3 overflow-hidden rounded-[var(--glass-radius-card)] bg-card/20 backdrop-blur-sm border border-border/20">
      <div className="flex items-center justify-between px-4 py-1.5 bg-muted/20 border-b border-border/20">
        <span className="text-[10px] text-muted-foreground/60 font-mono uppercase tracking-wider">code</span>
        <CopyButton text={codeText} />
      </div>
      <div className="overflow-x-auto p-4">
        <pre {...props} className="!bg-transparent !p-0 !m-0 !overflow-visible font-mono text-sm leading-relaxed">
          {children}
        </pre>
      </div>
    </div>
  );
};

function extractText(node: any): string {
  if (typeof node === "string") return node;
  if (Array.isArray(node)) return node.map(extractText).join("");
  if (node?.props?.children) return extractText(node.props.children);
  return "";
}

export const MarkdownContent = React.memo(({ content, className }: MarkdownContentProps) => {
  return (
    <div
      className={cn(
        "prose prose-sm dark:prose-invert max-w-none overflow-hidden",
        "prose-headings:font-semibold prose-headings:text-foreground",
        "prose-p:text-muted-foreground prose-p:leading-relaxed",
        "prose-a:text-primary prose-a:no-underline hover:prose-a:underline",
        "prose-strong:text-foreground prose-strong:font-semibold",
        "prose-blockquote:border-l-primary prose-blockquote:text-muted-foreground",
        "prose-ul:text-muted-foreground prose-ol:text-muted-foreground",
        "prose-li:marker:text-muted-foreground/60",
        className
      )}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          pre: PreBlock,
          code: ({ node, inline, className, children, ...props }: any) =>
            inline ? (
              <code className="rounded bg-muted/50 px-1.5 py-0.5 font-mono text-xs text-primary" {...props}>
                {children}
              </code>
            ) : (
              <code className="bg-transparent text-foreground font-mono text-sm leading-6" {...props}>
                {children}
              </code>
            ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
});
