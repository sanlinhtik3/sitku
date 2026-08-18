// ponytail: self-check for YAML frontmatter & WYSIWYG code block parser (no frameworks, no fixtures)
import { parseFrontmatter, splitFrontmatter, serializeFrontmatter } from "./NoteReader";
import { parseCodeBlockFence } from "./LiveMarkdownEditor";

export function runFrontmatterSelfCheck() {
  const sample = `---\ntitle: Obsidian UX\nstatus: in progress\ntags: #obsidian #ux\n---\n\n# Note Body\nHere is some content.`;
  
  const { fm, body } = splitFrontmatter(sample);
  console.assert(fm !== null, "splitFrontmatter failed to extract frontmatter");
  console.assert(body.trim().startsWith("# Note Body"), "splitFrontmatter failed to extract body");

  const entries = parseFrontmatter(fm || "");
  console.assert(entries !== null && entries.length === 3, "parseFrontmatter failed to parse 3 entries");
  console.assert(entries?.[0].key === "title" && entries?.[0].value === "Obsidian UX", "title property mismatch");
  console.assert(entries?.[1].key === "status" && entries?.[1].value === "in progress", "status property mismatch");

  const serialized = serializeFrontmatter(entries || [], body);
  console.assert(serialized.includes("title: Obsidian UX"), "serializeFrontmatter failed to serialize title");
  console.assert(serialized.includes("# Note Body"), "serializeFrontmatter failed to preserve body");

  // Code block fence self-checks
  const fenceMd = parseCodeBlockFence("```markdown");
  console.assert(fenceMd.isFence && fenceMd.fence === "```" && fenceMd.lang === "markdown", "parseCodeBlockFence failed on ```markdown");
  const fenceTs = parseCodeBlockFence("~~~ts");
  console.assert(fenceTs.isFence && fenceTs.fence === "~~~" && fenceTs.lang === "ts", "parseCodeBlockFence failed on ~~~ts");
  const noFence = parseCodeBlockFence("not a fence");
  console.assert(!noFence.isFence, "parseCodeBlockFence failed on non-fence");

  console.log("[ponytail:check] Frontmatter & Code Block WYSIWYG self-check passed!");
}

