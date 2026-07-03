import type { AgentChatMessage } from "@/hooks/useAgentChat";

// Check if content is just a placeholder or tool leak that should be hidden
export function isPlaceholderOrLeakContent(content: string): boolean {
  const trimmed = content.trim();
  if (trimmed.length === 0) return true;

  const placeholders = ["[Tool execution completed]", "[Processing completed]", "လုပ်ဆောင်မှု ပြီးပါပြီ", "✅ Operation completed successfully", "[Tool completed successfully", "[Tool completed successfully. Summarize"];
  if (placeholders.some((p) => trimmed.startsWith(p))) return true;

  // Gemini native <tool_code> blocks should be hidden entirely
  if (/^\s*<tool_code>/.test(trimmed)) return true;
  // Plain-text pseudo-tool blocks (e.g. "tool_code\nprint(search_web(...))")
  if (/^tool_code\s*$/m.test(trimmed) && /print\s*\(\s*(?:search_web|search_knowledge_base|manage_flowstate)\s*\(/.test(trimmed)) return true;
  // Raw tool-name + JSON leak (e.g. "search_web\n{"query":...}")
  if (/^search_web\s*$/m.test(trimmed) || /^search_web\s*\{/m.test(trimmed) || /^search_web\s*\n+\s*\{/m.test(trimmed)) return true;
  if (/^\{\s*"query"\s*:/m.test(trimmed)) return true;
  // Full tool-call JSON object leak: {"name":"search_web","arguments":{...}}
  if (/^\s*\{\s*"name"\s*:\s*"[^"]+"\s*,\s*"arguments"\s*:/m.test(trimmed)) return true;
  // [Used tools: ...] internal syntax leak
  if (/\[Used tools:\s*[^\]]*\]/i.test(trimmed)) return true;

  const leakPatterns = [
    /^(search_knowledge_base|generate_ai_content|manage_flowstate|manage_workspace_task)(success|error|result)?\s*\{/i,
    /^\s*\{\s*"success"\s*:/i,
    /^\s*\{\s*"results"\s*:/i,
    /^\s*\{\s*"error"\s*:/i,
  ];
  if (leakPatterns.some((p) => p.test(trimmed))) return true;

  const internalPatterns = [
    /^Settings updated:\s*(name|personality|emoji)/i,
    /^Settings applied\.?$/i,
    /^Memory stored\.?$/i,
    /^Decision processed\.?$/i,
    /^မှတ်သားထားပြီးပါပြီ:\s*"/i,
    /^မှတ်သားထားပြီးပါပြီ\.?$/i,
    /^✅\s*Autonomous decision executed/i,
    /^📝\s*Decision recorded.*confirmation/i,
    /^\s*confidence:\s*\d+%/i,
    /^"[^"]+"\s*=\s*"[^"]+"\s*$/i,
  ];
  if (internalPatterns.some((p) => p.test(trimmed))) return true;

  // Ghost recovery messages with hallucinated names
  if (/အာရုံလွတ်သွားလို့|ပြန်ရောက်ပါပြီ.*🐝|I got distracted|I'm back now/i.test(trimmed) && trimmed.length < 200) return true;

  if (trimmed.length < 100) {
    const shortTechnicalPatterns = [
      /^(Settings|Memory|Decision)\s+(applied|stored|processed)/i,
      /^(stored|applied|processed|updated)\.?$/i,
    ];
    if (shortTechnicalPatterns.some((p) => p.test(trimmed))) return true;
  }

  return false;
}

// Check if this message has draft content that can be saved
export function getDraftContentResult(message: AgentChatMessage): any | null {
  if (!message.tool_results) return null;
  const contentResult = message.tool_results.find(
    (tr) => tr.name === "generate_ai_content" && tr.result?.draft_mode === true,
  );
  return contentResult?.result || null;
}

// Extract generate_image tool results for inline image cards
export function getGeneratedImages(message: AgentChatMessage): Array<{ imageUrl: string; description?: string; modelUsed?: string; prompt?: string; aspectRatio?: string }> {
  if (!message.tool_results) return [];
  return message.tool_results
    .filter((tr: any) => tr.name === "generate_image" && tr.result?.success && tr.result?.image_url)
    .map((tr: any) => ({
      imageUrl: tr.result.image_url as string,
      description: tr.result.description as string | undefined,
      modelUsed: tr.result.model_used as string | undefined,
      prompt: tr.result.prompt as string | undefined,
      aspectRatio: tr.result.aspect as string | undefined,
    }));
}

// Extract generate_file tool results for inline file download cards
export function getFileDownloads(message: AgentChatMessage): Array<{ fileType: string; content: string; filename: string }> {
  if (!message.tool_results) return [];
  return message.tool_results
    .filter((tr: any) => tr.name === "generate_file" && tr.result?.file_type && tr.result?.content)
    .map((tr: any) => ({
      fileType: tr.result.file_type as string,
      content: tr.result.content as string,
      filename: (tr.result.filename || `beebot_export.${tr.result.file_type}`) as string,
    }));
}

// Normalize HTML to strip volatile attributes/whitespace so near-duplicates collapse.
function normalizeWidgetHtml(html: string): string {
  return html
    // Strip HTML comments
    .replace(/<!--[\s\S]*?-->/g, "")
    // Strip volatile attributes (random IDs / data-uid / data-key / data-id)
    .replace(/\s(?:id|data-uid|data-key|data-id|data-ts|data-timestamp)="[^"]*"/gi, "")
    // Round numeric jitter inside style/transform values: 12.347px → 12px
    .replace(/(\d+)\.\d+(px|em|rem|%)/g, "$1$2")
    // Strip translate(x.x, y.y) jitter
    .replace(/translate\(\s*-?\d+(?:\.\d+)?\s*,\s*-?\d+(?:\.\d+)?\s*\)/gi, (m) =>
      m.replace(/(-?\d+)\.\d+/g, "$1"),
    )
    // Collapse whitespace runs
    .replace(/\s+/g, " ")
    .trim();
}

// Fast 32-bit FNV-1a hash → hex string. Dependency-free, O(n).
function fnv1aHex(input: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

// Extract show_widget tool results for inline widget rendering.
// Deduplicates by normalized-HTML hash so near-duplicate model calls don't render twice.
export function getWidgets(message: AgentChatMessage): Array<{ html: string; title: string; height: number; preset: string | null; data: any }> {
  if (!message.tool_results) return [];
  const seen = new Set<string>();
  const out: Array<{ html: string; title: string; height: number; preset: string | null; data: any }> = [];
  for (const tr of message.tool_results as any[]) {
    // Both show_widget and compose_dashboard return the same shape.
    if (tr?.name !== "show_widget" && tr?.name !== "compose_dashboard") continue;
    if (!tr?.result?.success || !tr?.result?.html) continue;
    const html = tr.result.html as string;
    const title = (tr.result.title || "Widget") as string;
    const sig = fnv1aHex(`${title.trim().toLowerCase()}::${normalizeWidgetHtml(html)}`);
    if (seen.has(sig)) continue;
    seen.add(sig);
    out.push({
      html,
      title,
      height: (tr.result.height || 400) as number,
      preset: (tr.result.preset ?? null) as string | null,
      data: tr.result.data ?? null,
    });
  }
  return out;
}
