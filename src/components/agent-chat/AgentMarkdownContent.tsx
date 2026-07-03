import React, { memo } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn } from "@/lib/utils";
import { Copy, Check } from "lucide-react";
import { useState, useCallback } from "react";
import { CitationChip } from "./citations/CitationChip";

// ═══ UTILITIES ═══

function extractText(node: any): string {
  if (typeof node === "string") return node;
  if (Array.isArray(node)) return node.map(extractText).join("");
  if (node?.props?.children) return extractText(node.props.children);
  return "";
}

function getChildrenText(children: any): string {
  return extractText(children);
}

// Pattern detection
function isCurrency(text: string): "positive" | "negative" | null {
  const trimmed = text.trim();
  if (/^\$[\d,.]+/.test(trimmed) || /^[\d,.]+\s*(USD|MMK|BTC|ETH|SOL)$/i.test(trimmed)) {
    return "positive";
  }
  if (/^-\$[\d,.]+/.test(trimmed) || /^-[\d,.]+\s*(USD|MMK|BTC|ETH|SOL)$/i.test(trimmed)) {
    return "negative";
  }
  return null;
}

function isPercentage(text: string): "up" | "down" | "neutral" | null {
  const match = text.trim().match(/^([+-]?)([\d.]+)%$/);
  if (!match) return null;
  const sign = match[1];
  const val = parseFloat(match[2]);
  if (sign === "-" || val < 0) return "down";
  if (sign === "+" || val > 0) return "up";
  return "neutral";
}

const STATUS_LABELS = ["support", "resistance", "bullish", "bearish", "breakout", "breakdown", "buy", "sell", "hold", "long", "short", "neutral", "strong", "weak", "active", "inactive", "completed", "pending", "success", "failed", "error", "warning", "critical", "high", "medium", "low"];

function isBadgeLabel(text: string): string | null {
  const lower = text.trim().toLowerCase();
  if (STATUS_LABELS.includes(lower)) return lower;
  return null;
}

function getBadgeColor(label: string): string {
  const greens = ["support", "bullish", "breakout", "buy", "long", "strong", "active", "completed", "success"];
  const reds = ["resistance", "bearish", "breakdown", "sell", "short", "weak", "failed", "error", "critical"];
  const ambers = ["hold", "neutral", "pending", "warning", "medium"];
  if (greens.includes(label)) return "bg-emerald-500/15 text-emerald-400 border-emerald-500/20";
  if (reds.includes(label)) return "bg-red-500/15 text-red-400 border-red-500/20";
  if (ambers.includes(label)) return "bg-amber-500/15 text-amber-400 border-amber-500/20";
  return "bg-muted/30 text-muted-foreground border-border/30";
}

// Leading emoji detection for list items
const INDICATOR_EMOJIS: Record<string, string> = {
  "⚠️": "border-l-amber-400 bg-amber-500/5",
  "🟢": "border-l-emerald-400 bg-emerald-500/5",
  "🔴": "border-l-red-400 bg-red-500/5",
  "🔵": "border-l-blue-400 bg-blue-500/5",
  "🟡": "border-l-amber-400 bg-amber-500/5",
  "✅": "border-l-emerald-400 bg-emerald-500/5",
  "❌": "border-l-red-400 bg-red-500/5",
  "💡": "border-l-yellow-400 bg-yellow-500/5",
  "📊": "border-l-blue-400 bg-blue-500/5",
  "🎯": "border-l-primary bg-primary/5",
  "⭐": "border-l-amber-400 bg-amber-500/5",
};

// ═══ COPY BUTTON ═══
const CopyButton = ({ text }: { text: string }) => {
  const [copied, setCopied] = useState(false);
  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [text]);

  return (
    <button onClick={handleCopy} className="p-1 rounded-md text-muted-foreground/60 hover:text-foreground hover:bg-muted/30 transition-colors" aria-label="Copy code">
      {copied ? <Check size={14} className="text-primary" /> : <Copy size={14} />}
    </button>
  );
};

