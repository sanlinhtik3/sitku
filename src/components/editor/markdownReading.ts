import type { Root } from "mdast";

type MdastNode = { type?: string; value?: string; children?: MdastNode[] };

export function isMarkdownBlockLine(line: string) {
  const text = line.trim();
  return (
    !text ||
    text.startsWith("#") ||
    text.startsWith(">") ||
    text.startsWith("|") ||
    text.startsWith(":::") ||
    text.startsWith("```") ||
    text.startsWith("~~~") ||
    text.startsWith("$$") ||
    text.startsWith("<") ||
    /^!\[\[[^[\]\r\n]+\]\]$/.test(text) ||
    /^[-*+]\s+/.test(text) ||
    /^[-*+]\s+\[[ xX]\]\s+/.test(text) ||
    /^\d+[.)]\s+/.test(text)
  );
}

export function getImplicitTitleLineIndex(markdown: string) {
  const lines = markdown.split(/\r?\n/);
  let start = 0;
  if (lines[0]?.trim() === "---") {
    const closingFence = lines.findIndex((line, index) => index > 0 && line.trim() === "---");
    if (closingFence > 0) start = closingFence + 1;
  }
  const index = lines.findIndex((line, lineIndex) => lineIndex >= start && line.trim().length > 0);
  if (index < 0 || isMarkdownBlockLine(lines[index])) return -1;
  return index;
}

export function promoteImplicitTitleLine(markdown: string) {
  const lines = markdown.split(/\r?\n/);
  const index = getImplicitTitleLineIndex(markdown);
  if (index < 0) return markdown;
  lines[index] = `# ${lines[index].trim()}`;
  return lines.join("\n");
}

function normalizeBlockText(value: string) {
  return value
    .replace(/\r/g, "")
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/\[\[([^|\]#]+)(?:#[^|\]]+)?(?:\|([^\]]+))?\]\]/g, (_match, target: string, label?: string) => label || target)
    .replace(/^\s*(?:#{1,6}|>|[-+*]|\d+[.)])\s*/g, "")
    .replace(/^\s*\[![^\]]+\]\s*/g, "")
    .replace(/^\s*\[[ xX]\]\s*/g, "")
    .replace(/[`*_~$|:[\]()>-]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLocaleLowerCase();
}

/** Maps a rendered reading block back to its nearest Markdown source offset. */
export function findReadingBlockOffset(markdown: string, renderedText: string) {
  const rawSearch = renderedText.trim();
  if (!rawSearch) return 0;
  const exact = markdown.indexOf(rawSearch);
  if (exact >= 0) return exact;

  const target = normalizeBlockText(rawSearch.split("\n").find((line) => line.trim()) || rawSearch);
  if (!target) return 0;

  let offset = 0;
  let best = { offset: 0, score: 0 };
  for (const line of markdown.split("\n")) {
    const candidate = normalizeBlockText(line);
    if (candidate) {
      if (candidate === target) return offset + Math.max(0, line.indexOf(line.trimStart()));
      const score = target.startsWith(candidate)
        ? candidate.length
        : candidate.startsWith(target)
          ? target.length
          : 0;
      if (score > best.score) best = { offset, score };
    }
    offset += line.length + 1;
  }
  return best.score >= Math.min(12, target.length) ? best.offset : 0;
}

export function preserveSoftLineBreaksInMdast(tree: Root) {
  const visit = (node: MdastNode) => {
    if (!node.children || node.type === "code" || node.type === "inlineCode") return;
    const nextChildren: MdastNode[] = [];
    for (const child of node.children) {
      if (child.type === "text" && typeof child.value === "string" && child.value.includes("\n")) {
        const parts = child.value.split("\n");
        parts.forEach((part, index) => {
          if (index > 0) nextChildren.push({ type: "break" });
          if (part) nextChildren.push({ ...child, value: part });
        });
      } else {
        visit(child);
        nextChildren.push(child);
      }
    }
    node.children = nextChildren;
  };
  visit(tree as MdastNode);
}

export function remarkPreserveSoftLineBreaks() {
  return (tree: Root) => preserveSoftLineBreaksInMdast(tree);
}
