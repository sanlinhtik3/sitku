import React, { memo, useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

interface InlineWidgetCardProps {
  html: string;
  title: string;
  height?: number;
  onSendMessage?: (message: string) => void;
  sessionId?: string;
  messageId?: string;
  preset?: string | null;
  data?: any;
}

// Map app CSS variables → widget CSS variables
const THEME_INJECTION = `
<style>
  :root {
    --color-bg-primary: hsl(var(--widget-bg, 222 47% 6%));
    --color-bg-secondary: hsl(var(--widget-bg-secondary, 222 47% 10%));
    --color-text-primary: hsl(var(--widget-text, 210 40% 96%));
    --color-text-secondary: hsl(var(--widget-text-secondary, 215 20% 65%));
    --color-border: hsl(var(--widget-border, 217 33% 17%));
    --color-accent: hsl(var(--widget-accent, 262 83% 58%));
    --color-success: hsl(142 71% 45%);
    --color-danger: hsl(0 84% 60%);
    --color-warning: hsl(38 92% 50%);
    --font-sans: Inter, system-ui, -apple-system, sans-serif;
    /* color-scheme set dynamically via :root vars injected by themedHtml */
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html, body { background: transparent; }
  body {
    font-family: var(--font-sans);
    color: var(--color-text-primary);
    padding: 8px 6px;
    line-height: 1.45;
    -webkit-font-smoothing: antialiased;
    overflow-x: hidden;
    overflow-y: hidden;
  }
  @media (max-width: 480px) { body { padding: 6px 4px; } }
  body > *:last-child { margin-bottom: 0 !important; }
  body > div > *:last-child { margin-bottom: 0 !important; }
  table {
    width: 100%;
    border-collapse: collapse;
    font-size: 13px;
  }
  th {
    text-align: left;
    padding: 8px 12px;
    font-size: 10px;
    font-weight: 600;
    letter-spacing: 0.05em;
    text-transform: uppercase;
    color: var(--color-text-secondary);
    background: var(--color-bg-secondary);
    border-bottom: 1px solid var(--color-border);
  }
  td {
    padding: 8px 12px;
    border-bottom: 1px solid color-mix(in srgb, var(--color-border) 50%, transparent);
  }
  tr:hover td {
    background: color-mix(in srgb, var(--color-bg-secondary) 50%, transparent);
  }
  .card {
    background: var(--color-bg-secondary);
    border: 1px solid var(--color-border);
    border-radius: 12px;
    padding: 16px;
  }
  .grid { display: grid; gap: 12px; }
  .grid-2 { grid-template-columns: repeat(2, 1fr); }
  .grid-3 { grid-template-columns: repeat(3, 1fr); }
  .grid-4 { grid-template-columns: repeat(4, 1fr); }
  @media (max-width: 768px) {
    .grid-3, .grid-4 { grid-template-columns: repeat(2, 1fr); }
  }
  @media (max-width: 480px) {
    .grid-2, .grid-3, .grid-4 { grid-template-columns: 1fr; }
  }
  canvas { max-width: 100%; }
  /* ─── Custom hover tooltip — Claude-style: solid dark, no arrow ─── */
  #bb-tip {
    position: fixed; pointer-events: none; z-index: 9999;
    padding: 9px 12px; border-radius: 8px;
    background: #0b0d12;
    color: #fff;
    border: 1px solid rgba(255,255,255,0.08);
    font-size: 12px; font-weight: 500; line-height: 1.4;
    box-shadow: 0 10px 30px rgba(0,0,0,0.5);
    transform: translate(-50%, -100%);
    white-space: nowrap; max-width: 260px;
    opacity: 0; transition: opacity 0.1s;
  }
  #bb-tip.show { opacity: 1; }
  #bb-tip.bb-tip-below { transform: translate(-50%, 14px); }
  [data-bb-tip], [data-bb-action] { cursor: pointer; }
</style>
<script>
  try {
    window.__widgetChannel = new BroadcastChannel('beebot-widgets');
    window.broadcastToWidgets = function(type, data) {
      window.__widgetChannel.postMessage({ type: type, data: data });
    };
    window.__widgetChannel.onmessage = function(e) {
      window.dispatchEvent(new CustomEvent('widget-data', { detail: e.data }));
    };
  } catch(e) {}

  // ─── window.beebot bridge — Claude-style widget→agent action API ───
  window.beebot = {
    send: function(message) {
      try { parent.postMessage({ type: 'widget_action', action: 'send_message', payload: String(message || '') }, '*'); } catch(e) {}
    },
    callTool: function(name, args) {
      try { parent.postMessage({ type: 'widget_action', action: 'execute_tool', payload: { name: name, args: args || {} } }, '*'); } catch(e) {}
    },
    navigate: function(path) {
      try { parent.postMessage({ type: 'widget_action', action: 'navigate', payload: String(path || '') }, '*'); } catch(e) {}
    }
  };

  // Auto-wire any element with [data-bb-action] → window.beebot.send(...)
  document.addEventListener('click', function(e) {
    var el = e.target.closest && e.target.closest('[data-bb-action]');
    if (el) {
      e.preventDefault();
      var msg = el.getAttribute('data-bb-action');
      if (msg && window.beebot) window.beebot.send(msg);
    }
  });

  // ─── Custom hover tooltip — Claude-style multi-line with color swatch ───
  (function(){
    var tip = null;
    function ensureTip(){
      if (!tip) {
        tip = document.createElement('div');
        tip.id = 'bb-tip';
        document.body.appendChild(tip);
      }
      return tip;
    }
    // Format: "Title|||Value"  OR  "Title|||name:color:value"  OR  "Title|||Value\\nLabel|||name:color:value"
    // Lines split by \\n. Each line: "title|||rest". Rest can be "name:color:value" for color-swatch mode.
    function renderTip(raw){
      var lines = String(raw).split('\\n');
      var html = '';
      for (var i = 0; i < lines.length; i++) {
        var parts = lines[i].split('|||');
        var title = parts[0] || '';
        var rest = parts[1] || '';
        if (i === 0) {
          html += '<div style="font-weight:600;font-size:13px;color:#fff;margin-bottom:' + (lines.length > 1 || rest.indexOf(':') > -1 ? '4px' : '0') + ';">' + escapeHtml(title) + '</div>';
        }
        // Detect "name:color:value" (color must look like #hex or rgb)
        var colorMatch = rest.match(/^([^:]+):(#[0-9a-fA-F]{3,8}|rgb\\([^)]+\\)|[a-z]+):(.+)$/);
        if (colorMatch) {
          html += '<div style="display:flex;align-items:center;gap:7px;font-size:12px;color:rgba(255,255,255,0.9);">'
            + '<span style="width:10px;height:10px;border-radius:2px;background:' + escapeHtml(colorMatch[2]) + ';display:inline-block;flex-shrink:0;"></span>'
            + '<span>' + escapeHtml(colorMatch[1]) + ': ' + escapeHtml(colorMatch[3]) + '</span></div>';
        } else if (rest && i > 0) {
          html += '<div style="font-size:12px;color:rgba(255,255,255,0.85);">' + escapeHtml(title) + ': ' + escapeHtml(rest) + '</div>';
        } else if (rest && i === 0) {
          html += '<div style="font-size:12px;color:rgba(255,255,255,0.9);">' + escapeHtml(rest) + '</div>';
        }
      }
      return html;
    }
    function escapeHtml(s){
      return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    }
    function show(text, x, y){
      var t = ensureTip();
      t.innerHTML = (text.indexOf('|||') > -1) ? renderTip(text) : escapeHtml(text);
      // Position above cursor, but flip below if near top edge
      var rect = t.getBoundingClientRect();
      var posY = y - 14;
      var fromTop = (y < 80);
      t.style.left = x + 'px';
      t.style.top = posY + 'px';
      t.classList.toggle('bb-tip-below', fromTop);
      t.classList.add('show');
    }
    function hide(){ if (tip) tip.classList.remove('show'); }
    document.addEventListener('mousemove', function(e){
      var el = e.target.closest && e.target.closest('[data-bb-tip]');
      if (el) {
        var msg = el.getAttribute('data-bb-tip');
        if (msg) show(msg, e.clientX, e.clientY);
      } else {
        hide();
      }
    });
    document.addEventListener('mouseleave', hide);
    document.addEventListener('scroll', hide, true);
  })();

  (function() {
    var lastH = 0;
    var rafPending = false;
    function measure() {
      rafPending = false;
      try {
        var h = Math.max(
          document.body.scrollHeight,
          document.documentElement.scrollHeight,
          document.body.offsetHeight,
          document.documentElement.offsetHeight
        );
        if (h && Math.abs(h - lastH) > 4) {
          lastH = h;
          parent.postMessage({ type: 'beebot_widget_height', height: h }, '*');
        }
      } catch(e) {}
    }
    function postHeight() {
      if (rafPending) return;
      rafPending = true;
      (window.requestAnimationFrame || function(cb){ setTimeout(cb, 16); })(measure);
    }
    window.addEventListener('load', function() {
      postHeight();
      setTimeout(postHeight, 60);
      setTimeout(postHeight, 200);
    });
    if (window.ResizeObserver) {
      try { new ResizeObserver(postHeight).observe(document.documentElement); } catch(e) {}
    } else {
      setInterval(postHeight, 500);
    }
  })();
</script>
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline' https://cdnjs.cloudflare.com https://cdn.jsdelivr.net https://unpkg.com https://d3js.org https://cdn.plot.ly; style-src 'unsafe-inline'; img-src data: https:; font-src https:; connect-src 'self';">
`;

function getComputedHSL(varName: string, fallback: string): string {
  if (typeof document === "undefined") return fallback;
  const val = getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
  return val || fallback;
}

// ─── Action allowlist + rate-limiter ────────────────────────────────────────
const ALLOWED_WIDGET_ACTIONS = new Set(["send_message", "navigate", "execute_tool"]);
const WIDGET_ACTION_MAX_PER_SEC = 5;
// Strict internal-path regex: no scheme, no double-slash, no ..
const NAVIGATE_PATH_RE = /^\/[a-zA-Z0-9/_\-?=&%]*$/;
const PAYLOAD_SIZE_LIMIT = 4096;

export const InlineWidgetCard = memo(function InlineWidgetCard({
  html, title, height = 400, onSendMessage,
}: InlineWidgetCardProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [renderError, setRenderError] = useState<string | null>(null);
  const [retryNonce, setRetryNonce] = useState(0);
  const loadTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const actionTimestampsRef = useRef<number[]>([]);

  // ─── Dark/light theme detection ───────────────────────────────────────────
  const [isDark, setIsDark] = useState(
    () => document.documentElement.classList.contains("dark")
  );
  useEffect(() => {
    const observer = new MutationObserver(() => {
      setIsDark(document.documentElement.classList.contains("dark"));
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, []);

  const effectiveHtml = html;
  const effectiveHeight = height;
  const effectiveTitle = title;

  const floorHeight = Math.min(Math.max(effectiveHeight, 80), 4000);
  const [contentHeight, setContentHeight] = useState<number>(floorHeight);

  const themedHtml = React.useMemo(() => {
    const darkPalette = {
      bg: getComputedHSL("--background", "222 47% 6%"),
      bgSec: getComputedHSL("--card", "222 47% 10%"),
      text: getComputedHSL("--foreground", "210 40% 96%"),
      textSec: getComputedHSL("--muted-foreground", "215 20% 65%"),
      border: getComputedHSL("--border", "217 33% 17%"),
      accent: getComputedHSL("--primary", "262 83% 58%"),
      scheme: "dark",
    };
    const lightPalette = {
      bg: "0 0% 100%",
      bgSec: "220 14% 96%",
      text: "222 47% 11%",
      textSec: "215 16% 47%",
      border: "220 13% 91%",
      accent: getComputedHSL("--primary", "262 83% 58%"),
      scheme: "light",
    };
    const p = isDark ? darkPalette : lightPalette;
    const vars = `<style>:root{--widget-bg:${p.bg};--widget-bg-secondary:${p.bgSec};--widget-text:${p.text};--widget-text-secondary:${p.textSec};--widget-border:${p.border};--widget-accent:${p.accent};color-scheme:${p.scheme};}</style>`;
    return `<!DOCTYPE html><html><head>${vars}${THEME_INJECTION}</head><body>${effectiveHtml}</body></html>`;
  }, [effectiveHtml, isDark, retryNonce]);

  const pendingHeightRef = useRef<number | null>(null);
  const debounceTimerRef = useRef<number | null>(null);
  const lastAppliedAtRef = useRef<number>(0);
  const lastShrinkAtRef = useRef<number>(0);
  const lastHeightBeforeShrinkRef = useRef<number>(0);
  const contentHeightRef = useRef<number>(floorHeight);
  contentHeightRef.current = contentHeight;

  useEffect(() => {
    const flush = () => {
      debounceTimerRef.current = null;
      const next = pendingHeightRef.current;
      if (next == null) return;
      const current = contentHeightRef.current;
      const now = Date.now();

      if (now - lastAppliedAtRef.current < 100) {
        debounceTimerRef.current = window.setTimeout(flush, 100 - (now - lastAppliedAtRef.current));
        return;
      }

      if (Math.abs(next - current) <= 6) return;

      if (next < current) {
        lastShrinkAtRef.current = now;
        lastHeightBeforeShrinkRef.current = current;
      } else if (
        next > current &&
        now - lastShrinkAtRef.current < 400 &&
        Math.abs(next - lastHeightBeforeShrinkRef.current) <= 12
      ) {
        lastShrinkAtRef.current = 0;
      }

      lastAppliedAtRef.current = now;
      setContentHeight(next);
    };

    const handler = (e: MessageEvent) => {
      // ─── Security: only accept messages from sandboxed iframes (origin === "null") ───
      if (e.origin !== "null" && e.origin !== window.location.origin) return;
      const fromOurIframe = iframeRef.current && e.source === iframeRef.current.contentWindow;
      if (!fromOurIframe) return;

      // ─── Payload size cap ───────────────────────────────────────────────
      try {
        if (JSON.stringify(e.data).length > PAYLOAD_SIZE_LIMIT) return;
      } catch { return; }

      // Legacy: beebot_send_prompt (kept for backward compatibility)
      if (e.data?.type === "beebot_send_prompt" && e.data.prompt && onSendMessage) {
        onSendMessage(String(e.data.prompt).slice(0, 500));
        return;
      }

      // New unified widget_action protocol
      if (e.data?.type === "widget_action") {
        const { action, payload } = e.data;

        // ─── Action allowlist ───────────────────────────────────────────
        if (!ALLOWED_WIDGET_ACTIONS.has(action)) return;

        // ─── Rate-limit: max 5 actions/sec per iframe ───────────────────
        const now = Date.now();
        actionTimestampsRef.current = actionTimestampsRef.current.filter(t => now - t < 1000);
        if (actionTimestampsRef.current.length >= WIDGET_ACTION_MAX_PER_SEC) return;
        actionTimestampsRef.current.push(now);

        if (action === "send_message" && typeof payload === "string" && onSendMessage) {
          onSendMessage(payload.slice(0, 500));
          return;
        }
        if (action === "navigate" && typeof payload === "string") {
          if (NAVIGATE_PATH_RE.test(payload)) {
            try { window.location.assign(payload); } catch {}
          }
          return;
        }
        // execute_tool intentionally NOT auto-executed (security):
        // we forward as a chat message so the agent decides.
        if (action === "execute_tool" && payload?.name && onSendMessage) {
          const args = payload.args ? JSON.stringify(payload.args) : "";
          onSendMessage(`Please run tool \`${String(payload.name).slice(0, 80)}\`${args ? ` with args ${args.slice(0, 300)}` : ""}.`);
          return;
        }
      }

      if (e.data?.type === "beebot_widget_height" && typeof e.data.height === "number") {
        const h = Math.min(Math.max(e.data.height + 4, 80), 4000);
        pendingHeightRef.current = h;
        if (debounceTimerRef.current != null) window.clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = window.setTimeout(flush, 120);
      }
    };
    window.addEventListener("message", handler);
    return () => {
      window.removeEventListener("message", handler);
      if (debounceTimerRef.current != null) window.clearTimeout(debounceTimerRef.current);
    };
  }, [onSendMessage]);

  // Reset loading + error state whenever the html changes or retry is triggered
  useEffect(() => {
    setIsLoading(true);
    setRenderError(null);
    // 12-second load timeout — show error fallback if iframe never fires onLoad
    if (loadTimerRef.current) clearTimeout(loadTimerRef.current);
    loadTimerRef.current = setTimeout(() => {
      setIsLoading(false);
      setRenderError("Widget timed out loading (>12s). The content may be too large or contain errors.");
    }, 12_000);
    return () => {
      if (loadTimerRef.current) { clearTimeout(loadTimerRef.current); loadTimerRef.current = null; }
    };
  }, [themedHtml]);

  const handleLoad = useCallback(() => {
    if (loadTimerRef.current) { clearTimeout(loadTimerRef.current); loadTimerRef.current = null; }
    setIsLoading(false);
    setRenderError(null);
  }, []);

  return (
    <div className="rounded-glass-card overflow-hidden bg-transparent relative mx-auto w-full max-w-[960px]">
      {isLoading && !renderError && (
        <div className="flex items-center justify-center bg-muted/10" style={{ height: floorHeight }}>
          <div className="flex flex-col items-center gap-2">
            <div className="h-6 w-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
            <span className="text-[10px] text-muted-foreground">Loading widget...</span>
          </div>
        </div>
      )}
      {renderError && (
        <div className="flex flex-col items-center justify-center gap-3 p-6 bg-muted/10 rounded-xl border border-border/30 text-center" style={{ minHeight: 120 }}>
          <p className="text-sm text-muted-foreground">{renderError}</p>
          <div className="flex gap-2 flex-wrap justify-center">
            <button
              onClick={() => setRetryNonce(n => n + 1)}
              className="px-3 py-1.5 text-xs rounded-md bg-primary/10 hover:bg-primary/20 text-primary transition-colors"
            >
              Retry
            </button>
            <button
              onClick={() => {
                try {
                  navigator.clipboard.writeText(JSON.stringify({ html, title }, null, 2));
                  toast.success("Widget data copied to clipboard");
                } catch { toast.error("Copy failed"); }
              }}
              className="px-3 py-1.5 text-xs rounded-md bg-muted/20 hover:bg-muted/30 text-muted-foreground transition-colors"
            >
              Copy raw data
            </button>
          </div>
        </div>
      )}
      <iframe
        ref={iframeRef}
        srcDoc={themedHtml}
        sandbox="allow-scripts"
        referrerPolicy="no-referrer"
        onLoad={handleLoad}
        className={isLoading || renderError ? "hidden" : "w-full border-0 bg-transparent"}
        style={{ height: contentHeight, transition: "height 180ms ease" }}
        title={effectiveTitle}
      />
    </div>
  );
});
