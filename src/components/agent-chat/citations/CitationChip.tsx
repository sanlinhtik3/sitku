import { memo, useState, type ReactNode } from "react";
import { ExternalLink, Globe } from "lucide-react";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { cn } from "@/lib/utils";
import { getFaviconUrl, getDisplayHostname } from "@/lib/favicon";

interface CitationChipProps {
  href: string;
  /** Visible text inside the chip. If it's a long URL or matches the href, we
   *  show just the hostname instead — that's the natural "citation" feel. */
  children?: ReactNode;
  /** When true, the children are forced to the hostname even if visible text
   *  was more descriptive (used for bare-URL detections). */
  forceHostnameLabel?: boolean;
}

/**
 * Inline citation pill used inside agent prose. Renders as: `[favicon] hostname ↗`
 * with a hover popover showing the full URL + an "Open in new tab" link. The
 * chip itself is the link — clicking opens the source in a new tab.
 *
 * Designed to drop into a markdown `<a>` override so any link the model emits
 * automatically gets the citation treatment when the URL is external.
 */
function FaviconImage({ url }: { url: string }) {
  const [errored, setErrored] = useState(false);
  const src = getFaviconUrl(url, 32);
  if (!src || errored) {
    return <Globe className="h-2.5 w-2.5 text-muted-foreground/70" />;
  }
  return (
    <img
      src={src}
      alt=""
      width={12}
      height={12}
      loading="lazy"
      decoding="async"
      onError={() => setErrored(true)}
      className="h-3 w-3 rounded-[2px]"
    />
  );
}

export const CitationChip = memo(function CitationChip({
  href,
  children,
  forceHostnameLabel,
}: CitationChipProps) {
  const hostname = getDisplayHostname(href);

  // Decide what to show inside the chip. If the visible text is essentially
  // the URL itself, we replace it with the hostname. Otherwise we keep the
  // descriptive text — that's how Claude.ai handles it.
  const childrenText = typeof children === "string" ? children : "";
  const looksLikeUrl = !!childrenText && /^https?:\/\//i.test(childrenText.trim());
  const useHostname = forceHostnameLabel || looksLikeUrl || !childrenText;

  return (
    <HoverCard openDelay={120} closeDelay={120}>
      <HoverCardTrigger asChild>
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className={cn(
            // `not-prose` escapes the parent .prose anchor styles so our
            // colours/borders aren't overridden by Tailwind Typography.
            "not-prose",
            "inline-flex items-center gap-1 px-1.5 py-[1px] mx-[1px] align-baseline",
            "rounded-[5px] border border-emerald-400/20",
            "bg-emerald-400/[0.06] hover:bg-emerald-400/[0.12]",
            "text-[11px] leading-[1.2] !text-emerald-300/90 hover:!text-emerald-200",
            "no-underline transition-colors",
            "decoration-none",
          )}
        >
          <FaviconImage url={href} />
          <span className="truncate max-w-[180px]">
            {useHostname ? hostname || "source" : children}
          </span>
          <ExternalLink className="h-2 w-2 opacity-50 shrink-0" />
        </a>
      </HoverCardTrigger>
      <HoverCardContent
        side="top"
        align="start"
        sideOffset={6}
        className="w-80 p-0 border-border/30 bg-card/95 backdrop-blur-xl shadow-2xl"
      >
        <CitationPreview href={href} label={typeof children === "string" ? children : undefined} />
      </HoverCardContent>
    </HoverCard>
  );
});

const CitationPreview = memo(function CitationPreview({
  href,
  label,
}: {
  href: string;
  label?: string;
}) {
  const hostname = getDisplayHostname(href);
  return (
    <div className="p-3">
      <div className="flex items-center gap-2 mb-2">
        <FaviconImage url={href} />
        <span className="text-[11px] text-emerald-400/85 truncate">{hostname || href}</span>
      </div>
      {label && label !== href && (
        <p className="text-[12px] text-foreground/90 line-clamp-2 leading-relaxed mb-2">
          {label}
        </p>
      )}
      <div className="text-[10px] text-muted-foreground/60 break-all line-clamp-2 font-mono">
        {href}
      </div>
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-2 inline-flex items-center gap-1 text-[11px] text-primary hover:text-primary/80 transition-colors"
      >
        Open in new tab
        <ExternalLink className="h-2.5 w-2.5" />
      </a>
    </div>
  );
});
