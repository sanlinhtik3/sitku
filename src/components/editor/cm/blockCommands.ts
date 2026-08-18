import type { MarkdownCommand } from "./types";

export interface SlashCommandItem {
  label: string;
  detail: string;
  type: "keyword";
  apply: string;
  aliases: string[];
}

export const SLASH_COMMAND_ITEMS: SlashCommandItem[] = [
  { label: "/h1", detail: "Heading 1", type: "keyword", apply: "# ", aliases: ["heading", "title"] },
  { label: "/h2", detail: "Heading 2", type: "keyword", apply: "## ", aliases: ["heading", "section"] },
  { label: "/h3", detail: "Heading 3", type: "keyword", apply: "### ", aliases: ["heading", "subheading"] },
  { label: "/task", detail: "Task checkbox", type: "keyword", apply: "- [ ] ", aliases: ["todo", "check", "checkbox"] },
  { label: "/bullet", detail: "Bullet list", type: "keyword", apply: "- ", aliases: ["list", "ul"] },
  { label: "/number", detail: "Numbered list", type: "keyword", apply: "1. ", aliases: ["ordered", "ol"] },
  { label: "/quote", detail: "Quote block", type: "keyword", apply: "> ", aliases: ["blockquote"] },
  { label: "/code", detail: "Code block", type: "keyword", apply: "```ts\n// Code here\n```\n", aliases: ["fence"] },
  { label: "/table", detail: "Markdown table", type: "keyword", apply: "| Column 1 | Column 2 |\n| -------- | -------- |\n| Cell 1   | Cell 2   |\n", aliases: ["grid"] },
  { label: "/callout", detail: "Note callout", type: "keyword", apply: "> [!NOTE]\n> ", aliases: ["note", "info"] },
  { label: "/warning", detail: "Warning callout", type: "keyword", apply: "> [!WARNING]\n> ", aliases: ["alert"] },
  { label: "/tip", detail: "Tip callout", type: "keyword", apply: "> [!TIP]\n> ", aliases: ["hint"] },
  { label: "/hr", detail: "Divider", type: "keyword", apply: "---\n", aliases: ["divider", "rule"] },
  { label: "/math", detail: "Math block", type: "keyword", apply: "$$\nE = mc^2\n$$\n", aliases: ["latex"] },
  { label: "/mermaid", detail: "Mermaid diagram", type: "keyword", apply: "```mermaid\ngraph TD\n  A[Start] --> B[Done]\n```\n", aliases: ["diagram"] },
];

export function querySlashCommandItems(query: string, limit = 9): SlashCommandItem[] {
  const needle = query.replace(/^\//, "").trim().toLowerCase();
  return SLASH_COMMAND_ITEMS
    .filter((item) => {
      if (!needle) return true;
      const label = item.label.slice(1).toLowerCase();
      return label.startsWith(needle) || item.detail.toLowerCase().includes(needle) || item.aliases.some((alias) => alias.includes(needle));
    })
    .slice(0, limit);
}

export function stripBlockPrefix(line: string): string {
  return line.replace(/^(\s*)(#{1,6}\s+|>\s+|[-*+]\s+\[[ xX]\]\s+|[-*+]\s+|\d+\.\s+)/, "$1");
}

function isEveryContentLine(lines: string[], predicate: (line: string) => boolean): boolean {
  const contentLines = lines.filter((line) => line.trim().length > 0);
  return contentLines.length > 0 && contentLines.every(predicate);
}

function indentOf(line: string): string {
  return line.match(/^\s*/)?.[0] ?? "";
}

export function transformMarkdownLines(lines: string[], command: MarkdownCommand): string[] {
  if (command === "body") return lines.map(stripBlockPrefix);

  if (command === "bullet-list") {
    const allBullet = isEveryContentLine(lines, (line) => /^\s*[-*+]\s+/.test(line) && !/^\s*[-*+]\s+\[[ xX]\]\s+/.test(line));
    return lines.map((line) => line.trim() ? (allBullet ? stripBlockPrefix(line) : `${indentOf(line)}- ${stripBlockPrefix(line).trimStart()}`) : line);
  }

  if (command === "numbered-list") {
    const allNumbered = isEveryContentLine(lines, (line) => /^\s*\d+\.\s+/.test(line));
    return lines.map((line, index) => line.trim() ? (allNumbered ? stripBlockPrefix(line) : `${indentOf(line)}${index + 1}. ${stripBlockPrefix(line).trimStart()}`) : line);
  }

  if (command === "task-list") {
    const allTask = isEveryContentLine(lines, (line) => /^\s*[-*+]\s+\[[ xX]\]\s+/.test(line));
    return lines.map((line) => line.trim() ? (allTask ? stripBlockPrefix(line) : `${indentOf(line)}- [ ] ${stripBlockPrefix(line).trimStart()}`) : line);
  }

  if (command === "quote") {
    const allQuote = isEveryContentLine(lines, (line) => /^\s*>\s+/.test(line));
    return lines.map((line) => line.trim() ? (allQuote ? stripBlockPrefix(line) : `${indentOf(line)}> ${line.trimStart().replace(/^>\s*/, "")}`) : line);
  }

  if (command.startsWith("heading-")) {
    const level = Number(command.replace("heading-", ""));
    const prefix = `${"#".repeat(level)} `;
    const allSameHeading = isEveryContentLine(lines, (line) => new RegExp(`^\\s*#{${level}}\\s+`).test(line));
    return lines.map((line) => line.trim() ? (allSameHeading ? stripBlockPrefix(line) : `${indentOf(line)}${prefix}${stripBlockPrefix(line).trimStart()}`) : line);
  }

  return lines;
}
