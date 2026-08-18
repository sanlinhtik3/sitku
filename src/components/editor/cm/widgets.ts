import { type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { WidgetType, type EditorView } from "@codemirror/view";
import { getAttachment } from "@/repositories/local/attachmentStore";

// ── Live-preview decorations (Obsidian-style) ──────────────────────────────
// Render an unordered list "-"/"*"/"+" marker as a real bullet glyph.
export class BulletWidget extends WidgetType {
  eq() { return true; }
  get estimatedHeight(): number { return 20; }
  toDOM() {
    const span = document.createElement("span");
    span.className = "cm-bullet";
    span.textContent = "•";
    return span;
  }
}

// Render a task "[ ]" / "[x]" marker as a checkbox glyph.
export class TaskWidget extends WidgetType {
  constructor(readonly checked: boolean) { super(); }
  eq(other: TaskWidget) { return other.checked === this.checked; }
  get estimatedHeight(): number { return 20; }
  toDOM() {
    const span = document.createElement("span");
    span.className = this.checked ? "cm-task cm-task-done" : "cm-task";
    if (this.checked) {
      span.innerHTML = `<span style="display:inline-flex; align-items:center; justify-content:center; height:17px; width:17px; border:1.5px solid var(--beebot-accent, #f4d35e); background:var(--beebot-accent, #f4d35e); border-radius:50%; margin-right:8px; vertical-align:-3px; color:#000; font-size:11px; font-weight:700;">✓</span>`;
    } else {
      span.innerHTML = `<span style="display:inline-block; height:17px; width:17px; border:1.5px solid #6a6a6c; border-radius:50%; margin-right:8px; vertical-align:-3px;"></span>`;
    }
    return span;
  }
}

// Render a thematic break "---" / "***" / "___" as a horizontal rule line.
export class HrWidget extends WidgetType {
  eq() { return true; }
  get estimatedHeight(): number { return 24; }
  toDOM() {
    const span = document.createElement("span");
    span.className = "cm-hr";
    span.style.display = "inline-flex";
    span.style.width = "100%";
    span.innerHTML = `<div style="width: 100%; border-top: 1px solid #262628;"></div>`;
    return span;
  }
}

// Render `![alt](src)` inline as the actual image (or a file chip for PDFs/other),
// Obsidian-style — only off the caret line, so the raw markdown reveals for editing.
type AttachmentMeta = { kind: "image" | "file"; url: string; name: string };
const attachmentMetaCache = new Map<string, AttachmentMeta>();

export class ImageWidget extends WidgetType {
  constructor(readonly src: string, readonly alt: string) { super(); }
  eq(other: ImageWidget) { return other.src === this.src && other.alt === this.alt; }
  get estimatedHeight(): number { return 250; }
  private mediaFor(meta: AttachmentMeta): HTMLElement {
    if (meta.kind === "image") {
      const img = document.createElement("img");
      img.className = "cm-inline-image";
      img.src = meta.url;
      img.alt = this.alt || meta.name;
      return img;
    }
    return this.chip(`📄 ${meta.name || "file"}`);
  }
  private chip(label: string): HTMLElement {
    const span = document.createElement("span");
    span.className = "cm-file-chip";
    span.textContent = label;
    span.setAttribute("role", "img");
    span.setAttribute("aria-label", label);
    return span;
  }
  toDOM() {
    const wrap = document.createElement("span");
    wrap.className = "cm-inline-media";
    if (!this.src.startsWith("attachment:")) {
      const img = document.createElement("img");
      img.className = "cm-inline-image";
      img.src = this.src;
      img.alt = this.alt;
      wrap.appendChild(img);
      return wrap;
    }
    const id = this.src.slice("attachment:".length);
    const cached = attachmentMetaCache.get(id);
    if (cached) { wrap.appendChild(this.mediaFor(cached)); return wrap; }
    void getAttachment(id).then((data) => {
      if (!data) { wrap.appendChild(this.chip("⚠ attachment missing")); return; }
      const meta: AttachmentMeta = {
        kind: data.type.startsWith("image/") ? "image" : "file",
        url: data.url,
        name: data.name || this.alt,
      };
      attachmentMetaCache.set(id, meta);
      wrap.appendChild(this.mediaFor(meta));
    }).catch(() => {});
    return wrap;
  }
}

export class CalloutHeaderWidget extends WidgetType {
  constructor(readonly type: string) { super(); }
  eq(other: CalloutHeaderWidget) { return this.type.toLowerCase() === other.type.toLowerCase(); }
  get estimatedHeight(): number { return 26; }
  toDOM() {
    const span = document.createElement("span");
    span.className = "cm-callout-header";
    const t = this.type.toLowerCase();
    const icon = t === "note" || t === "info" ? "📝" :
                 t === "tip" || t === "hint" || t === "suggestion" ? "💡" :
                 t === "warning" || t === "caution" || t === "attention" ? "⚠️" :
                 t === "important" || t === "danger" || t === "error" || t === "bug" ? "🚨" :
                 t === "pass" || t === "success" || t === "done" || t === "check" || t === "ok" ? "✅" :
                 t === "question" || t === "help" ? "❓" :
                 t === "quote" || t === "cite" ? "💬" : "✨";
    const title = t === "insight" ? "Insight" :
                  t === "note" || t === "info" ? "Note" :
                  t === "tip" || t === "hint" || t === "suggestion" ? "Tip" :
                  t === "warning" || t === "caution" || t === "attention" ? "Warning" :
                  t === "important" || t === "danger" || t === "error" || t === "bug" ? "Important" :
                  t === "pass" || t === "success" || t === "done" || t === "check" || t === "ok" ? "Pass" :
                  t === "question" || t === "help" ? "Question" :
                  this.type.charAt(0).toUpperCase() + this.type.slice(1).toLowerCase();
    const color = t === "important" || t === "danger" || t === "error" || t === "bug" ? "#ef4444" :
                  t === "tip" || t === "hint" || t === "suggestion" ? "#10b981" :
                  t === "warning" || t === "caution" || t === "attention" ? "#f59e0b" :
                  t === "pass" || t === "success" || t === "done" || t === "check" || t === "ok" ? "#22c55e" :
                  t === "note" || t === "info" ? "#0ea5e9" :
                  t === "question" || t === "help" ? "#a855f7" :
                  "var(--beebot-accent, #f4d35e)";
    span.style.color = color;
    span.style.fontWeight = "700";
    span.style.fontSize = "13.5px";
    span.style.display = "inline-flex";
    span.style.alignItems = "center";
    span.style.gap = "6px";
    span.style.paddingBottom = "4px";
    span.innerHTML = `<span>${icon}</span><span>${title}</span>`;
    return span;
  }
}

export class ReactBlockWidget extends WidgetType {
  private root: Root | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private measureRAF: number | null = null;
  constructor(
    private readonly key: string,
    private readonly render: (view?: EditorView) => ReactNode,
    private readonly estimatedHeightVal: number = 150
  ) { super(); }
  eq(other: ReactBlockWidget) {
    return other.key === this.key && other.estimatedHeightVal === this.estimatedHeightVal;
  }
  get estimatedHeight(): number { return this.estimatedHeightVal; }
  toDOM(view: EditorView) {
    const dom = document.createElement("div");
    dom.className = "cm-rich-block";
    dom.setAttribute("contenteditable", "false");
    // Ponytail Senior Dev Fix: Synchronous pre-measured DOM placeholder!
    // By setting minHeight and contain immediately before async React 18 rendering,
    // we ensure the virtual scroller tile never enters at 0px and never causes layout collapse!
    dom.style.minHeight = this.estimatedHeightVal + "px";
    dom.style.boxSizing = "border-box";
    dom.style.contain = "layout style";
    dom.addEventListener("dblclick", () => {
      const pos = view.posAtDOM(dom);
      view.dispatch({ selection: { anchor: pos + 1 } });
      view.focus();
    });
    (dom as any)._widgetKeyPrefix = this.key.split(":")[0];
    this.root = createRoot(dom);
    (dom as any)._reactRoot = this.root;
    this.root.render(this.render(view));

    // Ponytail Senior Dev Fix: React 18 renders asynchronously! When the widget expands from initial placeholder
    // to its actual rendered height, CodeMirror's internal line height map MUST be told to remeasure.
    // Check height delta (> 4px) and schedule via requestAnimationFrame to prevent tile stack crashes on rapid scrolls!
    let lastHeight = this.estimatedHeightVal;
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const h = entry.contentRect.height;
        if (Math.abs(h - lastHeight) > 4) {
          lastHeight = h;
          if (!this.measureRAF) {
            this.measureRAF = requestAnimationFrame(() => {
              this.measureRAF = null;
              // ponytail: CodeMirror 6 EditorView uses `view.destroyed`, NOT `view.destroying` (which is undefined/falsy).
              // Calling requestMeasure on a destroyed view causes `Cannot destructure property 'tile' of 'o.pop(...)' as it is undefined`
              if (!view.destroyed && this.root && this.resizeObserver) {
                try {
                  view.requestMeasure();
                } catch (err) {
                  console.warn("[editor] requestMeasure failed after resize", err);
                }
              }
            });
          }
        }
      }
    });
    ro.observe(dom);
    this.resizeObserver = ro;

    return dom;
  }
  updateDOM(dom: HTMLElement, view: EditorView): boolean {
    const oldPrefix = (dom as any)._widgetKeyPrefix as string | undefined;
    const newPrefix = this.key.split(":")[0];
    if (oldPrefix !== newPrefix) return false;
    const root = (dom as any)._reactRoot as Root | undefined;
    if (!root) return false;
    this.root = root;
    dom.style.minHeight = this.estimatedHeightVal + "px";
    root.render(this.render(view));
    return true;
  }
  // Smart Event Interception:
  // Interactive elements (buttons, links, inputs, selects) handle their own clicks.
  // Other clicks on/near the card let CodeMirror position the caret normally!
  ignoreEvent(event: Event) {
    const target = event.target as HTMLElement | null;
    if (target && (target.closest("button") || target.closest("a") || target.closest("input") || target.closest("select") || target.closest("textarea") || target.closest(".bb-dataview-tab") || target.closest(".cm-property-interactive") || target.closest(".cm-table-interactive"))) {
      return true;
    }
    return false;
  }
  destroy() {
    if (this.measureRAF) {
      cancelAnimationFrame(this.measureRAF);
      this.measureRAF = null;
    }
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
    const r = this.root;
    this.root = null;
    setTimeout(() => { try { r?.unmount(); } catch (e) { void e; } }, 0);
  }
}
