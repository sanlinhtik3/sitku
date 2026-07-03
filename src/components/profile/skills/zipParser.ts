import JSZip from "jszip";
import type { ParsedSkillFile, ParsedSkillFolder, FileTreeNode } from "./types";

const SUPPORTED_EXTENSIONS = ["md", "yaml", "yml", "json", "txt", "toml", "cfg", "ini", "py", "js", "ts", "jsx", "tsx", "css", "html", "sh", "bat", "ps1", "sql", "xml", "csv"];
const MAX_FILE_SIZE = 500_000;

function getFileType(name: string): ParsedSkillFile["type"] {
  const ext = name.split(".").pop()?.toLowerCase() || "";
  if (ext === "md") return "md";
  if (ext === "yaml" || ext === "yml") return "yaml";
  if (ext === "json") return "json";
  if (ext === "txt") return "txt";
  return "other";
}

function parseYamlFrontmatter(content: string) {
  const match = content.match(/^---\s*\n([\s\S]*?)\n---/);
  if (!match) return { name: "", description: "", keywords: [] as string[] };
  const yaml = match[1];
  const nameMatch = yaml.match(/name:\s*(.+)/);
  const descMatch = yaml.match(/description:\s*["']?(.+?)["']?\s*$/m);
  const keywordsMatch = yaml.match(/keywords:\s*\[([^\]]*)\]/);
  const triggerMatch = yaml.match(/trigger_keywords:\s*\[([^\]]*)\]/);
  return {
    name: nameMatch?.[1]?.trim() || "",
    description: descMatch?.[1]?.trim() || "",
    keywords: (keywordsMatch?.[1] || triggerMatch?.[1] || "")
      .split(",")
      .map((k) => k.trim().replace(/["']/g, ""))
      .filter(Boolean),
  };
}

/** Build a nested tree from a flat list of file paths + contents */
function buildFileTree(rootName: string, files: ParsedSkillFile[]): FileTreeNode {
  const root: FileTreeNode = { name: rootName, path: "", isDir: true, children: [] };

  for (const file of files) {
    // Get path relative to root folder
    const parts = file.path.split("/").filter(Boolean);
    // Skip the root folder name itself if present
    const startIdx = parts[0] === rootName ? 1 : 0;
    const relativeParts = parts.slice(startIdx);

    let current = root;
    for (let i = 0; i < relativeParts.length; i++) {
      const part = relativeParts[i];
      const isLast = i === relativeParts.length - 1;

      if (isLast) {
        // It's a file
        current.children!.push({
          name: part,
          path: file.path,
          isDir: false,
          content: file.content,
          size: file.size,
          type: file.type,
        });
      } else {
        // It's a directory — find or create
        let dirNode = current.children!.find((c) => c.isDir && c.name === part);
        if (!dirNode) {
          dirNode = { name: part, path: relativeParts.slice(0, i + 1).join("/"), isDir: true, children: [] };
          current.children!.push(dirNode);
        }
        current = dirNode;
      }
    }
  }

  // Sort: directories first, then files, alphabetically
  const sortTree = (node: FileTreeNode) => {
    if (node.children) {
      node.children.sort((a, b) => {
        if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
        return a.name.localeCompare(b.name);
      });
      node.children.forEach(sortTree);
    }
  };
  sortTree(root);

  return root;
}

export async function parseZipFile(file: File): Promise<ParsedSkillFolder[]> {
  const zip = await JSZip.loadAsync(file);
  const folders = new Map<string, ParsedSkillFile[]>();

  for (const [path, entry] of Object.entries(zip.files)) {
    if (entry.dir) continue;
    const parts = path.split("/").filter(Boolean);
    if (parts.length === 0) continue;
    if (parts.some((p) => p.startsWith(".") || p === "__MACOSX")) continue;

    const ext = path.split(".").pop()?.toLowerCase() || "";
    if (!SUPPORTED_EXTENSIONS.includes(ext)) continue;

    const folderKey = parts.length > 1 ? parts[0] : "__root__";

    try {
      const content = await entry.async("string");
      if (content.length > MAX_FILE_SIZE) continue;

      const existing = folders.get(folderKey) || [];
      existing.push({
        name: parts[parts.length - 1],
        path,
        content,
        size: content.length,
        type: getFileType(parts[parts.length - 1]),
      });
      folders.set(folderKey, existing);
    } catch {
      // Skip binary files
    }
  }

  const results: ParsedSkillFolder[] = [];

  for (const [folderName, files] of folders.entries()) {
    const mdFile = files.find((f) => f.type === "md") || files.find((f) => f.name.toLowerCase().includes("skill"));
    const fullContent = files.map((f) => `--- FILE: ${f.path} ---\n${f.content}`).join("\n\n");

    let skillName = folderName === "__root__" ? file.name.replace(/\.zip$/i, "") : folderName;
    let description = "";
    let keywords: string[] = [];

    if (mdFile) {
      const parsed = parseYamlFrontmatter(mdFile.content);
      if (parsed.name) skillName = parsed.name;
      if (parsed.description) description = parsed.description;
      if (parsed.keywords.length) keywords = parsed.keywords;
    }

    const configFile = files.find((f) => f.type === "json" && (f.name.includes("config") || f.name.includes("skill") || f.name.includes("package")));
    if (configFile) {
      try {
        const config = JSON.parse(configFile.content);
        if (!description && config.description) description = config.description;
        if (!keywords.length && config.keywords) keywords = config.keywords;
        if (config.name && !mdFile) skillName = config.name;
      } catch {}
    }

    const rootName = folderName === "__root__" ? skillName : folderName;
    const fileTree = buildFileTree(rootName, files);

    results.push({
      folderName: rootName,
      files,
      fileTree,
      skillName: skillName.toLowerCase().replace(/\s+/g, "_"),
      description: description || `Skill package: ${skillName}`,
      keywords: keywords.length ? keywords : [skillName.replace(/_/g, " ")],
      fullContent,
    });
  }

  return results;
}

export async function parseSingleFile(file: File): Promise<{ name: string; content: string } | null> {
  const ext = file.name.split(".").pop()?.toLowerCase() || "";
  if (!SUPPORTED_EXTENSIONS.includes(ext)) return null;
  try {
    const content = await file.text();
    if (content.length > MAX_FILE_SIZE) return null;
    return { name: file.name, content };
  } catch {
    return null;
  }
}
