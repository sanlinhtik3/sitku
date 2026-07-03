import { memo, useEffect, useMemo, useRef, useState } from "react";
import ForceGraph2D, { type ForceGraphMethods } from "react-force-graph-2d";
import type { NoteFile } from "@/repositories/contracts/notes";

// Wikilink regex shared with NoteReader / KnowledgeWorkspacePage logic.
const WIKILINK = /\[\[([^[\]\r\n|]+)(?:\|[^[\]\r\n]*)?\]\]/g;

export interface GraphNote extends Pick<NoteFile, "path" | "title"> {
  content?: string;
}

export interface GraphViewProps {
  notes: GraphNote[];
  /** Active note path — that node is highlighted as the "you are here" pin. */
  activePath?: string | null;
  /** Resolves a wikilink target → note path (reuses resolveWikilinkTarget from page). */
  resolve: (target: string) => string | null;
  /** Click handler. Page wires this to openNotePath + close dialog. */
  onNodeClick: (path: string) => void;
  /** Theme override for canvas colors — falls back to data-bb-theme on <html>. */
  theme?: "dark" | "light";
}

type N = { id: string; title: string; degree: number; isActive: boolean };
type L = { source: string; target: string };

// Read the live tokens so the graph picks up the user's accent / theme without
// shipping our own color table. Falls back to sensible defaults during SSR.
function readTokens() {
  if (typeof window === "undefined") {
    return { accent: "#f4d35e", text1: "#ededed", text3: "#9b9b9b", border: "#1f1f1f", bg2: "#101010" };
  }
  const r = getComputedStyle(document.documentElement);
  const v = (k: string, d: string) => r.getPropertyValue(k).trim() || d;
  return {
    accent: v("--bb-accent", "#f4d35e"),
    text1:  v("--bb-text-1",  "#ededed"),
    text3:  v("--bb-text-3",  "#9b9b9b"),
    border: v("--bb-border",  "#1f1f1f"),
    bg2:    v("--bb-bg-2",    "#101010"),
  };
}