// ═══ CODE BLOCK ═══
const PreBlock = ({ children, ...props }: any) => {
  const codeText = extractText(children);
  return (
    <div className="relative my-3 overflow-hidden rounded-xl bg-card/20 backdrop-blur-sm border border-border/20">
      <div className="flex items-center justify-between px-4 py-1.5 bg-muted/20 border-b border-border/20">
        <span className="text-[10px] text-muted-foreground/60 font-mono uppercase tracking-wider">code</span>
        <CopyButton text={codeText} />
      </div>
      <div className="overflow-x-auto p-4">
        <pre {...props} className="!bg-transparent !p-0 !m-0 !overflow-visible font-mono text-sm leading-relaxed">{children}</pre>
      </div>
    </div>
  );
};

// ═══ SMART TABLE CELL ═══
const SmartTd = ({ children, ...props }: any) => {
  const text = getChildrenText(children);

  // Currency detection
  const currency = isCurrency(text);
  if (currency) {
    return (
      <td {...props} className="px-3 py-2 border-b border-border/10 text-xs">
        <span className={cn("font-mono font-medium", currency === "positive" ? "text-emerald-400" : "text-red-400")}>
          {children}
        </span>
      </td>
    );
  }

  // Percentage detection
  const pct = isPercentage(text);
  if (pct) {
    return (
      <td {...props} className="px-3 py-2 border-b border-border/10 text-xs">
        <span className={cn(
          "inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[11px] font-mono font-medium",
          pct === "up" ? "bg-emerald-500/10 text-emerald-400" :
          pct === "down" ? "bg-red-500/10 text-red-400" :
          "bg-muted/30 text-muted-foreground"
        )}>
          {children}
        </span>
      </td>
    );
  }

  // Badge label detection
  const badge = isBadgeLabel(text);
  if (badge) {
    return (
      <td {...props} className="px-3 py-2 border-b border-border/10 text-xs">
        <span className={cn("inline-flex px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wide border", getBadgeColor(badge))}>
          {children}
        </span>
      </td>
    );
  }

  return <td {...props} className="px-3 py-2 border-b border-border/10 text-xs text-muted-foreground">{children}</td>;
};

// ═══ SMART LIST ITEM ═══
const SmartLi = ({ children, ...props }: any) => {
  const text = getChildrenText(children);
  let indicatorClass: string | null = null;

  for (const [emoji, cls] of Object.entries(INDICATOR_EMOJIS)) {
    if (text.trimStart().startsWith(emoji)) {
      indicatorClass = cls;
      break;
    }
  }

  if (indicatorClass) {
    return (
      <li {...props} className={cn("border-l-2 pl-3 py-1 my-1 rounded-r-md list-none", indicatorClass)}>
        {children}
      </li>
    );
  }

  return <li {...props} className="text-muted-foreground">{children}</li>;
};

// ═══ SMART STRONG ═══
const SmartStrong = ({ children, ...props }: any) => {
  const text = getChildrenText(children);

  // Score pattern: "8.5" or "6/10"
  const scoreMatch = text.match(/^(\d+\.?\d*)\s*\/\s*(\d+)$/) || text.match(/^(\d+\.?\d*)\s*out of\s*(\d+)$/i);
  if (scoreMatch) {
    const score = parseFloat(scoreMatch[1]);
    const max = parseFloat(scoreMatch[2]);
    const pct = (score / max) * 100;
    const color = pct >= 70 ? "text-emerald-400 bg-emerald-500/10" : pct >= 40 ? "text-amber-400 bg-amber-500/10" : "text-red-400 bg-red-500/10";
    return (
      <strong {...props} className={cn("inline-flex items-center gap-1.5 px-2 py-0.5 rounded-lg text-sm font-bold", color)}>
        {children}
      </strong>
    );
  }

  return <strong {...props} className="text-foreground font-semibold">{children}</strong>;
};

// ═══ MAIN COMPONENT ═══
interface AgentMarkdownContentProps {
  content: string;
  className?: string;
}

