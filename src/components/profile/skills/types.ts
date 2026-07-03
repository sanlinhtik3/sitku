export interface Skill {
  id: string;
  skill_name: string;
  description: string | null;
  trigger_keywords: string[] | null;
  is_active: boolean | null;
  use_count: number | null;
  last_used_at: string | null;
  version: number | null;
  created_at: string | null;
  created_by_agent: boolean | null;
  execution_steps: any;
  input_schema: any;
  output_format: string | null;
}

export interface ParsedSkillFile {
  name: string;
  path: string;
  content: string;
  size: number;
  type: "md" | "yaml" | "json" | "txt" | "other";
}

export interface FileTreeNode {
  name: string;
  path: string;
  isDir: boolean;
  children?: FileTreeNode[];
  content?: string;
  size?: number;
  type?: ParsedSkillFile["type"];
}

export interface ParsedSkillFolder {
  folderName: string;
  files: ParsedSkillFile[];
  fileTree: FileTreeNode;
  skillName: string;
  description: string;
  keywords: string[];
  fullContent: string;
}