export const GraphView = memo(function GraphView({ notes, activePath, resolve, onNodeClick }: GraphViewProps) {
  const ref = useRef<ForceGraphMethods<N, L> | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const [size, setSize] = useState({ w: 800, h: 600 });
  const [hoverPath, setHoverPath] = useState<string | null>(null);
  const tokens = useMemo(readTokens, []);

  // ResizeObserver so the canvas fills whatever the dialog gives us.
  useEffect(() => {
    if (!wrapRef.current) return;
    const ro = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) setSize({ w: Math.round(entry.contentRect.width), h: Math.round(entry.contentRect.height) });
    });
    ro.observe(wrapRef.current);
    return () => ro.disconnect();
  }, []);

  // Build the directed graph from wikilinks. Degree = in+out so popular hubs
  // get bigger nodes naturally without us tracking backlinks separately.
  const { nodes, links } = useMemo(() => {
    const byPath = new Map<string, N>();
    for (const n of notes) {
      byPath.set(n.path, { id: n.path, title: n.title || n.path, degree: 0, isActive: n.path === activePath });
    }
    const ls: L[] = [];
    for (const n of notes) {
      if (!n.content) continue;
      WIKILINK.lastIndex = 0;
      let m: RegExpExecArray | null;
      const seenThisNote = new Set<string>();
      while ((m = WIKILINK.exec(n.content)) !== null) {
        const target = resolve(m[1].trim());
        if (!target || target === n.path) continue;
        const key = `${n.path}→${target}`;
        if (seenThisNote.has(key)) continue;
        seenThisNote.add(key);
        ls.push({ source: n.path, target });
        const src = byPath.get(n.path);
        const dst = byPath.get(target);
        if (src) src.degree += 1;
        if (dst) dst.degree += 1;
      }
    }
    return { nodes: [...byPath.values()], links: ls };
  }, [notes, activePath, resolve]);

  // Auto-zoom to fit after the layout settles. Without this the graph paints
  // top-left of the canvas and the user can't see anything.
  useEffect(() => {
    const t = setTimeout(() => ref.current?.zoomToFit(400, 60), 800);
    return () => clearTimeout(t);
  }, [nodes.length, links.length, size.w, size.h]);

  return (
    <div ref={wrapRef} className="relative h-full w-full overflow-hidden bg-[var(--bb-bg-1)]">
      {nodes.length === 0 ? (
        <div className="flex h-full items-center justify-center text-sm text-[var(--bb-text-4)]">No notes to visualize yet.</div>
      ) : (
        <ForceGraph2D<N, L>
          ref={ref}
          graphData={{ nodes, links }}
          width={size.w}
          height={size.h}
          backgroundColor="rgba(0,0,0,0)"
          // Visual encoding — degree drives radius (square-root scale so hubs
          // don't dominate the canvas), accent for active/hover.
          nodeRelSize={2}
          nodeVal={(n) => 1 + Math.sqrt(n.degree || 0) * 0.7}
          nodeColor={(n) => (n.isActive || n.id === hoverPath ? tokens.accent : tokens.text3)}
          nodeLabel={(n) => n.title}
          linkColor={() => tokens.border}
          linkWidth={(l) => {
            const sid = typeof l.source === "string" ? l.source : (l.source as N).id;
            const tid = typeof l.target === "string" ? l.target : (l.target as N).id;
            return (sid === hoverPath || tid === hoverPath || sid === activePath || tid === activePath) ? 1.5 : 0.6;
          }}
          linkDirectionalParticles={0}
          // Label rendering — uses canvas2d ctx so font features inherit from <html>.
          nodeCanvasObject={(n, ctx, globalScale) => {
            const x = (n as N & { x?: number }).x ?? 0;
            const y = (n as N & { y?: number }).y ?? 0;
            // Match nodeVal's sqrt scale so click-target geometry tracks the visible disk.
            const r = 2 + Math.sqrt(n.degree || 0) * 1.4;
            const isHi = n.isActive || n.id === hoverPath;
            // Soft glow for active/hover
            if (isHi) {
              ctx.beginPath();
              ctx.arc(x, y, r + 6, 0, Math.PI * 2);
              ctx.fillStyle = tokens.accent + "26"; // ~15% alpha hex tail
              ctx.fill();
            }
            ctx.beginPath();
            ctx.arc(x, y, r, 0, Math.PI * 2);
            ctx.fillStyle = isHi ? tokens.accent : tokens.text3;
            ctx.fill();
            // Labels — fontSize divided by globalScale keeps the rendered pixel
            // size CONSTANT regardless of zoom (canvas2d scales the font with the
            // viewport otherwise, ballooning text at zoomed-out states).
            const fontSize = 11 / globalScale;
            ctx.font = `${fontSize}px InterVariable, system-ui, sans-serif`;
            ctx.textAlign = "center";
            ctx.textBaseline = "top";
            ctx.fillStyle = isHi ? tokens.text1 : tokens.text3;
            ctx.fillText(n.title, x, y + r + 2);
          }}
          nodePointerAreaPaint={(n, color, ctx) => {
            const x = (n as N & { x?: number }).x ?? 0;
            const y = (n as N & { y?: number }).y ?? 0;
            const r = 2 + Math.sqrt(n.degree || 0) * 1.4 + 6;
            ctx.beginPath();
            ctx.arc(x, y, r, 0, Math.PI * 2);
            ctx.fillStyle = color;
            ctx.fill();
          }}
          onNodeHover={(n) => setHoverPath(n?.id ?? null)}
          onNodeClick={(n) => onNodeClick(n.id)}
          cooldownTicks={120}
          d3AlphaDecay={0.025}
          d3VelocityDecay={0.28}
        />
      )}
      {/* Legend / hint pinned bottom-right */}
      <div className="pointer-events-none absolute bottom-3 right-3 rounded-md bg-[var(--bb-bg-2)]/80 border border-[var(--bb-border)] px-2.5 py-1 text-[10.5px] text-[var(--bb-text-4)] backdrop-blur-sm">
        {nodes.length} notes · {links.length} links · click to open
      </div>
    </div>
  );
});

export default GraphView;