export const AgentMarkdownContent = memo(function AgentMarkdownContent({ content, className }: AgentMarkdownContentProps) {
  return (
    <div className={cn(
      "prose prose-sm dark:prose-invert max-w-none overflow-hidden",
      "prose-headings:font-semibold prose-headings:text-foreground",
      "prose-p:text-muted-foreground prose-p:leading-relaxed",
      "prose-a:text-primary prose-a:no-underline hover:prose-a:underline",
      "prose-strong:text-foreground prose-strong:font-semibold",
      "prose-blockquote:border-l-primary prose-blockquote:text-muted-foreground",
      "prose-ul:text-muted-foreground prose-ol:text-muted-foreground",
      "prose-li:marker:text-muted-foreground/60",
      className,
    )}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          // Code blocks
          pre: PreBlock,
          code: ({ node, inline, className: codeClass, children, ...props }: any) =>
            inline ? (
              <code className="rounded bg-muted/50 px-1.5 py-0.5 font-mono text-xs text-primary" {...props}>{children}</code>
            ) : (
              <code className="bg-transparent text-foreground font-mono text-sm leading-6" {...props}>{children}</code>
            ),

          // Section headers — uppercase tracked
          h2: ({ children, ...props }: any) => (
            <h2 {...props} className="text-[11px] font-bold uppercase tracking-[0.1em] text-foreground/90 border-b border-border/20 pb-2 mb-3 mt-5">
              {children}
            </h2>
          ),
          h3: ({ children, ...props }: any) => (
            <h3 {...props} className="text-xs font-bold uppercase tracking-[0.06em] text-foreground/80 mb-2 mt-4">
              {children}
            </h3>
          ),

          // Tables — glassmorphic
          table: ({ children, ...props }: any) => (
            <div className="my-3 rounded-xl overflow-hidden border border-border/20 bg-white/[0.02] backdrop-blur-sm">
              <div className="overflow-x-auto">
                <table {...props} className="w-full border-collapse text-xs">{children}</table>
              </div>
            </div>
          ),
          thead: ({ children, ...props }: any) => (
            <thead {...props} className="bg-muted/15">{children}</thead>
          ),
          th: ({ children, ...props }: any) => (
            <th {...props} className="px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.06em] text-muted-foreground/70 text-left border-b border-border/20">
              {children}
            </th>
          ),
          tr: ({ children, ...props }: any) => (
            <tr {...props} className="hover:bg-white/[0.03] transition-colors">{children}</tr>
          ),
          td: SmartTd,

          // Blockquotes — insight cards
          blockquote: ({ children, ...props }: any) => (
            <blockquote {...props} className="my-3 border-l-2 border-primary/50 bg-primary/[0.03] rounded-r-lg px-4 py-3 backdrop-blur-sm not-italic">
              {children}
            </blockquote>
          ),

          // Lists
          ul: ({ children, ...props }: any) => (
            <ul {...props} className="space-y-0.5 text-muted-foreground text-sm">{children}</ul>
          ),
          ol: ({ children, ...props }: any) => (
            <ol {...props} className="space-y-0.5 text-muted-foreground text-sm">{children}</ol>
          ),
          li: SmartLi,

          // Dividers — gradient
          hr: (props: any) => (
            <hr {...props} className="my-4 border-0 h-px bg-gradient-to-r from-transparent via-border/40 to-transparent" />
          ),

          // Links — external HTTP(S) URLs become inline citation chips with
          // favicon + hover preview. Same-page anchors / mailto / relative
          // links keep the standard prose-a styling.
          a: ({ node, href, children, ...props }: any) => {
            const isExternal = typeof href === "string" && /^https?:\/\//i.test(href);
            if (isExternal) {
              return <CitationChip href={href}>{children}</CitationChip>;
            }
            return (
              <a href={href} {...props} className="text-primary hover:underline">
                {children}
              </a>
            );
          },

          // Smart strong
          strong: SmartStrong,
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
});
